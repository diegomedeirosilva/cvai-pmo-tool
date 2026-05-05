import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdates, weeklyUpdateSections, actionItems } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { getAIProvider, WeeklyUpdateDeliverable } from "@/lib/ai/provider";
import { computeStatus } from "@/lib/dashboard";
import { ActionItem } from "@/types";

// Per-deliverable parallel calls — each takes ~5-10s, total fits in 60s
export const maxDuration = 60;

// Insert a blank line between bullets so wrapped lines stay tight but
// distinct bullets get visual breathing room.
function spaceBullets(text: string): string {
  if (!text) return "";
  // Normalize: collapse any existing multi-blank-lines to single blank lines
  return text
    .split(/\n/)
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => l !== "" || (arr[i - 1] && arr[i - 1].startsWith("-")))
    .join("\n")
    .replace(/\n(?=- )/g, "\n\n");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const provider = await getAIProvider();
    if (!provider.isAvailable()) {
      return NextResponse.json(
        { error: "AI not configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY" },
        { status: 400 }
      );
    }

    const [update] = await db
      .select()
      .from(weeklyUpdates)
      .where(eq(weeklyUpdates.id, params.id));

    if (!update) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sections = await db
      .select()
      .from(weeklyUpdateSections)
      .where(eq(weeklyUpdateSections.weeklyUpdateId, params.id))
      .orderBy(asc(weeklyUpdateSections.sortOrder));

    const items = await db
      .select()
      .from(actionItems)
      .orderBy(asc(actionItems.sortOrder));
    const typedItems = items as unknown as ActionItem[];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Build a deliverable per section, but skip ones where all items are "Not Started"
    type SectionWithDeliverable = {
      section: typeof sections[number];
      deliverable: WeeklyUpdateDeliverable | null; // null = skip (no activity)
    };

    const sectionDeliverables: SectionWithDeliverable[] = sections.map((section) => {
      const catItems = typedItems.filter((i) => i.category === section.deliverable);
      const allNotStarted = catItems.length > 0 && catItems.every((i) => computeStatus(i) === "Not Started");
      if (allNotStarted) {
        console.log(`[Generate] Skipping ${section.deliverable} — all items Not Started`);
        return { section, deliverable: null };
      }
      return {
        section,
        deliverable: {
          name: section.deliverable,
          items: catItems.map((i) => ({
            action: i.action,
            requirement: i.requirement,
            owner: i.owner,
            status: computeStatus(i),
            actualCompletionPct: i.actualCompletionPct,
            endDate: i.endDate,
            notes: i.notes,
            recentlyChanged: new Date(i.updatedAt) >= sevenDaysAgo,
          })),
        },
      };
    });

    const activeDeliverables = sectionDeliverables.filter((sd) => sd.deliverable !== null);
    console.log(`[Generate] Firing ${activeDeliverables.length}/${sections.length} parallel AI calls`);
    const startTime = Date.now();

    // Parallel calls — each is small/fast
    const results = await Promise.all(
      sectionDeliverables.map(async (sd) => {
        if (!sd.deliverable) {
          return { ok: true as const, skipped: true, deliverable: sd.section.deliverable, result: null };
        }
        try {
          const r = await provider.generateWeeklyUpdateForDeliverable(sd.deliverable);
          return { ok: true as const, skipped: false, deliverable: sd.deliverable.name, result: r };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[Generate] Failed for ${sd.deliverable.name}:`, msg);
          return { ok: false as const, skipped: false, deliverable: sd.deliverable.name, error: msg };
        }
      })
    );

    console.log(`[Generate] All AI calls done in ${Date.now() - startTime}ms`);

    // Save successful results
    const now = new Date();
    let matched = 0;
    let skipped = 0;
    const failures: string[] = [];

    const updatedSections = await Promise.all(
      sections.map(async (section, idx) => {
        const r = results[idx];

        // Skipped (all items Not Started) — clear AI fields, leave manual edits intact
        if (r.ok && r.skipped) {
          skipped++;
          const [updated] = await db
            .update(weeklyUpdateSections)
            .set({
              progressUpdate: "",
              nextSteps: "",
              aiGenerated: { progressUpdate: "", nextSteps: "", needsFromClient: "" },
              updatedAt: now,
            })
            .where(eq(weeklyUpdateSections.id, section.id))
            .returning();
          return updated;
        }

        if (!r.ok || !r.result || !r.result.progressUpdate) {
          if (!r.ok) failures.push(`${section.deliverable}: ${r.error}`);
          return section;
        }
        matched++;

        const progressUpdate = spaceBullets(r.result.progressUpdate);
        const nextSteps = spaceBullets(r.result.nextSteps);

        const [updated] = await db
          .update(weeklyUpdateSections)
          .set({
            progressUpdate,
            nextSteps,
            needsFromClient: "", // Always cleared on AI run — user fills manually
            aiGenerated: {
              progressUpdate,
              nextSteps,
              needsFromClient: "",
            },
            updatedAt: now,
          })
          .where(eq(weeklyUpdateSections.id, section.id))
          .returning();
        return updated;
      })
    );

    console.log(`[Generate] Matched ${matched}, skipped ${skipped}, total ${sections.length}`);

    if (matched === 0 && skipped === 0) {
      return NextResponse.json(
        { error: "AI returned no usable content. Failures: " + failures.join("; ") },
        { status: 502 }
      );
    }

    return NextResponse.json({
      sections: updatedSections,
      matched,
      skipped,
      total: sections.length,
      ...(failures.length > 0 && { warnings: failures }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Weekly update generate error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

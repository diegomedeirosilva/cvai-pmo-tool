import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdates, weeklyUpdateSections, actionItems } from "@/lib/db";
import { eq, asc, desc } from "drizzle-orm";
import { getAIProvider, WeeklyUpdateDeliverable } from "@/lib/ai/provider";
import { computeStatus } from "@/lib/dashboard";
import { ActionItem, WeeklyUpdateSection } from "@/types";

// Per-deliverable parallel calls — each takes ~5-10s, total fits in 60s
export const maxDuration = 60;

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

    // Find previous week's update for context
    const prevUpdates = await db
      .select()
      .from(weeklyUpdates)
      .where(eq(weeklyUpdates.status, "finalized"))
      .orderBy(desc(weeklyUpdates.weekStartDate))
      .limit(1);

    const prevSectionsMap = new Map<string, WeeklyUpdateSection>();
    if (prevUpdates.length > 0 && prevUpdates[0].id !== params.id) {
      const prevSections = await db
        .select()
        .from(weeklyUpdateSections)
        .where(eq(weeklyUpdateSections.weeklyUpdateId, prevUpdates[0].id));
      for (const s of prevSections) {
        prevSectionsMap.set(s.deliverable, s as unknown as WeeklyUpdateSection);
      }
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Build a deliverable per section
    const deliverables: WeeklyUpdateDeliverable[] = sections.map((section) => {
      const catItems = typedItems.filter((i) => i.category === section.deliverable);
      const prev = prevSectionsMap.get(section.deliverable);
      return {
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
        ...(prev && {
          previousUpdate: {
            progressUpdate: prev.progressUpdate,
            nextSteps: prev.nextSteps,
            needsFromClient: prev.needsFromClient,
          },
        }),
      };
    });

    console.log(`[Generate] Firing ${deliverables.length} parallel AI calls`);
    const startTime = Date.now();

    // Parallel calls — each is small/fast
    const results = await Promise.all(
      deliverables.map(async (d) => {
        try {
          const r = await provider.generateWeeklyUpdateForDeliverable(d);
          return { ok: true as const, deliverable: d.name, result: r };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[Generate] Failed for ${d.name}:`, msg);
          return { ok: false as const, deliverable: d.name, error: msg };
        }
      })
    );

    console.log(`[Generate] All AI calls done in ${Date.now() - startTime}ms`);

    // Save successful results
    const now = new Date();
    let matched = 0;
    const failures: string[] = [];

    const updatedSections = await Promise.all(
      sections.map(async (section, idx) => {
        const r = results[idx];
        if (!r.ok || !r.result.progressUpdate) {
          if (!r.ok) failures.push(`${section.deliverable}: ${r.error}`);
          return section;
        }
        matched++;

        const [updated] = await db
          .update(weeklyUpdateSections)
          .set({
            progressUpdate: r.result.progressUpdate,
            nextSteps: r.result.nextSteps,
            needsFromClient: r.result.needsFromClient,
            aiGenerated: {
              progressUpdate: r.result.progressUpdate,
              nextSteps: r.result.nextSteps,
              needsFromClient: r.result.needsFromClient,
            },
            updatedAt: now,
          })
          .where(eq(weeklyUpdateSections.id, section.id))
          .returning();
        return updated;
      })
    );

    console.log(`[Generate] Matched ${matched}/${sections.length} sections`);

    if (matched === 0) {
      return NextResponse.json(
        { error: "AI returned no usable content. Failures: " + failures.join("; ") },
        { status: 502 }
      );
    }

    return NextResponse.json({
      sections: updatedSections,
      matched,
      total: sections.length,
      ...(failures.length > 0 && { warnings: failures }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Weekly update generate error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

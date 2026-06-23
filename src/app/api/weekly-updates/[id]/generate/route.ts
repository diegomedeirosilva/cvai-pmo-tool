import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdates, weeklyUpdateSections, actionItems, uploads } from "@/lib/db";
import { eq, asc, desc } from "drizzle-orm";
import { getAIProvider, WeeklyUpdateDeliverable, WeeklyUpdateAIResult } from "@/lib/ai/provider";
import { computeStatus, computeHealth } from "@/lib/dashboard";
import { computeDiff } from "@/lib/diff-engine";
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

type Mode = "skip" | "rollup" | "ai";
type SectionPlan = {
  section: typeof weeklyUpdateSections.$inferSelect;
  mode: Mode;
  summaryLine: string;
  deliverable: WeeklyUpdateDeliverable | null; // only for mode "ai"
};
type GenResult = { ok: boolean; result: WeeklyUpdateAIResult | null; error?: string };

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

    // --- Reliable "comment changed this week" signal ---
    // The most recent upload's snapshot is last week's data (archived pre-replacement).
    // Diff it against current items (matched by workstream+requirement, stable across uploads)
    // to find items whose notes changed or that are newly added this cycle.
    const [lastUpload] = await db
      .select()
      .from(uploads)
      .orderBy(desc(uploads.uploadedAt))
      .limit(1);
    const prevItems = (lastUpload?.snapshot ?? []) as unknown as ActionItem[];
    const changedIds = new Set<string>();
    if (prevItems.length > 0) {
      const diff = computeDiff(prevItems, typedItems);
      for (const d of diff.items) {
        if (d.changeType === "added") changedIds.add(d.item.id);
        else if (d.changeType === "modified" && d.changes.some((c) => c.field === "Notes")) {
          changedIds.add(d.item.id);
        }
      }
    }

    // --- Classify each category: skip / rollup-only / full-AI ---
    const sectionPlans: SectionPlan[] = sections.map((section) => {
      const catItems = typedItems.filter((i) => i.category === section.deliverable);
      let completed = 0, overdue = 0, atRisk = 0;
      const openItems: ActionItem[] = [];
      for (const i of catItems) {
        const s = computeStatus(i);
        if (s === "Completed") completed++;
        else if (s === "Overdue") { overdue++; openItems.push(i); }
        else if (s === "At-risk") { atRisk++; openItems.push(i); }
        else if (s === "On-track") openItems.push(i);
        // "Not Started" is ignored entirely
      }
      const total = catItems.length;
      const health = computeHealth(total, completed, overdue, atRisk);
      const healthLabel = health === "Red" ? "at risk" : health === "Amber" ? "watch" : "on track";
      const summaryLine =
        `${completed}/${total} complete` +
        (overdue > 0 ? ` · ${overdue} overdue` : "") +
        ` · ${healthLabel}`;

      // Nothing meaningful (all Not Started or empty) → skip
      if (total === 0 || (openItems.length === 0 && completed === 0)) {
        return { section, mode: "skip" as const, summaryLine, deliverable: null };
      }
      // Completed work but no open items → deterministic rollup, no AI call
      if (openItems.length === 0) {
        return { section, mode: "rollup" as const, summaryLine, deliverable: null };
      }
      // Open work → full AI treatment over open items only
      return {
        section,
        mode: "ai" as const,
        summaryLine,
        deliverable: {
          name: section.deliverable,
          summaryLine,
          items: openItems.map((i) => ({
            action: i.action,
            requirement: i.requirement,
            owner: i.owner,
            status: computeStatus(i),
            actualCompletionPct: i.actualCompletionPct,
            endDate: i.endDate,
            notes: i.notes,
            commentChanged: changedIds.has(i.id),
          })),
        },
      };
    });

    const aiCount = sectionPlans.filter((sp) => sp.mode === "ai").length;
    console.log(`[Generate] Firing ${aiCount}/${sections.length} AI calls (rollup-only & skip handled deterministically)`);
    const startTime = Date.now();

    // Fire the AI only for full-AI sections; others resolve instantly.
    const results: GenResult[] = await Promise.all(
      sectionPlans.map(async (sp): Promise<GenResult> => {
        if (sp.mode !== "ai" || !sp.deliverable) {
          return { ok: true, result: null };
        }
        try {
          const r = await provider.generateWeeklyUpdateForDeliverable(sp.deliverable);
          return { ok: true, result: r };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[Generate] Failed for ${sp.section.deliverable}:`, msg);
          return { ok: false, result: null, error: msg };
        }
      })
    );

    console.log(`[Generate] All AI calls done in ${Date.now() - startTime}ms`);

    const now = new Date();
    let matched = 0;
    let skipped = 0;
    const failures: string[] = [];

    const updatedSections = await Promise.all(
      sections.map(async (section, idx) => {
        const sp = sectionPlans[idx];
        const r = results[idx];

        // SKIP — clear AI fields, leave manual edits intact
        if (sp.mode === "skip") {
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

        // ROLLUP-ONLY — deterministic single bullet, no AI
        if (sp.mode === "rollup") {
          matched++;
          const progressUpdate = `- ${sp.summaryLine}`;
          const [updated] = await db
            .update(weeklyUpdateSections)
            .set({
              progressUpdate,
              nextSteps: "",
              needsFromClient: "",
              aiGenerated: { progressUpdate, nextSteps: "", needsFromClient: "" },
              updatedAt: now,
            })
            .where(eq(weeklyUpdateSections.id, section.id))
            .returning();
          return updated;
        }

        // FULL-AI — prepend the deterministic rollup; never leave blank
        const rollupBullet = `- ${sp.summaryLine}`;
        let progressUpdate: string;
        let nextSteps: string;
        if (r.ok && r.result && r.result.progressUpdate) {
          progressUpdate = spaceBullets(`${rollupBullet}\n${r.result.progressUpdate}`);
          nextSteps = spaceBullets(r.result.nextSteps);
        } else {
          failures.push(`${section.deliverable}: ${r.error || "empty AI result"}`);
          progressUpdate = rollupBullet; // fallback so the category is never blank
          nextSteps = "";
        }
        matched++;

        const [updated] = await db
          .update(weeklyUpdateSections)
          .set({
            progressUpdate,
            nextSteps,
            needsFromClient: "", // Always cleared on AI run — user fills manually
            aiGenerated: { progressUpdate, nextSteps, needsFromClient: "" },
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

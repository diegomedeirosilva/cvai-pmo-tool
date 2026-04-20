import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdates, weeklyUpdateSections, actionItems } from "@/lib/db";
import { eq, asc, desc } from "drizzle-orm";
import { getAIProvider, WeeklyUpdateContext } from "@/lib/ai/provider";
import { computeStatus } from "@/lib/dashboard";
import { ActionItem, WeeklyUpdateSection } from "@/types";

// AI call can take 20-40 seconds for many deliverables
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

    // Get the current update and its sections
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

    // Get all action items
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

    let prevSectionsMap = new Map<string, WeeklyUpdateSection>();
    if (prevUpdates.length > 0 && prevUpdates[0].id !== params.id) {
      const prevSections = await db
        .select()
        .from(weeklyUpdateSections)
        .where(eq(weeklyUpdateSections.weeklyUpdateId, prevUpdates[0].id));
      for (const s of prevSections) {
        prevSectionsMap.set(s.deliverable, s as unknown as WeeklyUpdateSection);
      }
    }

    // Build AI context per deliverable
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const deliverables: WeeklyUpdateContext["deliverables"] = sections.map((section) => {
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

    console.log(`[Generate] Calling AI with ${deliverables.length} deliverables`);
    const results = await provider.generateWeeklyUpdate({ deliverables });
    console.log(`[Generate] AI returned ${results.length} results`);

    if (results.length === 0) {
      return NextResponse.json(
        { error: "AI returned no usable content. Try again or check server logs." },
        { status: 502 }
      );
    }

    // Save AI results to sections
    const now = new Date();
    let matched = 0;
    const updatedSections = await Promise.all(
      sections.map(async (section) => {
        const aiResult = results.find(
          (r) => (r.deliverable || "").toLowerCase().trim() === section.deliverable.toLowerCase().trim()
        );
        if (!aiResult) {
          console.log(`[Generate] No AI match for section: ${section.deliverable}`);
          return section;
        }
        matched++;

        const [updated] = await db
          .update(weeklyUpdateSections)
          .set({
            progressUpdate: aiResult.progressUpdate || "",
            nextSteps: aiResult.nextSteps || "",
            needsFromClient: aiResult.needsFromClient || "",
            aiGenerated: {
              progressUpdate: aiResult.progressUpdate || "",
              nextSteps: aiResult.nextSteps || "",
              needsFromClient: aiResult.needsFromClient || "",
            },
            updatedAt: now,
          })
          .where(eq(weeklyUpdateSections.id, section.id))
          .returning();
        return updated;
      })
    );

    console.log(`[Generate] Matched ${matched}/${sections.length} sections`);
    return NextResponse.json({ sections: updatedSections, matched, total: sections.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Weekly update generate error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

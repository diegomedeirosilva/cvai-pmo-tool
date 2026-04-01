import { NextResponse } from "next/server";
import { db, actionItems, projects, risks } from "@/lib/db";
import { asc } from "drizzle-orm";
import { getAIProvider, SummaryContext } from "@/lib/ai/provider";
import { buildDashboardSummary } from "@/lib/dashboard";
import { ActionItem, Project, Risk } from "@/types";

export async function POST() {
  try {
    const provider = await getAIProvider();

    if (!provider.isAvailable()) {
      return NextResponse.json({
        summary:
          "AI summary unavailable — configure ANTHROPIC_API_KEY or OPENAI_API_KEY to enable this feature.",
      });
    }

    // Run all DB queries in parallel for speed
    const [projectRows, items, riskRows] = await Promise.all([
      db.select().from(projects).limit(1),
      db.select().from(actionItems).orderBy(asc(actionItems.sortOrder)),
      db.select().from(risks),
    ]);

    if (projectRows.length === 0) {
      return NextResponse.json({ summary: "No project data loaded yet." });
    }

    const summary = buildDashboardSummary(
      projectRows[0] as unknown as Project,
      items as unknown as ActionItem[],
      riskRows as unknown as Risk[]
    );

    const ctx: SummaryContext = {
      projectTitle: summary.project.title,
      day1TargetDate: summary.project.day1TargetDate,
      daysRemaining: summary.daysToDay1,
      total: summary.totalItems,
      notStarted: summary.notStarted,
      completed: summary.completed,
      onTrack: summary.onTrack,
      atRisk: summary.atRisk,
      overdue: summary.overdue,
      workstreamSummary: summary.workstreamHealth,
      topRisks: riskRows.slice(0, 5) as unknown as Risk[],
      upcomingMilestones: summary.upcomingMilestones,
    };

    const aiSummary = await provider.generateSummary(ctx);
    return NextResponse.json({ summary: aiSummary });
  } catch (e) {
    console.error("AI summary error:", e);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}

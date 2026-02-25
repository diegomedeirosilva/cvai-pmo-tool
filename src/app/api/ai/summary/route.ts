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

    const projectRows = await db.select().from(projects).limit(1);
    if (projectRows.length === 0) {
      return NextResponse.json({ summary: "No project data loaded yet." });
    }

    const items = await db
      .select()
      .from(actionItems)
      .orderBy(asc(actionItems.sortOrder));
    const riskRows = await db.select().from(risks);

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
      completed: summary.completed,
      onTrack: summary.onTrack,
      notStarted: summary.notStarted,
      delayed: summary.delayed,
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

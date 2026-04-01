import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, actionItems, risks } from "@/lib/db/schema";
import { desc, asc } from "drizzle-orm";
import { buildDashboardSummary, buildOwnerStats } from "@/lib/dashboard";

export async function GET() {
  try {
    const [project] = await db.select().from(projects).orderBy(desc(projects.createdAt)).limit(1);
    if (!project) {
      return NextResponse.json({ error: "No project found" }, { status: 404 });
    }

    const items = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));
    const allRisks = await db.select().from(risks);

    const mapped = items.map((i) => ({
      id: i.id,
      workstream: i.workstream,
      category: i.category,
      requirement: i.requirement,
      action: i.action,
      owner: i.owner,
      status: i.status as "Not Started" | "Completed" | "On-track" | "At-risk" | "Overdue",
      startDate: i.startDate,
      duration: i.duration,
      endDate: i.endDate,
      targetCompletionPct: i.targetCompletionPct,
      actualCompletionPct: i.actualCompletionPct,
      notes: i.notes ?? "",
      sortOrder: i.sortOrder,
      createdAt: i.createdAt?.toISOString() ?? "",
      updatedAt: i.updatedAt?.toISOString() ?? "",
    }));

    const mappedRisks = allRisks.map((r) => ({
      id: r.id,
      type: r.type as any,
      severity: r.severity as any,
      affectedItemIds: (r.affectedItemIds as string[]) || [],
      owners: (r.owners as string[]) || [],
      description: r.description,
      suggestedMitigation: r.suggestedMitigation,
      riskStatus: r.riskStatus as any,
      workstream: r.workstream,
      createdAt: r.createdAt?.toISOString() ?? "",
      updatedAt: r.updatedAt?.toISOString() ?? "",
    }));

    const summary = buildDashboardSummary(
      {
        id: project.id,
        title: project.title,
        description: project.description ?? "",
        day1TargetDate: project.day1TargetDate,
        createdAt: project.createdAt?.toISOString() ?? "",
        updatedAt: project.updatedAt?.toISOString() ?? "",
      },
      mapped,
      mappedRisks
    );

    const ownerStats = buildOwnerStats(mapped);

    return NextResponse.json({
      summary,
      risks: mappedRisks,
      items: mapped,
      ownerStats,
    });
  } catch (error) {
    console.error("Report data error:", error);
    return NextResponse.json({ error: "Failed to fetch report data" }, { status: 500 });
  }
}

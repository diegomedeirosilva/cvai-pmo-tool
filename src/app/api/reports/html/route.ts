import { NextRequest, NextResponse } from "next/server";
import { db, projects, actionItems, risks, weeklyUpdates, weeklyUpdateSections } from "@/lib/db";
import { desc, asc, eq } from "drizzle-orm";
import { buildDashboardSummary, buildOwnerStats, computeStatus, computeHealth } from "@/lib/dashboard";
import { buildHtmlReport, ReportSection } from "@/lib/reports/html-report";
import { ActionItem, Risk } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const [project] = await db.select().from(projects).orderBy(desc(projects.createdAt)).limit(1);
    if (!project) {
      return new NextResponse("No project found. Upload a workplan first.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const rawItems = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));
    const allRisks = await db.select().from(risks);

    const items: ActionItem[] = rawItems.map((i) => ({
      id: i.id,
      workstream: i.workstream,
      category: i.category,
      requirement: i.requirement,
      action: i.action,
      owner: i.owner,
      status: i.status as ActionItem["status"],
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

    const mappedRisks: Risk[] = allRisks.map((r) => ({
      id: r.id,
      type: r.type as Risk["type"],
      severity: r.severity as Risk["severity"],
      affectedItemIds: (r.affectedItemIds as string[]) || [],
      owners: (r.owners as string[]) || [],
      description: r.description,
      suggestedMitigation: r.suggestedMitigation,
      riskStatus: r.riskStatus as Risk["riskStatus"],
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
      items,
      mappedRisks
    );
    const ownerStats = buildOwnerStats(items);

    // Latest weekly update (most recent week) + its sections, with computed health/itemCount
    const [latestUpdate] = await db
      .select()
      .from(weeklyUpdates)
      .orderBy(desc(weeklyUpdates.weekStartDate))
      .limit(1);

    let weeklySections: ReportSection[] = [];
    let weekLabel: string | undefined;
    if (latestUpdate) {
      weekLabel = latestUpdate.weekLabel;
      const secs = await db
        .select()
        .from(weeklyUpdateSections)
        .where(eq(weeklyUpdateSections.weeklyUpdateId, latestUpdate.id))
        .orderBy(asc(weeklyUpdateSections.sortOrder));
      weeklySections = secs.map((s) => {
        const catItems = items.filter((i) => i.category === s.deliverable);
        let completed = 0, overdue = 0, atRisk = 0;
        for (const item of catItems) {
          const st = computeStatus(item);
          if (st === "Completed") completed++;
          else if (st === "Overdue") overdue++;
          else if (st === "At-risk") atRisk++;
        }
        return {
          deliverable: s.deliverable,
          progressUpdate: s.progressUpdate ?? "",
          nextSteps: s.nextSteps ?? "",
          needsFromClient: s.needsFromClient ?? "",
          health: computeHealth(catItems.length, completed, overdue, atRisk),
          itemCount: catItems.length,
        };
      });
    }

    const generatedAt = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const html = buildHtmlReport({ summary, risks: mappedRisks, items, weeklySections, weekLabel, generatedAt });

    const download = req.nextUrl.searchParams.get("download") === "1";
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
    if (download) {
      const safe = (project.title || "PMO").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
      headers["Content-Disposition"] = `attachment; filename="${safe}_Executive_Report.html"`;
    }
    return new NextResponse(html, { headers });
  } catch (e) {
    console.error("HTML report error:", e);
    return new NextResponse("Failed to build report.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

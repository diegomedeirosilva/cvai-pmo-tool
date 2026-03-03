import { db, actionItems, projects, risks, snapshots } from "@/lib/db";
import { asc } from "drizzle-orm";
import { buildDashboardSummary } from "@/lib/dashboard";
import { ActionItem, Project, Risk } from "@/types";

export async function takeSnapshot(source: "manual" | "upload" | "cron") {
  const projectRows = await db.select().from(projects).limit(1);
  if (projectRows.length === 0) return null;

  const items = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));
  const riskRows = await db.select().from(risks);

  const summary = buildDashboardSummary(
    projectRows[0] as unknown as Project,
    items as unknown as ActionItem[],
    riskRows as unknown as Risk[]
  );

  const today = new Date().toISOString().split("T")[0];

  const [inserted] = await db.insert(snapshots).values({
    snapshotDate: today,
    totalItems: summary.totalItems,
    completed: summary.completed,
    onTrack: summary.onTrack,
    notStarted: summary.notStarted,
    delayed: summary.delayed,
    overdue: summary.overdue,
    overallHealth: summary.overallHealth,
    workstreamData: summary.workstreamHealth,
    source,
  }).returning();

  return inserted;
}

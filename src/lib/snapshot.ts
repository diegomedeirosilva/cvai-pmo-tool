import { db, actionItems, projects, risks, snapshots } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
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

  // Delete any existing snapshot for today before inserting to avoid duplicates
  await db.delete(snapshots).where(eq(snapshots.snapshotDate, today));

  const [inserted] = await db.insert(snapshots).values({
    snapshotDate: today,
    totalItems: summary.totalItems,
    notStarted: summary.notStarted,
    completed: summary.completed,
    onTrack: summary.onTrack,
    atRisk: summary.atRisk,
    overdue: summary.overdue,
    overallHealth: summary.overallHealth,
    workstreamData: summary.workstreamHealth,
    source,
  }).returning();

  return inserted;
}

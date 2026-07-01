import { db, actionItems, projects, dependencies, snapshots } from "@/lib/db";
import { asc, desc } from "drizzle-orm";
import { buildDashboardSummary } from "@/lib/dashboard";
import { takeSnapshot } from "@/lib/snapshot";
import { ActionItem, Project } from "@/types";
import DashboardClient from "@/components/dashboard/DashboardClient";
import EmptyState from "@/components/dashboard/EmptyState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  try {
    const projectRows = await db.select().from(projects).limit(1);

    if (projectRows.length === 0) {
      return <EmptyState />;
    }

    // Weekly trend snapshot (usage-driven): record a point if the newest one is
    // over a week old. History accumulates as the dashboard is used — no cron
    // needed. Change the "7" to adjust the cadence.
    try {
      const [latest] = await db
        .select({ d: snapshots.snapshotDate })
        .from(snapshots)
        .orderBy(desc(snapshots.snapshotDate))
        .limit(1);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      cutoff.setHours(0, 0, 0, 0);
      if (!latest || new Date(latest.d + "T00:00:00") < cutoff) {
        await takeSnapshot("auto");
      }
    } catch (e) {
      console.error("Weekly snapshot check failed:", e);
    }

    const [items, deps] = await Promise.all([
      db.select().from(actionItems).orderBy(asc(actionItems.sortOrder)),
      db.select({ predecessorId: dependencies.predecessorId, successorId: dependencies.successorId }).from(dependencies),
    ]);

    const summary = buildDashboardSummary(
      projectRows[0] as unknown as Project,
      items as unknown as ActionItem[],
      []
    );

    return <DashboardClient summary={summary} items={items as unknown as ActionItem[]} dependencies={deps} />;
  } catch (e) {
    console.error("Dashboard error:", e);
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <strong>Database not connected.</strong> Please configure DATABASE_URL in .env.local
        </div>
      </div>
    );
  }
}

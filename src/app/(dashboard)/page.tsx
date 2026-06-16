import { db, actionItems, projects, dependencies } from "@/lib/db";
import { asc } from "drizzle-orm";
import { buildDashboardSummary } from "@/lib/dashboard";
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

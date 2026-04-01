import { db, actionItems, dependencies, categorySummaries } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
import { ActionItem, Dependency } from "@/types";
import WorkstreamView from "@/components/workstreams/WorkstreamView";
import { computeStatus } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: { slug: string };
}

export default async function WorkstreamPage({ params }: Props) {
  const workstream = decodeURIComponent(params.slug);

  const items = await db
    .select()
    .from(actionItems)
    .where(eq(actionItems.workstream, workstream))
    .orderBy(asc(actionItems.sortOrder));

  const cats = await db
    .select()
    .from(categorySummaries)
    .where(eq(categorySummaries.workstream, workstream));

  const deps = await db.select().from(dependencies);

  // Fetch all items for the predecessor dropdown (cross-workstream deps)
  const allItemsRaw = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));

  const typedItems = items as unknown as ActionItem[];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = {
    total: typedItems.length,
    completed: typedItems.filter((i) => computeStatus(i) === "Completed").length,
    onTrack: typedItems.filter((i) => computeStatus(i) === "On-track").length,
    atRisk: typedItems.filter((i) => computeStatus(i) === "At-risk").length,
    overdue: typedItems.filter((i) => computeStatus(i) === "Overdue").length,
  };

  return (
    <WorkstreamView
      workstream={workstream}
      items={typedItems}
      categorySummaries={cats}
      dependencies={deps as unknown as Dependency[]}
      stats={stats}
      allItems={allItemsRaw as unknown as ActionItem[]}
    />
  );
}

import { db, actionItems, dependencies, projects } from "@/lib/db";
import { asc } from "drizzle-orm";
import { ActionItem, Dependency, Project } from "@/types";
import GanttChart from "@/components/gantt/GanttChart";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GanttPage() {
  const projectRows = await db.select().from(projects).limit(1);
  const items = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));
  const deps = await db.select().from(dependencies);

  return (
    <GanttChart
      items={items as unknown as ActionItem[]}
      dependencies={deps as unknown as Dependency[]}
      project={projectRows[0] as unknown as Project | null}
    />
  );
}

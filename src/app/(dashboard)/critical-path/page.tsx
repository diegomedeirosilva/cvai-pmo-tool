import { db, actionItems, dependencies, projects } from "@/lib/db";
import { asc } from "drizzle-orm";
import { ActionItem, Dependency, Project } from "@/types";
import { computeCriticalPath } from "@/lib/critical-path";
import CriticalPathClient from "./CriticalPathClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CriticalPathPage() {
  const projectRows = await db.select().from(projects).limit(1);
  const items = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));
  const deps = await db.select().from(dependencies);

  const typedItems = items as unknown as ActionItem[];
  const typedDeps = deps as unknown as Dependency[];
  const project = (projectRows[0] as unknown as Project) ?? null;

  const day1 = project?.day1TargetDate ?? "2026-08-14";
  const result = computeCriticalPath(typedItems, typedDeps, day1);

  return (
    <CriticalPathClient
      items={typedItems}
      dependencies={typedDeps}
      project={project}
      criticalIds={Array.from(result.criticalIds)}
      totalDays={result.totalDays}
      chain={result.chain}
      floatDays={result.floatDays}
    />
  );
}

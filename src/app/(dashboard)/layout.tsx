import { db } from "@/lib/db";
import { actionItems } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import Sidebar from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Derive workstream list from action items in DB (preserving sort order)
  const rows = await db
    .select({ workstream: actionItems.workstream, sortOrder: actionItems.sortOrder })
    .from(actionItems)
    .orderBy(asc(actionItems.sortOrder));

  const seen = new Set<string>();
  const workstreams: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.workstream)) {
      seen.add(r.workstream);
      workstreams.push(r.workstream);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar workstreams={workstreams} />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}

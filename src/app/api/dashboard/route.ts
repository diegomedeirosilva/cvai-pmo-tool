import { NextResponse } from "next/server";
import { db, actionItems, projects } from "@/lib/db";
import { asc } from "drizzle-orm";
import { buildDashboardSummary } from "@/lib/dashboard";
import { ActionItem, Project } from "@/types";

// Reads the DB with no-store; must render per-request, never prerendered at build.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projectRows = await db.select().from(projects).limit(1);
    if (projectRows.length === 0) {
      return NextResponse.json({ empty: true });
    }

    const items = await db
      .select()
      .from(actionItems)
      .orderBy(asc(actionItems.sortOrder));

    const summary = buildDashboardSummary(
      projectRows[0] as unknown as Project,
      items as unknown as ActionItem[]
    );

    return NextResponse.json(summary);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { db, actionItems, dependencies, projects } from "@/lib/db";
import { asc } from "drizzle-orm";
import { exportRoundTrip } from "@/lib/excel/exporter";
import { ActionItem, Dependency, Project } from "@/types";

// Reads the DB per-request; never prerendered at build.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projectRows = await db.select().from(projects).limit(1);
    if (projectRows.length === 0) {
      return NextResponse.json({ error: "No project data" }, { status: 404 });
    }

    const items = await db
      .select()
      .from(actionItems)
      .orderBy(asc(actionItems.sortOrder));

    const project = projectRows[0] as unknown as Project;
    const typedItems = items as unknown as ActionItem[];

    const deps = await db.select().from(dependencies);
    const buffer = await exportRoundTrip(project, typedItems, deps as unknown as Dependency[]);
    const filename = `JV_Readiness_Plan_Export.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (e) {
    console.error("Export error:", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

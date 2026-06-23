import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";

// Reads the DB with no-store; must render per-request, never prerendered at build.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(projects).limit(1);
    if (rows.length === 0) {
      return NextResponse.json(null);
    }
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = await db.select().from(projects).limit(1);

    if (rows.length === 0) {
      const inserted = await db
        .insert(projects)
        .values({
          title: body.title,
          description: body.description || "",
          day1TargetDate: body.day1TargetDate,
        })
        .returning();
      return NextResponse.json(inserted[0]);
    } else {
      const updated = await db
        .update(projects)
        .set({
          title: body.title,
          description: body.description || "",
          day1TargetDate: body.day1TargetDate,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, rows[0].id))
        .returning();
      return NextResponse.json(updated[0]);
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

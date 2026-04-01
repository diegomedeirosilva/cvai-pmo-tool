import { NextRequest, NextResponse } from "next/server";
import { db, actionItems } from "@/lib/db";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(actionItems)
      .orderBy(asc(actionItems.sortOrder));
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Get max sort order
    const existing = await db.select().from(actionItems);
    const maxOrder = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0);

    const inserted = await db
      .insert(actionItems)
      .values({
        workstream: body.workstream,
        category: body.category,
        requirement: body.requirement || "",
        action: body.action || "",
        owner: body.owner || "",
        status: body.status || "On-track",
        startDate: body.startDate,
        duration: body.duration || 0,
        endDate: body.endDate,
        targetCompletionPct: body.targetCompletionPct || 0,
        actualCompletionPct: body.actualCompletionPct || 0,
        notes: body.notes || "",
        sortOrder: maxOrder + 1,
      })
      .returning();
    return NextResponse.json(inserted[0]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

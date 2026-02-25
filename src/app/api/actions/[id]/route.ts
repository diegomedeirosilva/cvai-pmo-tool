import { NextRequest, NextResponse } from "next/server";
import { db, actionItems } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const updated = await db
      .update(actionItems)
      .set({
        workstream: body.workstream,
        category: body.category,
        requirement: body.requirement,
        action: body.action,
        owner: body.owner,
        status: body.status,
        startDate: body.startDate,
        duration: body.duration,
        endDate: body.endDate,
        targetCompletionPct: body.targetCompletionPct,
        notes: body.notes,
        updatedAt: new Date(),
      })
      .where(eq(actionItems.id, params.id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated[0]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.delete(actionItems).where(eq(actionItems.id, params.id));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdates, weeklyUpdateSections } from "@/lib/db";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [update] = await db
      .select()
      .from(weeklyUpdates)
      .where(eq(weeklyUpdates.id, params.id));

    if (!update) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sections = await db
      .select()
      .from(weeklyUpdateSections)
      .where(eq(weeklyUpdateSections.weeklyUpdateId, params.id))
      .orderBy(asc(weeklyUpdateSections.sortOrder));

    return NextResponse.json({ ...update, sections });
  } catch (e) {
    console.error("Weekly update GET error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const [updated] = await db
      .update(weeklyUpdates)
      .set({
        ...(body.status !== undefined && { status: body.status }),
        ...(body.weekLabel !== undefined && { weekLabel: body.weekLabel }),
        updatedAt: new Date(),
      })
      .where(eq(weeklyUpdates.id, params.id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("Weekly update PATCH error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.delete(weeklyUpdates).where(eq(weeklyUpdates.id, params.id));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Weekly update DELETE error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

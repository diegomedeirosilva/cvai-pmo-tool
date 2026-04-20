import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdates, weeklyUpdateSections, actionItems } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { computeStatus, computeHealth } from "@/lib/dashboard";
import { ActionItem } from "@/types";

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

    // Compute health per section based on its category's action items
    const items = await db.select().from(actionItems);
    const typedItems = items as unknown as ActionItem[];
    const sectionsWithHealth = sections.map((s) => {
      const catItems = typedItems.filter((i) => i.category === s.deliverable);
      let completed = 0, overdue = 0, atRisk = 0;
      for (const item of catItems) {
        const status = computeStatus(item);
        if (status === "Completed") completed++;
        else if (status === "Overdue") overdue++;
        else if (status === "At-risk") atRisk++;
      }
      const health = computeHealth(catItems.length, completed, overdue, atRisk);
      return { ...s, health, itemCount: catItems.length };
    });

    return NextResponse.json({ ...update, sections: sectionsWithHealth });
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

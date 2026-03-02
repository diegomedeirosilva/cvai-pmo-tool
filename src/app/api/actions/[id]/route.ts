import { NextRequest, NextResponse } from "next/server";
import { db, actionItems, dependencies } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ActionItem, Dependency } from "@/types";
import { computeCascade, wouldCreateCycle } from "@/lib/cascade";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const itemId = params.id;
    const predecessorId: string | null | undefined = body.predecessorId;

    // 1. Update the action item itself
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
        actualCompletionPct: body.actualCompletionPct,
        notes: body.notes,
        updatedAt: new Date(),
      })
      .where(eq(actionItems.id, itemId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 2. Handle dependency change (only if predecessorId key is in the body)
    if (predecessorId !== undefined) {
      // Remove existing predecessor dependency for this item
      await db.delete(dependencies).where(eq(dependencies.successorId, itemId));

      if (predecessorId !== null) {
        // Check for circular dependency before inserting
        const allDeps = await db.select().from(dependencies);
        const typedDeps = allDeps as unknown as Dependency[];

        if (wouldCreateCycle(predecessorId, itemId, typedDeps)) {
          return NextResponse.json(
            { error: "Cannot add dependency: would create a circular reference" },
            { status: 400 }
          );
        }

        await db.insert(dependencies).values({
          predecessorId: predecessorId,
          successorId: itemId,
        });
      }
    }

    // 3. Cascade dates to all downstream successors
    const allItems = await db.select().from(actionItems);
    const allDeps = await db.select().from(dependencies);
    const typedItems = allItems as unknown as ActionItem[];
    const typedDeps = allDeps as unknown as Dependency[];

    const cascadeChanges = computeCascade(itemId, typedItems, typedDeps);

    // 4. Persist cascaded date changes
    for (const change of cascadeChanges) {
      await db
        .update(actionItems)
        .set({
          startDate: change.startDate,
          endDate: change.endDate,
          updatedAt: new Date(),
        })
        .where(eq(actionItems.id, change.id));
    }

    // 5. Re-fetch all changed items for the response
    const updatedItems: unknown[] = [updated[0]];
    for (const change of cascadeChanges) {
      const rows = await db
        .select()
        .from(actionItems)
        .where(eq(actionItems.id, change.id));
      if (rows.length > 0) updatedItems.push(rows[0]);
    }

    return NextResponse.json({
      ...updated[0],
      updatedItems,
    });
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

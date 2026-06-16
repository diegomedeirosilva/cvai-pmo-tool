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

    // 0. Fetch existing item to capture baseline before first date change
    const [existing] = await db.select().from(actionItems).where(eq(actionItems.id, itemId));
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 1. Update the action item — set baseline from pre-update dates if not yet set
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
        baselineStartDate: existing.baselineStartDate ?? existing.startDate,
        baselineEndDate: existing.baselineEndDate ?? existing.endDate,
        updatedAt: new Date(),
      })
      .where(eq(actionItems.id, itemId))
      .returning();

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

    // 3. Check if cascade is needed (does this item have downstream successors?)
    const directSuccessors = await db
      .select({ id: dependencies.id })
      .from(dependencies)
      .where(eq(dependencies.predecessorId, itemId));

    const updatedItems: unknown[] = [updated[0]];

    if (directSuccessors.length > 0) {
      // Has successors — full cascade needed
      const allItems = await db.select().from(actionItems);
      const allDeps = await db.select().from(dependencies);
      const typedItems = allItems as unknown as ActionItem[];
      const typedDeps = allDeps as unknown as Dependency[];

      const cascadeChanges = computeCascade(itemId, typedItems, typedDeps);

      const now = new Date();
      await Promise.all(
        cascadeChanges.map((change) => {
          const orig = typedItems.find((i) => i.id === change.id);
          return db.update(actionItems)
            .set({
              startDate: change.startDate,
              endDate: change.endDate,
              // Preserve baseline from pre-cascade dates if not yet set
              baselineStartDate: orig?.baselineStartDate ?? orig?.startDate,
              baselineEndDate: orig?.baselineEndDate ?? orig?.endDate,
              updatedAt: now,
            })
            .where(eq(actionItems.id, change.id));
        })
      );

      for (const change of cascadeChanges) {
        const orig = typedItems.find((i) => i.id === change.id);
        if (orig) {
          const dur = Math.max(Math.round((new Date(change.endDate).getTime() - new Date(change.startDate).getTime()) / 86400000), 0);
          updatedItems.push({ ...orig, startDate: change.startDate, endDate: change.endDate, duration: dur, updatedAt: now.toISOString() });
        }
      }
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

import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdates, weeklyUpdateSections, actionItems } from "@/lib/db";
import { desc, eq, asc } from "drizzle-orm";
import { computeStatus, computeHealth } from "@/lib/dashboard";
import { ActionItem } from "@/types";

export async function GET() {
  try {
    const updates = await db
      .select()
      .from(weeklyUpdates)
      .orderBy(desc(weeklyUpdates.weekStartDate));

    // Fetch all items once and compute health per category
    const items = await db.select().from(actionItems);
    const typedItems = items as unknown as ActionItem[];
    const healthByCategory = new Map<string, { health: "Green" | "Amber" | "Red"; itemCount: number }>();
    const byCategory = new Map<string, ActionItem[]>();
    for (const item of typedItems) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category)!.push(item);
    }
    for (const [cat, catItems] of byCategory) {
      let completed = 0, overdue = 0, atRisk = 0;
      for (const item of catItems) {
        const status = computeStatus(item);
        if (status === "Completed") completed++;
        else if (status === "Overdue") overdue++;
        else if (status === "At-risk") atRisk++;
      }
      healthByCategory.set(cat, {
        health: computeHealth(catItems.length, completed, overdue, atRisk),
        itemCount: catItems.length,
      });
    }

    // Fetch sections for each update
    const result = await Promise.all(
      updates.map(async (u) => {
        const sections = await db
          .select()
          .from(weeklyUpdateSections)
          .where(eq(weeklyUpdateSections.weeklyUpdateId, u.id))
          .orderBy(asc(weeklyUpdateSections.sortOrder));
        const sectionsWithHealth = sections.map((s) => {
          const hc = healthByCategory.get(s.deliverable);
          return { ...s, health: hc?.health, itemCount: hc?.itemCount ?? 0 };
        });
        return { ...u, sections: sectionsWithHealth };
      })
    );

    return NextResponse.json(result);
  } catch (e) {
    console.error("Weekly updates GET error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const weekStartDate: string = body.weekStartDate;
    const weekLabel: string = body.weekLabel;

    // Create the weekly update
    const [update] = await db
      .insert(weeklyUpdates)
      .values({ weekLabel, weekStartDate, status: "draft" })
      .returning();

    // Get all action items to determine active categories
    const items = await db
      .select()
      .from(actionItems)
      .orderBy(asc(actionItems.sortOrder));
    const typedItems = items as unknown as ActionItem[];

    // Group by category, filter out fully completed or fully not-started
    const categoryMap = new Map<string, ActionItem[]>();
    for (const item of typedItems) {
      if (!categoryMap.has(item.category)) categoryMap.set(item.category, []);
      categoryMap.get(item.category)!.push(item);
    }

    const activeCategories: string[] = [];
    for (const [cat, catItems] of categoryMap) {
      const allCompleted = catItems.every((i) => computeStatus(i) === "Completed");
      const allNotStarted = catItems.every((i) => computeStatus(i) === "Not Started");
      if (!allCompleted && !allNotStarted) {
        activeCategories.push(cat);
      }
    }

    // Create sections for active categories
    const sectionValues = activeCategories.map((cat, i) => ({
      weeklyUpdateId: update.id,
      deliverable: cat,
      sortOrder: i,
    }));

    let sections: unknown[] = [];
    if (sectionValues.length > 0) {
      sections = await db
        .insert(weeklyUpdateSections)
        .values(sectionValues)
        .returning();
    }

    return NextResponse.json({ ...update, sections });
  } catch (e) {
    console.error("Weekly updates POST error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

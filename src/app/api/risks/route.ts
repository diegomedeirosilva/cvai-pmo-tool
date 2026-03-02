import { NextRequest, NextResponse } from "next/server";
import { db, actionItems, dependencies, risks, projects } from "@/lib/db";
import { detectRisks } from "@/lib/risk-engine/rules";
import { asc, eq, ne } from "drizzle-orm";
import { ActionItem, Dependency } from "@/types";

export async function GET() {
  try {
    const rows = await db.select().from(risks).orderBy(asc(risks.createdAt));
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// Regenerate risks based on current data
export async function POST() {
  try {
    const projectRows = await db.select().from(projects).limit(1);
    if (projectRows.length === 0) {
      return NextResponse.json({ error: "No project found" }, { status: 404 });
    }

    const items = await db
      .select()
      .from(actionItems)
      .orderBy(asc(actionItems.sortOrder));
    const deps = await db.select().from(dependencies);

    const detectedRisks = detectRisks(
      items as unknown as ActionItem[],
      deps as unknown as Dependency[],
      projectRows[0].day1TargetDate
    );

    // Clear all rule-based risks and reinsert (keep AI-Inferred)
    await db.delete(risks).where(ne(risks.type, "AI-Inferred"));

    // Insert new risks
    let insertedRisks: typeof risks.$inferSelect[] = [];
    if (detectedRisks.length > 0) {
      insertedRisks = await db.insert(risks).values(detectedRisks).returning();
    }

    // Return full risk list (including AI-Inferred) so UI stays in sync
    const allRisks = await db.select().from(risks).orderBy(asc(risks.createdAt));
    return NextResponse.json({ count: insertedRisks.length, risks: allRisks });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, riskStatus } = body;
    const updated = await db
      .update(risks)
      .set({ riskStatus, updatedAt: new Date() })
      .where(eq(risks.id, id))
      .returning();
    return NextResponse.json(updated[0]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

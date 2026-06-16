import { NextResponse } from "next/server";
import { db, actionItems } from "@/lib/db";
import { isNull, sql } from "drizzle-orm";

export async function POST() {
  try {
    const result = await db
      .update(actionItems)
      .set({
        baselineStartDate: sql`start_date`,
        baselineEndDate: sql`end_date`,
      })
      .where(isNull(actionItems.baselineEndDate))
      .returning({ id: actionItems.id });

    return NextResponse.json({ updated: result.length });
  } catch (e) {
    console.error("Set baseline error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

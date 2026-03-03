import { NextRequest, NextResponse } from "next/server";
import { db, snapshots } from "@/lib/db";
import { desc } from "drizzle-orm";
import { takeSnapshot } from "@/lib/snapshot";

export async function GET() {
  try {
    const rows = await db.select().from(snapshots).orderBy(desc(snapshots.snapshotDate));
    return NextResponse.json(rows);
  } catch (e) {
    console.error("Snapshot GET error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const source = (cronSecret && authHeader === `Bearer ${cronSecret}`) ? "cron" : "manual";

    const result = await takeSnapshot(source as "manual" | "cron");
    if (!result) {
      return NextResponse.json({ error: "No project data" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("Snapshot POST error:", e);
    return NextResponse.json({ error: "Failed to take snapshot" }, { status: 500 });
  }
}

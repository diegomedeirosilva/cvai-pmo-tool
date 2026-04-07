import { NextResponse } from "next/server";
import { db, uploads, snapshots } from "@/lib/db";
import { asc } from "drizzle-orm";
import { computeHealth, computeStatus } from "@/lib/dashboard";
import { ActionItem } from "@/types";

export async function POST() {
  try {
    // Clear existing snapshots so we can recompute with current status logic
    await db.delete(snapshots);

    const uploadRows = await db.select().from(uploads).orderBy(asc(uploads.uploadedAt));
    let inserted = 0;

    for (const upload of uploadRows) {
      const items = upload.snapshot as unknown as ActionItem[];
      if (!items || items.length === 0) continue;

      // Use the upload date as the reference for status computation
      const asOfDate = new Date(upload.uploadedAt);

      let notStarted = 0, completed = 0, onTrack = 0, atRisk = 0, overdue = 0;
      const wsMap = new Map<string, { total: number; notStarted: number; completed: number; onTrack: number; atRisk: number; overdue: number }>();

      for (const item of items) {
        const status = computeStatus(item, asOfDate);
        switch (status) {
          case "Not Started": notStarted++; break;
          case "Completed": completed++; break;
          case "On-track": onTrack++; break;
          case "At-risk": atRisk++; break;
          case "Overdue": overdue++; break;
        }

        if (!wsMap.has(item.workstream)) {
          wsMap.set(item.workstream, { total: 0, notStarted: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0 });
        }
        const ws = wsMap.get(item.workstream)!;
        ws.total++;
        const wsStatus = computeStatus(item, asOfDate);
        switch (wsStatus) {
          case "Not Started": ws.notStarted++; break;
          case "Completed": ws.completed++; break;
          case "On-track": ws.onTrack++; break;
          case "At-risk": ws.atRisk++; break;
          case "Overdue": ws.overdue++; break;
        }
      }

      const workstreamData = Array.from(wsMap.entries()).map(([ws, c]) => ({
        workstream: ws,
        health: computeHealth(c.total, c.completed, c.overdue, c.atRisk),
        total: c.total, notStarted: c.notStarted, completed: c.completed, onTrack: c.onTrack,
        atRisk: c.atRisk, overdue: c.overdue,
        completionPct: c.total > 0 ? c.completed / c.total : 0,
      }));

      const snapshotDate = new Date(upload.uploadedAt).toISOString().split("T")[0];

      await db.insert(snapshots).values({
        snapshotDate,
        totalItems: items.length,
        notStarted, completed, onTrack, atRisk, overdue,
        overallHealth: computeHealth(items.length, completed, overdue, atRisk),
        workstreamData,
        source: "upload",
      });
      inserted++;
    }

    return NextResponse.json({ backfilled: inserted });
  } catch (e) {
    console.error("Backfill error:", e);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}

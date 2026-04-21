import { NextRequest, NextResponse } from "next/server";
import { db, uploads, snapshots } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error("Upload fetch error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    const upload = rows[0];
    const snapshotDate = new Date(upload.uploadedAt).toISOString().split("T")[0];

    // Remove the upload-sourced snapshot for that date (if any)
    await db
      .delete(snapshots)
      .where(and(eq(snapshots.snapshotDate, snapshotDate), eq(snapshots.source, "upload")));

    // Remove the upload itself
    await db.delete(uploads).where(eq(uploads.id, id));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Upload delete error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

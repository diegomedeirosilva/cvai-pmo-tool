import { NextRequest, NextResponse } from "next/server";
import { db, uploads } from "@/lib/db";
import { eq } from "drizzle-orm";

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

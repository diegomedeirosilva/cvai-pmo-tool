import { NextRequest, NextResponse } from "next/server";
import { db, weeklyUpdateSections } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const sections: Array<{
      id: string;
      progressUpdate?: string;
      nextSteps?: string;
      needsFromClient?: string;
    }> = body.sections;

    const now = new Date();
    const updated = await Promise.all(
      sections.map((s) =>
        db
          .update(weeklyUpdateSections)
          .set({
            ...(s.progressUpdate !== undefined && { progressUpdate: s.progressUpdate }),
            ...(s.nextSteps !== undefined && { nextSteps: s.nextSteps }),
            ...(s.needsFromClient !== undefined && { needsFromClient: s.needsFromClient }),
            updatedAt: now,
          })
          .where(eq(weeklyUpdateSections.id, s.id))
          .returning()
      )
    );

    return NextResponse.json({ updated: updated.flat() });
  } catch (e) {
    console.error("Sections PATCH error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

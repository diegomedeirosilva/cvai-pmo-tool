import { NextRequest, NextResponse } from "next/server";
import { db, actionItems, dependencies, categorySummaries, projects, uploads, risks } from "@/lib/db";
import { parseExcelWorkplan, buildPreview } from "@/lib/excel/parser";
import { detectRisks } from "@/lib/risk-engine/rules";
import { takeSnapshot } from "@/lib/snapshot";
import { eq, ne } from "drizzle-orm";
import { ActionItem, Dependency } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const confirm = formData.get("confirm") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseExcelWorkplan(buffer);
    const preview = buildPreview(parsed);

    // If not confirmed, return preview only
    if (!confirm) {
      return NextResponse.json({ preview, parsed: null });
    }

    // Confirmed: save to DB
    // 1. Archive current data as upload snapshot
    const currentItems = await db.select().from(actionItems);
    if (currentItems.length > 0) {
      await db.insert(uploads).values({
        fileName: file.name,
        itemCount: currentItems.length,
        snapshot: currentItems,
      });
    }

    // 2. Clear existing data
    await db.delete(dependencies);
    await db.delete(actionItems);
    await db.delete(categorySummaries);

    // 3. Insert new action items — freeze Excel dates as baseline
    let insertedItems: typeof actionItems.$inferSelect[] = [];
    if (parsed.actionItems.length > 0) {
      insertedItems = await db.insert(actionItems).values(
        parsed.actionItems.map((item) => ({
          ...item,
          baselineStartDate: item.startDate,
          baselineEndDate: item.endDate,
        }))
      ).returning();
    }

    // 4. Insert dependencies (map by index to ID)
    let insertedDeps: typeof dependencies.$inferSelect[] = [];
    if (parsed.dependencies.length > 0) {
      const depValues = parsed.dependencies
        .filter((d) => insertedItems[d.predecessorIndex] && insertedItems[d.successorIndex])
        .map((d) => ({
          predecessorId: insertedItems[d.predecessorIndex].id,
          successorId: insertedItems[d.successorIndex].id,
        }));
      if (depValues.length > 0) {
        insertedDeps = await db.insert(dependencies).values(depValues).returning();
      }
    }

    // 5. Insert category summaries
    if (parsed.categorySummaries.length > 0) {
      await db.insert(categorySummaries).values(parsed.categorySummaries);
    }

    // 6. Upsert project metadata
    const existingProject = await db.select().from(projects).limit(1);
    let projectDay1 = parsed.project.day1TargetDate;
    if (existingProject.length === 0) {
      await db.insert(projects).values(parsed.project);
    } else {
      await db
        .update(projects)
        .set({ ...parsed.project, updatedAt: new Date() })
        .where(eq(projects.id, existingProject[0].id));
    }

    // 7. Auto-refresh rule-based risks
    await db.delete(risks).where(ne(risks.type, "AI-Inferred"));
    const detectedRisks = detectRisks(
      insertedItems as unknown as ActionItem[],
      insertedDeps as unknown as Dependency[],
      projectDay1
    );
    if (detectedRisks.length > 0) {
      await db.insert(risks).values(detectedRisks);
    }

    // 8. Auto-snapshot for trend tracking
    await takeSnapshot("upload");

    return NextResponse.json({
      success: true,
      preview,
      itemsInserted: insertedItems.length,
      dependenciesInserted: insertedDeps.length,
      risksDetected: detectedRisks.length,
    });
  } catch (e) {
    console.error("Upload error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}

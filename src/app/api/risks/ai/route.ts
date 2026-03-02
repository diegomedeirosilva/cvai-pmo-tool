import { NextResponse } from "next/server";
import { db, actionItems, dependencies, risks, projects } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
import { ActionItem, Dependency, Risk } from "@/types";
import { analyzeRisks, AIRiskContext } from "@/lib/ai/risk-analyzer";
import { differenceInCalendarDays } from "date-fns";

export async function POST() {
  try {
    const providerName = process.env.AI_PROVIDER || "anthropic";
    const hasKey =
      (providerName === "anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
      (providerName === "openai" && !!process.env.OPENAI_API_KEY);

    if (!hasKey) {
      return NextResponse.json(
        { error: "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment." },
        { status: 400 }
      );
    }

    const projectRows = await db.select().from(projects).limit(1);
    if (projectRows.length === 0) {
      return NextResponse.json({ error: "No project found" }, { status: 404 });
    }

    const project = projectRows[0];
    const allItems = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));
    const allDeps = await db.select().from(dependencies);
    const existingRisks = await db.select().from(risks);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysRemaining = differenceInCalendarDays(new Date(project.day1TargetDate), today);

    const ctx: AIRiskContext = {
      projectTitle: project.title,
      day1TargetDate: project.day1TargetDate,
      daysRemaining,
      items: allItems as unknown as ActionItem[],
      dependencies: allDeps as unknown as Dependency[],
      existingRisks: existingRisks.filter((r) => r.type !== "AI-Inferred") as unknown as Risk[],
    };

    // Remove old AI-inferred risks before inserting new ones
    await db.delete(risks).where(eq(risks.type, "AI-Inferred"));

    const aiRisks = await analyzeRisks(ctx);

    if (aiRisks.length > 0) {
      await db.insert(risks).values(aiRisks).returning();
    }

    // Return full risk list so UI can replace state in one call
    const allRisks = await db.select().from(risks).orderBy(asc(risks.createdAt));

    return NextResponse.json({
      aiCount: aiRisks.length,
      risks: allRisks,
    });
  } catch (e) {
    console.error("AI risk analysis error:", e);
    return NextResponse.json(
      { error: "AI risk analysis failed. Check server logs." },
      { status: 500 }
    );
  }
}

import { db, risks, actionItems, projects } from "@/lib/db";
import { asc } from "drizzle-orm";
import { Risk, ActionItem } from "@/types";
import RiskRegister from "@/components/risks/RiskRegister";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RisksPage() {
  const riskRows = await db.select().from(risks).orderBy(asc(risks.createdAt));
  const items = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));

  return (
    <RiskRegister
      initialRisks={riskRows as unknown as Risk[]}
      items={items as unknown as ActionItem[]}
    />
  );
}

import { db, actionItems } from "@/lib/db";
import { asc } from "drizzle-orm";
import { ActionItem } from "@/types";
import { buildOwnerStats } from "@/lib/dashboard";
import OwnerView from "@/components/owners/OwnerView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OwnersPage() {
  const items = await db.select().from(actionItems).orderBy(asc(actionItems.sortOrder));
  const ownerStats = buildOwnerStats(items as unknown as ActionItem[]);
  return <OwnerView ownerStats={ownerStats} items={items as unknown as ActionItem[]} />;
}

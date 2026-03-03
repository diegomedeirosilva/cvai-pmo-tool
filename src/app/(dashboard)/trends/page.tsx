import { db, snapshots } from "@/lib/db";
import { asc } from "drizzle-orm";
import { Snapshot } from "@/types";
import TrendsClient from "@/components/trends/TrendsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TrendsPage() {
  const rows = await db.select().from(snapshots).orderBy(asc(snapshots.snapshotDate));
  return <TrendsClient snapshots={rows as unknown as Snapshot[]} />;
}

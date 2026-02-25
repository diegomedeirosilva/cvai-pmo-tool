import { db, projects, uploads } from "@/lib/db";
import { desc } from "drizzle-orm";
import SettingsClient from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const projectRows = await db.select().from(projects).limit(1);
  const uploadHistory = await db.select().from(uploads).orderBy(desc(uploads.uploadedAt)).limit(10);

  return (
    <SettingsClient
      project={projectRows[0] || null}
      uploadHistory={uploadHistory}
    />
  );
}

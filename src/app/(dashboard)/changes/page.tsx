import { db, uploads } from "@/lib/db";
import { desc } from "drizzle-orm";
import DiffView from "@/components/changes/DiffView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChangesPage() {
  const uploadHistory = await db
    .select({
      id: uploads.id,
      uploadedAt: uploads.uploadedAt,
      fileName: uploads.fileName,
      itemCount: uploads.itemCount,
    })
    .from(uploads)
    .orderBy(desc(uploads.uploadedAt));

  return <DiffView uploads={uploadHistory} />;
}

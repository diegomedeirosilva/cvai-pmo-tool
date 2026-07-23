import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Parse .env.local manually
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^(\w+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("Creating weekly_updates table...");
  await sql`
    CREATE TABLE IF NOT EXISTS weekly_updates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      week_label TEXT NOT NULL,
      week_start_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  console.log("Creating weekly_update_sections table...");
  await sql`
    CREATE TABLE IF NOT EXISTS weekly_update_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      weekly_update_id UUID NOT NULL REFERENCES weekly_updates(id) ON DELETE CASCADE,
      deliverable TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      progress_update TEXT NOT NULL DEFAULT '',
      next_steps TEXT NOT NULL DEFAULT '',
      needs_from_client TEXT NOT NULL DEFAULT '',
      ai_generated JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  console.log("Done! Weekly update tables created.");
}

migrate().catch(console.error);

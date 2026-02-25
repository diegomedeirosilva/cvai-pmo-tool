-- PMO Dashboard: Initial schema
-- Run this in your Neon SQL console if drizzle push fails

CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "day1_target_date" date NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "action_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workstream" text NOT NULL,
  "category" text NOT NULL,
  "requirement" text NOT NULL DEFAULT '',
  "action" text NOT NULL DEFAULT '',
  "owner" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'Not Started',
  "start_date" date NOT NULL,
  "duration" integer NOT NULL DEFAULT 0,
  "end_date" date NOT NULL,
  "target_completion_pct" real NOT NULL DEFAULT 0,
  "notes" text NOT NULL DEFAULT '',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "predecessor_id" uuid NOT NULL REFERENCES "action_items"("id") ON DELETE CASCADE,
  "successor_id" uuid NOT NULL REFERENCES "action_items"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "category_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category" text NOT NULL,
  "workstream" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "duration" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "risks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "affected_item_ids" jsonb NOT NULL DEFAULT '[]',
  "owners" jsonb NOT NULL DEFAULT '[]',
  "description" text NOT NULL,
  "suggested_mitigation" text,
  "risk_status" text NOT NULL DEFAULT 'Open',
  "workstream" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "uploaded_at" timestamp NOT NULL DEFAULT now(),
  "file_name" text NOT NULL,
  "item_count" integer NOT NULL DEFAULT 0,
  "snapshot" jsonb NOT NULL DEFAULT '[]'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_action_items_workstream ON action_items(workstream);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_sort ON action_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(risk_status);

CREATE TABLE IF NOT EXISTS "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workstream" text NOT NULL,
	"category" text NOT NULL,
	"requirement" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'On-track' NOT NULL,
	"start_date" date NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"end_date" date NOT NULL,
	"target_completion_pct" real DEFAULT 0 NOT NULL,
	"actual_completion_pct" real DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"workstream" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"predecessor_id" uuid NOT NULL,
	"successor_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"day1_target_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"affected_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owners" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text NOT NULL,
	"suggested_mitigation" text,
	"risk_status" text DEFAULT 'Open' NOT NULL,
	"workstream" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"on_track" integer DEFAULT 0 NOT NULL,
	"at_risk" integer DEFAULT 0 NOT NULL,
	"overdue" integer DEFAULT 0 NOT NULL,
	"overall_health" text DEFAULT 'Green' NOT NULL,
	"workstream_data" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"file_name" text NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_predecessor_id_action_items_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."action_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_successor_id_action_items_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."action_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

import {
  pgTable,
  text,
  integer,
  real,
  date,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  day1TargetDate: date("day1_target_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const actionItems = pgTable("action_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workstream: text("workstream").notNull(),
  category: text("category").notNull(),
  requirement: text("requirement").notNull().default(""),
  action: text("action").notNull().default(""),
  owner: text("owner").notNull().default(""),
  status: text("status").notNull().default("Not Started"),
  startDate: date("start_date").notNull(),
  duration: integer("duration").notNull().default(0),
  endDate: date("end_date").notNull(),
  targetCompletionPct: real("target_completion_pct").notNull().default(0),
  actualCompletionPct: real("actual_completion_pct").notNull().default(0),
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dependencies = pgTable("dependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  predecessorId: uuid("predecessor_id")
    .notNull()
    .references(() => actionItems.id, { onDelete: "cascade" }),
  successorId: uuid("successor_id")
    .notNull()
    .references(() => actionItems.id, { onDelete: "cascade" }),
});

export const categorySummaries = pgTable("category_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull(),
  workstream: text("workstream").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  duration: integer("duration").notNull().default(0),
});

export const risks = pgTable("risks", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  affectedItemIds: jsonb("affected_item_ids").notNull().default([]),
  owners: jsonb("owners").notNull().default([]),
  description: text("description").notNull(),
  suggestedMitigation: text("suggested_mitigation"),
  riskStatus: text("risk_status").notNull().default("Open"),
  workstream: text("workstream"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  fileName: text("file_name").notNull(),
  itemCount: integer("item_count").notNull().default(0),
  snapshot: jsonb("snapshot").notNull().default([]),
});

export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  snapshotDate: date("snapshot_date").notNull(),
  totalItems: integer("total_items").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  onTrack: integer("on_track").notNull().default(0),
  notStarted: integer("not_started").notNull().default(0),
  delayed: integer("delayed").notNull().default(0),
  overdue: integer("overdue").notNull().default(0),
  overallHealth: text("overall_health").notNull().default("Green"),
  workstreamData: jsonb("workstream_data").notNull().default([]),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Status = "Completed" | "On-track" | "At-risk" | "Overdue";
export type RiskSeverity = "Critical" | "High" | "Medium" | "Low";
export type RiskStatus = "Open" | "Acknowledged" | "Mitigated" | "Closed";
export type RiskType =
  | "Overdue"
  | "Behind Schedule"
  | "Bottleneck Owner"
  | "No Buffer"
  | "Critical Path Risk"
  | "Dependency Risk"
  | "Stalled"
  | "AI-Inferred";

export interface ActionItem {
  id: string;
  workstream: string;
  category: string;
  requirement: string;
  action: string;
  owner: string;
  status: Status;
  startDate: string; // ISO date string
  duration: number;
  endDate: string; // ISO date string
  targetCompletionPct: number; // 0.0 to 1.0 — calculated from time elapsed (read-only display)
  actualCompletionPct: number;  // 0.0 to 1.0 — manually set by PMO team
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Dependency {
  id: string;
  predecessorId: string;
  successorId: string;
}

export interface CategorySummary {
  id: string;
  category: string;
  workstream: string;
  startDate: string;
  endDate: string;
  duration: number;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  day1TargetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Risk {
  id: string;
  type: RiskType;
  severity: RiskSeverity;
  affectedItemIds: string[];
  owners: string[];
  description: string;
  suggestedMitigation: string | null;
  riskStatus: RiskStatus;
  workstream: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Upload {
  id: string;
  uploadedAt: string;
  fileName: string;
  itemCount: number;
  snapshot: ActionItem[];
}

// Dashboard aggregates
export interface WorkstreamHealth {
  workstream: string;
  health: "Green" | "Amber" | "Red";
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  completionPct: number;
}

export interface DashboardSummary {
  project: Project;
  daysToDay1: number;
  overallHealth: "Green" | "Amber" | "Red";
  totalItems: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  workstreamHealth: WorkstreamHealth[];
  upcomingMilestones: ActionItem[];
  aiSummary?: string;
}

export interface Snapshot {
  id: string;
  snapshotDate: string;
  totalItems: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  overallHealth: "Green" | "Amber" | "Red";
  workstreamData: WorkstreamHealth[];
  source: "manual" | "upload" | "cron";
  createdAt: string;
}

export interface OwnerStats {
  owner: string;
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  dueSoon7: number;
  dueSoon14: number;
  dueSoon30: number;
  items: ActionItem[];
}

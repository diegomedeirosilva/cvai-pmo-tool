import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatPct(val: number): string {
  return Math.round(val * 100) + "%";
}

// Status palette. Note: Completed = BLUE and On-track = GREEN (green reads as
// "actively on track / healthy"; blue is reserved for finished work).
export const STATUS_COLORS: Record<string, string> = {
  "Not Started": "#94A3B8",
  "Completed": "#3B82F6",
  "On-track": "#22C55E",
  "At-risk": "#F59E0B",
  "Overdue": "#EF4444",
};

export const STATUS_BG: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-600",
  "Completed": "bg-blue-100 text-blue-700",
  "On-track": "bg-green-100 text-green-700",
  "At-risk": "bg-amber-100 text-amber-700",
  "Overdue": "bg-red-100 text-red-700",
};

// Display label for a status value. "Completed" stays the internal value
// (DB, Excel round-trip, status logic all key off it); users see "Closed".
export function statusLabel(status: string): string {
  return status === "Completed" ? "Closed" : status;
}

export const SEVERITY_COLORS: Record<string, string> = {
  Critical: "bg-red-600 text-white",
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-blue-100 text-blue-700",
};

export const HEALTH_COLORS: Record<string, string> = {
  Green: "#22C55E",
  Amber: "#F59E0B",
  Red: "#EF4444",
};

export const HEALTH_LABELS: Record<string, string> = {
  Green: "On Track",
  Amber: "At Risk",
  Red: "Critical",
};

import { ActionItem, DashboardSummary, WorkstreamHealth, Project, OwnerStats, Status } from "@/types";
import { differenceInCalendarDays } from "date-fns";

/**
 * Time-based target completion: the share of the planned timeline (start → end) that has
 * elapsed as of `asOfDate` (today by default). This is the "expected" completion right now,
 * and it always reflects the CURRENT dates — so it updates automatically when the timeline
 * (start date / duration / end date) changes.
 */
export function timeBasedTarget(item: { startDate: string; endDate: string }, asOfDate?: Date): number {
  const today = asOfDate ? new Date(asOfDate) : new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(item.startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(item.endDate); end.setHours(0, 0, 0, 0);
  const span = end.getTime() - start.getTime();
  if (!isFinite(span) || span <= 0) return today.getTime() >= end.getTime() ? 1 : 0;
  const elapsed = today.getTime() - start.getTime();
  return Math.max(0, Math.min(1, elapsed / span));
}

/**
 * Average completion for a group of items: the plain mean of each item's
 * actualCompletionPct (0–1). This is what every "progress" bar/% shows for a
 * workstream / category / owner — partial work counts, so an item that's 90%
 * done contributes 0.9 rather than 0. Empty group → 0.
 */
export function averageCompletion(items: { actualCompletionPct: number }[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, i) => acc + (i.actualCompletionPct || 0), 0);
  return sum / items.length;
}

/**
 * Compute status automatically from dates and completion percentages.
 * - Completed: actualCompletionPct >= 1.0
 * - Overdue: end date is in the past and not completed
 * - Not Started: actualCompletionPct === 0 and start date is today or in the future
 * - At-risk: actual completion is behind the time-based target (computed live from the dates)
 * - On-track: everything else
 */
export function computeStatus(item: { startDate: string; endDate: string; actualCompletionPct: number; targetCompletionPct?: number }, asOfDate?: Date): Status {
  const today = asOfDate ? new Date(asOfDate) : new Date();
  today.setHours(0, 0, 0, 0);

  if (item.actualCompletionPct >= 1.0) return "Completed";
  if (new Date(item.endDate) < today) return "Overdue";
  if (item.actualCompletionPct === 0 && new Date(item.startDate) >= today) return "Not Started";
  if (item.actualCompletionPct < timeBasedTarget(item, asOfDate)) return "At-risk";
  return "On-track";
}

/**
 * Roll a group of items up to a single status, used for the group's bar/pill
 * colour: any overdue → Overdue, else any at-risk → At-risk, else all complete
 * → Completed, else any progress underway → On-track (in progress), else Not
 * Started. Reserves "Completed" for fully-done groups so it maps to blue.
 */
export function rollupStatus(c: { total: number; overdue: number; atRisk: number; onTrack: number; completed: number }): Status {
  if (c.total === 0) return "Not Started";
  if (c.overdue > 0) return "Overdue";
  if (c.atRisk > 0) return "At-risk";
  if (c.completed === c.total) return "Completed";
  if (c.onTrack > 0 || c.completed > 0) return "On-track";
  return "Not Started";
}

export function computeGroupStatus(
  items: { startDate: string; endDate: string; actualCompletionPct: number }[],
  asOfDate?: Date
): Status {
  const c = { total: items.length, overdue: 0, atRisk: 0, onTrack: 0, completed: 0 };
  for (const it of items) {
    switch (computeStatus(it, asOfDate)) {
      case "Overdue": c.overdue++; break;
      case "At-risk": c.atRisk++; break;
      case "On-track": c.onTrack++; break;
      case "Completed": c.completed++; break;
    }
  }
  return rollupStatus(c);
}

export function isOverdue(item: ActionItem): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return item.status !== "Completed" && new Date(item.endDate) < today;
}

export function computeHealth(
  total: number,
  completed: number,
  overdue: number,
  atRisk: number
): "Green" | "Amber" | "Red" {
  // Traffic-light on urgency: a missed date is Red, anything merely behind
  // schedule is Amber, everything else is Green. Deliberately NOT proportion-
  // based — a single overdue item turns the whole group red.
  if (total === 0) return "Green";
  if (overdue > 0) return "Red";
  if (atRisk > 0) return "Amber";
  return "Green";
}

export function buildDashboardSummary(
  project: Project,
  items: ActionItem[]
): Omit<DashboardSummary, "aiSummary"> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Projected Day-1 = the latest end date across the plan — the day the JV is
  // actually ready. It moves automatically as tasks slip (via the dependency
  // cascade). The Settings date is the ORIGINAL committed target, kept fixed so
  // the gap between the two (projectedSlipDays) shows how far the plan slipped.
  let projectedFinish: string | null = null;
  for (const item of items) {
    if (item.endDate && (!projectedFinish || item.endDate > projectedFinish)) projectedFinish = item.endDate;
  }
  const projectedSlipDays = projectedFinish
    ? differenceInCalendarDays(new Date(projectedFinish), new Date(project.day1TargetDate))
    : 0;

  // The headline countdown counts to the PROJECTED Day-1 (target as fallback).
  const daysToDay1 = differenceInCalendarDays(new Date(projectedFinish ?? project.day1TargetDate), today);

  let notStarted = 0, completed = 0, onTrack = 0, atRisk = 0, overdue = 0;
  const workstreamMap = new Map<
    string,
    { total: number; notStarted: number; completed: number; onTrack: number; atRisk: number; overdue: number; sumPct: number }
  >();

  for (const item of items) {
    // Recompute status from dates/completion
    const status = computeStatus(item);

    switch (status) {
      case "Not Started": notStarted++; break;
      case "Completed": completed++; break;
      case "On-track": onTrack++; break;
      case "At-risk": atRisk++; break;
      case "Overdue": overdue++; break;
    }

    if (!workstreamMap.has(item.workstream)) {
      workstreamMap.set(item.workstream, { total: 0, notStarted: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0, sumPct: 0 });
    }
    const ws = workstreamMap.get(item.workstream)!;
    ws.total++;
    ws.sumPct += item.actualCompletionPct || 0;
    switch (status) {
      case "Not Started": ws.notStarted++; break;
      case "Completed": ws.completed++; break;
      case "On-track": ws.onTrack++; break;
      case "At-risk": ws.atRisk++; break;
      case "Overdue": ws.overdue++; break;
    }
  }

  const workstreamHealth: WorkstreamHealth[] = Array.from(workstreamMap.entries()).map(
    ([ws, counts]) => ({
      workstream: ws,
      health: computeHealth(counts.total, counts.completed, counts.overdue, counts.atRisk),
      groupStatus: rollupStatus(counts),
      total: counts.total,
      notStarted: counts.notStarted,
      completed: counts.completed,
      onTrack: counts.onTrack,
      atRisk: counts.atRisk,
      overdue: counts.overdue,
      completionPct: counts.total > 0 ? counts.sumPct / counts.total : 0,
    })
  );

  // Upcoming milestones: items due in next 14 days, not completed
  const in14Days = new Date(today);
  in14Days.setDate(in14Days.getDate() + 14);

  const upcomingMilestones = items
    .filter((item) => {
      if (computeStatus(item) === "Completed") return false;
      const end = new Date(item.endDate);
      return end >= today && end <= in14Days;
    })
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  const overallHealth = computeHealth(items.length, completed, overdue, atRisk);

  return {
    project,
    daysToDay1,
    overallHealth,
    totalItems: items.length,
    notStarted,
    completed,
    onTrack,
    atRisk,
    overdue,
    projectedFinish,
    projectedSlipDays,
    workstreamHealth,
    upcomingMilestones,
  };
}

export function buildOwnerStats(items: ActionItem[]): OwnerStats[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d7 = new Date(today); d7.setDate(d7.getDate() + 7);
  const d14 = new Date(today); d14.setDate(d14.getDate() + 14);
  const d30 = new Date(today); d30.setDate(d30.getDate() + 30);

  const ownerMap = new Map<string, OwnerStats>();

  function getOrCreate(owner: string): OwnerStats {
    if (!ownerMap.has(owner)) {
      ownerMap.set(owner, {
        owner,
        total: 0,
        notStarted: 0,
        completed: 0,
        onTrack: 0,
        atRisk: 0,
        overdue: 0,
        dueSoon7: 0,
        dueSoon14: 0,
        dueSoon30: 0,
        items: [],
      });
    }
    return ownerMap.get(owner)!;
  }

  for (const item of items) {
    const stats = getOrCreate(item.owner);
    stats.total++;
    const status = computeStatus(item);
    switch (status) {
      case "Not Started": stats.notStarted++; break;
      case "Completed": stats.completed++; break;
      case "On-track": stats.onTrack++; break;
      case "At-risk": stats.atRisk++; break;
      case "Overdue": stats.overdue++; break;
    }
    if (status !== "Completed") {
      // Includes overdue items — they are the most "due"
      const end = new Date(item.endDate);
      if (end <= d7) stats.dueSoon7++;
      if (end <= d14) stats.dueSoon14++;
      if (end <= d30) stats.dueSoon30++;
    }
    stats.items.push(item);

    // Also add individual entries if compound owner
    if (item.owner.includes("/")) {
      const parts = item.owner.split("/").map((o) => o.trim()).filter((o) => o !== item.owner);
      for (const part of parts) {
        const partStats = getOrCreate(part);
        if (!partStats.items.find((i) => i.id === item.id)) {
          partStats.items.push(item);
        }
      }
    }
  }

  return Array.from(ownerMap.values()).sort((a, b) => b.total - a.total);
}

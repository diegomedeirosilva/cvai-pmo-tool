import { ActionItem, DashboardSummary, WorkstreamHealth, Project, Risk, OwnerStats, Status } from "@/types";
import { differenceInCalendarDays } from "date-fns";

/**
 * Compute status automatically from dates and completion percentages.
 * - Completed: actualCompletionPct >= 1.0
 * - Overdue: end date is in the past and not completed
 * - Not Started: actualCompletionPct === 0 and start date is today or in the future
 * - At-risk: not completed, not overdue, but actual completion < target completion
 * - On-track: everything else
 */
export function computeStatus(item: { startDate: string; endDate: string; actualCompletionPct: number; targetCompletionPct: number }, asOfDate?: Date): Status {
  const today = asOfDate ? new Date(asOfDate) : new Date();
  today.setHours(0, 0, 0, 0);

  if (item.actualCompletionPct >= 1.0) return "Completed";
  if (new Date(item.endDate) < today) return "Overdue";
  if (item.actualCompletionPct === 0 && new Date(item.startDate) >= today) return "Not Started";
  if (item.actualCompletionPct < item.targetCompletionPct) return "At-risk";
  return "On-track";
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
  if (total === 0) return "Green";
  const overduePct = overdue / total;
  const atRiskPct = atRisk / total;
  if (overduePct > 0.15 || atRiskPct > 0.15) return "Red";
  if (overduePct > 0.05 || atRiskPct > 0.05) return "Amber";
  return "Green";
}

export function buildDashboardSummary(
  project: Project,
  items: ActionItem[],
  risks: Risk[]
): Omit<DashboardSummary, "aiSummary"> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysToDay1 = differenceInCalendarDays(new Date(project.day1TargetDate), today);

  let notStarted = 0, completed = 0, onTrack = 0, atRisk = 0, overdue = 0;
  const workstreamMap = new Map<
    string,
    { total: number; notStarted: number; completed: number; onTrack: number; atRisk: number; overdue: number }
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
      workstreamMap.set(item.workstream, { total: 0, notStarted: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0 });
    }
    const ws = workstreamMap.get(item.workstream)!;
    ws.total++;
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
      total: counts.total,
      notStarted: counts.notStarted,
      completed: counts.completed,
      onTrack: counts.onTrack,
      atRisk: counts.atRisk,
      overdue: counts.overdue,
      completionPct: counts.total > 0 ? counts.completed / counts.total : 0,
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
      const end = new Date(item.endDate);
      if (end >= today && end <= d7) stats.dueSoon7++;
      if (end >= today && end <= d14) stats.dueSoon14++;
      if (end >= today && end <= d30) stats.dueSoon30++;
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

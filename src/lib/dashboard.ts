import { ActionItem, DashboardSummary, WorkstreamHealth, Project, Risk, OwnerStats } from "@/types";
import { differenceInCalendarDays } from "date-fns";

export function isOverdue(item: ActionItem): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return item.status !== "Completed" && new Date(item.endDate) < today;
}

export function computeHealth(
  total: number,
  completed: number,
  overdue: number,
  delayed: number
): "Green" | "Amber" | "Red" {
  if (total === 0) return "Green";
  const overduePct = overdue / total;
  const delayedPct = delayed / total;
  if (overduePct > 0.15 || delayedPct > 0.15) return "Red";
  if (overduePct > 0.05 || delayedPct > 0.05) return "Amber";
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

  let completed = 0, onTrack = 0, notStarted = 0, delayed = 0, overdue = 0;
  const workstreamMap = new Map<
    string,
    { total: number; completed: number; onTrack: number; notStarted: number; delayed: number; overdue: number }
  >();

  for (const item of items) {
    const od = isOverdue(item);
    if (od) overdue++;

    switch (item.status) {
      case "Completed": completed++; break;
      case "On-track": onTrack++; break;
      case "Not Started": notStarted++; break;
      case "Delayed": delayed++; break;
    }

    if (!workstreamMap.has(item.workstream)) {
      workstreamMap.set(item.workstream, { total: 0, completed: 0, onTrack: 0, notStarted: 0, delayed: 0, overdue: 0 });
    }
    const ws = workstreamMap.get(item.workstream)!;
    ws.total++;
    if (od) ws.overdue++;
    switch (item.status) {
      case "Completed": ws.completed++; break;
      case "On-track": ws.onTrack++; break;
      case "Not Started": ws.notStarted++; break;
      case "Delayed": ws.delayed++; break;
    }
  }

  const workstreamHealth: WorkstreamHealth[] = Array.from(workstreamMap.entries()).map(
    ([ws, counts]) => ({
      workstream: ws,
      health: computeHealth(counts.total, counts.completed, counts.overdue, counts.delayed),
      total: counts.total,
      completed: counts.completed,
      onTrack: counts.onTrack,
      notStarted: counts.notStarted,
      delayed: counts.delayed,
      overdue: counts.overdue,
      completionPct: counts.total > 0 ? counts.completed / counts.total : 0,
    })
  );

  // Upcoming milestones: items due in next 14 days, not completed
  const in14Days = new Date(today);
  in14Days.setDate(in14Days.getDate() + 14);

  const upcomingMilestones = items
    .filter((item) => {
      if (item.status === "Completed") return false;
      const end = new Date(item.endDate);
      return end >= today && end <= in14Days;
    })
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  const overallHealth = computeHealth(items.length, completed, overdue, delayed);

  return {
    project,
    daysToDay1,
    overallHealth,
    totalItems: items.length,
    completed,
    onTrack,
    notStarted,
    delayed,
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
        completed: 0,
        onTrack: 0,
        notStarted: 0,
        delayed: 0,
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
    // Primary owner entry (compound as-is)
    const stats = getOrCreate(item.owner);
    stats.total++;
    const od = isOverdue(item);
    if (od) stats.overdue++;
    switch (item.status) {
      case "Completed": stats.completed++; break;
      case "On-track": stats.onTrack++; break;
      case "Not Started": stats.notStarted++; break;
      case "Delayed": stats.delayed++; break;
    }
    if (item.status !== "Completed") {
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
        // For individual, just track the item reference (don't double-count totals heavily)
        if (!partStats.items.find((i) => i.id === item.id)) {
          partStats.items.push(item);
        }
      }
    }
  }

  return Array.from(ownerMap.values()).sort((a, b) => b.total - a.total);
}

import { ActionItem, Dependency, Risk, RiskSeverity, RiskType } from "@/types";

function isOverdue(item: ActionItem, today: Date): boolean {
  return (
    item.status !== "Completed" &&
    new Date(item.endDate) < today
  );
}

function daysUntil(dateStr: string, today: Date): number {
  return Math.ceil(
    (new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function expectedPct(item: ActionItem, today: Date): number {
  const start = new Date(item.startDate).getTime();
  const end = new Date(item.endDate).getTime();
  const now = today.getTime();
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function detectRisks(
  items: ActionItem[],
  dependencies: Dependency[],
  day1TargetDate: string
): Omit<Risk, "id" | "createdAt" | "updatedAt">[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day1 = new Date(day1TargetDate);
  const risks: Omit<Risk, "id" | "createdAt" | "updatedAt">[] = [];

  const itemMap = new Map<string, ActionItem>();
  for (const item of items) itemMap.set(item.id, item);

  // Build successor map: predecessorId → successorIds
  const successorMap = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (!successorMap.has(dep.predecessorId))
      successorMap.set(dep.predecessorId, []);
    successorMap.get(dep.predecessorId)!.push(dep.successorId);
  }

  // Owner workload: items due in next 14 days
  const ownerDueSoon = new Map<string, string[]>();
  for (const item of items) {
    if (item.status === "Completed") continue;
    const d = daysUntil(item.endDate, today);
    if (d >= 0 && d <= 14) {
      const owners = item.owner.split("/").map((o) => o.trim());
      for (const owner of owners) {
        if (!ownerDueSoon.has(owner)) ownerDueSoon.set(owner, []);
        ownerDueSoon.get(owner)!.push(item.id);
      }
    }
  }

  for (const item of items) {
    // 1. Overdue
    if (isOverdue(item, today)) {
      risks.push({
        type: "Overdue" as RiskType,
        severity: "High" as RiskSeverity,
        affectedItemIds: [item.id],
        owners: [item.owner],
        description: `"${item.requirement || item.action.slice(0, 60)}" is overdue (was due ${item.endDate}). Owner: ${item.owner}. Workstream: ${item.workstream}.`,
        suggestedMitigation: `Escalate to ${item.owner} for immediate update. Review if deadline can be adjusted.`,
        riskStatus: "Open",
        workstream: item.workstream,
      });
    }

    // 2. Behind Schedule
    if (item.status !== "Completed") {
      const expected = expectedPct(item, today);
      const actual = item.targetCompletionPct;
      const gap = expected - actual;
      if (gap > 0.15) {
        const severity: RiskSeverity = gap > 0.30 ? "High" : "Medium";
        risks.push({
          type: "Behind Schedule" as RiskType,
          severity,
          affectedItemIds: [item.id],
          owners: [item.owner],
          description: `"${item.requirement || item.action.slice(0, 60)}" is ${Math.round(gap * 100)}% behind schedule (expected ${Math.round(expected * 100)}%, actual ${Math.round(actual * 100)}%). Owner: ${item.owner}.`,
          suggestedMitigation: `Review with ${item.owner}. Consider adding resources or adjusting timeline.`,
          riskStatus: "Open",
          workstream: item.workstream,
        });
      }
    }

    // 3. No Buffer (end date within 7 days of Day-1, but not ON Day-1 itself —
    //    items ending exactly on Day-1 are the final deliverables, not risks)
    if (item.status !== "Completed") {
      const daysFromDay1 = Math.ceil(
        (day1.getTime() - new Date(item.endDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysFromDay1 > 0 && daysFromDay1 <= 7) {
        risks.push({
          type: "No Buffer" as RiskType,
          severity: "High" as RiskSeverity,
          affectedItemIds: [item.id],
          owners: [item.owner],
          description: `"${item.requirement || item.action.slice(0, 60)}" ends only ${daysFromDay1} day(s) before Day-1 with no completion buffer. Owner: ${item.owner}.`,
          suggestedMitigation: "Prioritize this item immediately. Any delay will directly impact Day-1 readiness.",
          riskStatus: "Open",
          workstream: item.workstream,
        });
      }
    }

    // 4. Dependency Risk: predecessor is delayed or overdue → successor is at risk
    const successors = successorMap.get(item.id) || [];
    if (
      successors.length > 0 &&
      (item.status === "Delayed" || isOverdue(item, today))
    ) {
      for (const sucId of successors) {
        const suc = itemMap.get(sucId);
        if (!suc) continue;
        risks.push({
          type: "Dependency Risk" as RiskType,
          severity: "High" as RiskSeverity,
          affectedItemIds: [item.id, sucId],
          owners: [item.owner, suc.owner].filter((o, i, arr) => arr.indexOf(o) === i),
          description: `"${suc.requirement || suc.action.slice(0, 50)}" depends on "${item.requirement || item.action.slice(0, 50)}" which is ${isOverdue(item, today) ? "overdue" : "delayed"}. Successor may be blocked.`,
          suggestedMitigation: `Resolve the predecessor task first. Owner: ${item.owner}. Then proceed with dependent task (${suc.owner}).`,
          riskStatus: "Open",
          workstream: item.workstream,
        });
      }
    }
  }

  // 5. Bottleneck Owner
  for (const [owner, itemIds] of ownerDueSoon.entries()) {
    if (itemIds.length >= 5) {
      risks.push({
        type: "Bottleneck Owner" as RiskType,
        severity: "Medium" as RiskSeverity,
        affectedItemIds: itemIds,
        owners: [owner],
        description: `${owner} has ${itemIds.length} items due in the next 14 days — potential capacity bottleneck.`,
        suggestedMitigation: `Review ${owner}'s workload. Consider redistributing tasks or ensuring they have dedicated time.`,
        riskStatus: "Open",
        workstream: null,
      });
    }
  }

  // Deduplicate: remove exact same affectedItemIds + type combos
  const seen = new Set<string>();
  return risks.filter((r) => {
    const key = `${r.type}:${r.affectedItemIds.sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

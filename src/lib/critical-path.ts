import { ActionItem, Dependency } from "@/types";

export interface CriticalPathResult {
  criticalIds: Set<string>;
  totalDays: number;
  chain: ActionItem[];
  floatDays: Record<string, number>; // slack in calendar days per item
}

/**
 * Proper Critical Path Method (CPM):
 *
 * 1. Forward pass  — ES (Early Start) and EF (Early Finish) using actual dates
 *    ES[i] = max(EF of all predecessors)  — or the item's own startDate if root
 *    EF[i] = ES[i] + duration
 *
 * 2. Backward pass — LF (Late Finish) and LS (Late Start) anchored to Day-1
 *    LF[i] = min(LS of all successors)  — or the Day-1 deadline if terminal
 *    LS[i] = LF[i] - duration
 *
 * 3. Float = LS - ES  (calendar days of slack)
 *    Float ≤ 0  → item is on the critical path (any delay pushes past Day-1)
 *    Float > 0  → item has slack and is NOT critical (even if its duration is long)
 *
 * This correctly handles the "IT items start early and finish well before Day-1"
 * scenario: they have large positive float and are excluded from the critical path.
 */
export function computeCriticalPath(
  items: ActionItem[],
  deps: Dependency[],
  day1TargetDate: string
): CriticalPathResult {
  if (items.length === 0) {
    return { criticalIds: new Set(), totalDays: 0, chain: [], floatDays: {} };
  }

  function dateToDay(d: string): number {
    return Math.floor(new Date(d + "T00:00:00").getTime() / 86400000);
  }

  const itemMap = new Map<string, ActionItem>();
  for (const item of items) itemMap.set(item.id, item);

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const item of items) {
    successors.set(item.id, []);
    predecessors.set(item.id, []);
  }
  for (const dep of deps) {
    successors.get(dep.predecessorId)?.push(dep.successorId);
    predecessors.get(dep.successorId)?.push(dep.predecessorId);
  }

  // Topological sort (Kahn's algorithm)
  const inDeg = new Map<string, number>();
  for (const item of items) inDeg.set(item.id, 0);
  for (const dep of deps) inDeg.set(dep.successorId, (inDeg.get(dep.successorId) || 0) + 1);

  const queue: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const s of successors.get(id) || []) {
      const nd = (inDeg.get(s) || 0) - 1;
      inDeg.set(s, nd);
      if (nd === 0) queue.push(s);
    }
  }

  // Forward pass: Early Start / Early Finish
  const ES = new Map<string, number>();
  const EF = new Map<string, number>();
  for (const id of topoOrder) {
    const item = itemMap.get(id)!;
    const preds = predecessors.get(id) || [];
    if (preds.length === 0) {
      ES.set(id, dateToDay(item.startDate));
    } else {
      ES.set(id, Math.max(...preds.map((p) => EF.get(p) ?? dateToDay(item.startDate))));
    }
    EF.set(id, ES.get(id)! + item.duration);
  }

  // Project deadline = Day-1 date
  const deadline = dateToDay(day1TargetDate);

  // Backward pass: Late Finish / Late Start (anchored at Day-1)
  const LF = new Map<string, number>();
  const LS = new Map<string, number>();
  for (const id of [...topoOrder].reverse()) {
    const item = itemMap.get(id)!;
    const succs = successors.get(id) || [];
    if (succs.length === 0) {
      LF.set(id, deadline);
    } else {
      LF.set(id, Math.min(...succs.map((s) => LS.get(s) ?? deadline)));
    }
    LS.set(id, LF.get(id)! - item.duration);
  }

  // Float = LS - ES. Critical = float ≤ 0
  const floatDays: Record<string, number> = {};
  const criticalIds = new Set<string>();
  for (const item of items) {
    const f = (LS.get(item.id) ?? 0) - (ES.get(item.id) ?? 0);
    floatDays[item.id] = f;
    if (f <= 0) criticalIds.add(item.id);
  }

  // If nothing has zero float (all items finish well before Day-1),
  // fall back to showing the 10 items with the least float.
  if (criticalIds.size === 0) {
    const sorted = [...items].sort((a, b) => (floatDays[a.id] ?? 999) - (floatDays[b.id] ?? 999));
    sorted.slice(0, 10).forEach((i) => criticalIds.add(i.id));
  }

  // Find representative chain: longest-path DP through critical items + their deps
  const critDist = new Map<string, number>();
  const critParent = new Map<string, string | null>();
  for (const item of items) {
    if (!criticalIds.has(item.id)) continue;
    critDist.set(item.id, item.duration);
    critParent.set(item.id, null);
  }
  for (const id of topoOrder) {
    if (!criticalIds.has(id)) continue;
    for (const succId of successors.get(id) || []) {
      if (!criticalIds.has(succId)) continue;
      const newDist = (critDist.get(id) || 0) + (itemMap.get(succId)?.duration || 0);
      if (newDist > (critDist.get(succId) || 0)) {
        critDist.set(succId, newDist);
        critParent.set(succId, id);
      }
    }
  }

  let maxDist = 0;
  let endId: string | null = null;
  for (const [id, d] of critDist) {
    if (d > maxDist) {
      maxDist = d;
      endId = id;
    }
  }

  const chain: ActionItem[] = [];
  if (endId) {
    let cur: string | null = endId;
    while (cur !== null) {
      const item = itemMap.get(cur);
      if (item) chain.unshift(item);
      cur = critParent.get(cur) ?? null;
    }
  }

  const totalDays = chain.reduce((s, i) => s + i.duration, 0);
  return { criticalIds, totalDays, chain, floatDays };
}

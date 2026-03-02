import { ActionItem, Dependency } from "@/types";

interface CascadeChange {
  id: string;
  startDate: string;
  endDate: string;
}

/**
 * Given a changed item, cascade date updates to all downstream successors.
 *
 * Rule: successor.startDate = max(predecessor.endDate) for all predecessors
 *       successor.endDate   = successor.startDate + successor.duration
 *
 * Uses BFS to process items in dependency order from the changed item.
 */
export function computeCascade(
  changedItemId: string,
  allItems: ActionItem[],
  allDeps: Dependency[]
): CascadeChange[] {
  const itemMap = new Map<string, ActionItem>();
  for (const item of allItems) itemMap.set(item.id, { ...item });

  // successor map: predecessorId → [successorId, ...]
  const succMap = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!succMap.has(dep.predecessorId)) succMap.set(dep.predecessorId, []);
    succMap.get(dep.predecessorId)!.push(dep.successorId);
  }

  // predecessor map: successorId → [predecessorId, ...]
  const predMap = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!predMap.has(dep.successorId)) predMap.set(dep.successorId, []);
    predMap.get(dep.successorId)!.push(dep.predecessorId);
  }

  const changes: CascadeChange[] = [];
  const visited = new Set<string>();
  const queue: string[] = [];

  // Seed with direct successors of the changed item
  for (const s of succMap.get(changedItemId) || []) queue.push(s);

  let iterations = 0;
  while (queue.length > 0 && iterations < 500) {
    iterations++;
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const item = itemMap.get(id);
    if (!item) continue;

    // Get the latest end date among all predecessors
    const preds = predMap.get(id) || [];
    let maxPredEnd = "";
    for (const predId of preds) {
      const pred = itemMap.get(predId);
      if (pred && pred.endDate > maxPredEnd) maxPredEnd = pred.endDate;
    }

    if (maxPredEnd && maxPredEnd !== item.startDate) {
      const newStart = maxPredEnd;
      const startMs = new Date(newStart + "T00:00:00").getTime();
      const newEnd = new Date(startMs + item.duration * 86400000)
        .toISOString()
        .split("T")[0];

      item.startDate = newStart;
      item.endDate = newEnd;
      changes.push({ id: item.id, startDate: newStart, endDate: newEnd });
    }

    // Enqueue successors
    for (const s of succMap.get(id) || []) {
      if (!visited.has(s)) queue.push(s);
    }
  }

  return changes;
}

/**
 * Check if adding predecessorId → successorId would create a cycle.
 * Returns true if successorId can already reach predecessorId
 * through existing dependencies (meaning adding this edge creates a loop).
 */
export function wouldCreateCycle(
  predecessorId: string,
  successorId: string,
  allDeps: Dependency[]
): boolean {
  const succMap = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!succMap.has(dep.predecessorId)) succMap.set(dep.predecessorId, []);
    succMap.get(dep.predecessorId)!.push(dep.successorId);
  }

  // BFS from successorId — if we can reach predecessorId, there's a cycle
  const visited = new Set<string>();
  const queue = [successorId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === predecessorId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const s of succMap.get(id) || []) queue.push(s);
  }
  return false;
}

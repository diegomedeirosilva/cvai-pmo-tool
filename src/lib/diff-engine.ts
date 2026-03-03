import { ActionItem } from "@/types";

export type ChangeType = "added" | "removed" | "modified" | "unchanged";

export interface FieldChange {
  field: string;
  oldValue: string | number;
  newValue: string | number;
}

export interface DiffItem {
  changeType: ChangeType;
  item: ActionItem;
  previousItem?: ActionItem;
  changes: FieldChange[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export interface DiffResult {
  summary: DiffSummary;
  items: DiffItem[];
}

function matchKey(item: ActionItem): string {
  return `${(item.workstream || "").trim().toLowerCase()}|||${(item.requirement || "").trim().toLowerCase()}`;
}

const COMPARED_FIELDS: { key: keyof ActionItem; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "owner", label: "Owner" },
  { key: "startDate", label: "Start Date" },
  { key: "endDate", label: "End Date" },
  { key: "duration", label: "Duration" },
  { key: "actualCompletionPct", label: "Completion %" },
  { key: "category", label: "Category" },
  { key: "action", label: "Action" },
  { key: "notes", label: "Notes" },
];

export function computeDiff(oldItems: ActionItem[], newItems: ActionItem[]): DiffResult {
  const oldMap = new Map<string, ActionItem>();
  for (const item of oldItems) {
    const key = matchKey(item);
    if (key !== "|||") oldMap.set(key, item);
  }

  const newMap = new Map<string, ActionItem>();
  for (const item of newItems) {
    const key = matchKey(item);
    if (key !== "|||") newMap.set(key, item);
  }

  const diffItems: DiffItem[] = [];
  let added = 0, removed = 0, modified = 0, unchanged = 0;

  for (const [key, newItem] of newMap) {
    const oldItem = oldMap.get(key);
    if (!oldItem) {
      diffItems.push({ changeType: "added", item: newItem, changes: [] });
      added++;
    } else {
      const changes: FieldChange[] = [];
      for (const { key: field, label } of COMPARED_FIELDS) {
        const oldVal = oldItem[field];
        const newVal = newItem[field];
        if (String(oldVal) !== String(newVal)) {
          changes.push({ field: label, oldValue: oldVal as string | number, newValue: newVal as string | number });
        }
      }
      if (changes.length > 0) {
        diffItems.push({ changeType: "modified", item: newItem, previousItem: oldItem, changes });
        modified++;
      } else {
        diffItems.push({ changeType: "unchanged", item: newItem, changes: [] });
        unchanged++;
      }
    }
  }

  for (const [key, oldItem] of oldMap) {
    if (!newMap.has(key)) {
      diffItems.push({ changeType: "removed", item: oldItem, changes: [] });
      removed++;
    }
  }

  const typeOrder: Record<ChangeType, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  diffItems.sort((a, b) => typeOrder[a.changeType] - typeOrder[b.changeType]);

  return { summary: { added, removed, modified, unchanged }, items: diffItems };
}

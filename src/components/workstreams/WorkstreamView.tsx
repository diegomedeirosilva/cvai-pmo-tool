"use client";
import { useState, useMemo } from "react";
import { ActionItem, Dependency } from "@/types";
import { STATUS_COLORS, formatDate, HEALTH_COLORS } from "@/lib/utils";
import { computeHealth, computeStatus } from "@/lib/dashboard";
import ActionItemModal from "@/components/shared/ActionItemModal";

interface CategorySummaryRow {
  id: string;
  category: string;
  workstream: string;
  startDate: string;
  endDate: string;
  duration: number;
}

interface Stats {
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
}

interface Props {
  workstream: string;
  items: ActionItem[];
  categorySummaries: CategorySummaryRow[];
  dependencies: Dependency[];
  stats: Stats;
  allItems?: ActionItem[];
}

export default function WorkstreamView({ workstream, items: initialItems, categorySummaries, dependencies: initialDeps, stats, allItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [deps, setDeps] = useState(initialDeps);
  const [editItem, setEditItem] = useState<ActionItem | null>(null);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const health = computeHealth(stats.total, stats.completed, stats.overdue, stats.atRisk);
  const healthColor = HEALTH_COLORS[health];
  const completionPct = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  // Group items by category
  const categories = new Map<string, ActionItem[]>();
  for (const item of items) {
    if (!categories.has(item.category)) categories.set(item.category, []);
    categories.get(item.category)!.push(item);
  }

  // Build predecessor and successor maps
  const predMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const dep of deps) m.set(dep.successorId, dep.predecessorId);
    return m;
  }, [deps]);

  const succMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const dep of deps) {
      if (!m.has(dep.predecessorId)) m.set(dep.predecessorId, []);
      m.get(dep.predecessorId)!.push(dep.successorId);
    }
    return m;
  }, [deps]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  async function handleSaveItem(updated: ActionItem, predecessorId: string | null) {
    const isNew = !updated.id;
    const url = isNew ? "/api/actions" : `/api/actions/${updated.id}`;
    const method = isNew ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updated, predecessorId }),
    });
    if (res.ok) {
      const result = await res.json();
      const itemId = updated.id || result.id;

      if (result.updatedItems && Array.isArray(result.updatedItems)) {
        setItems((prev) => {
          const updatedMap = new Map(result.updatedItems.map((i: ActionItem) => [i.id, i]));
          let next = prev.map((i) => (updatedMap.get(i.id) as ActionItem) || i);
          if (isNew) next = [...next, result];
          return next;
        });
      } else {
        if (isNew) {
          setItems((prev) => [...prev, result]);
        } else {
          setItems((prev) => prev.map((i) => (i.id === result.id ? result : i)));
        }
      }

      // Update local dependencies state
      if (predecessorId !== undefined) {
        setDeps((prev) => {
          const filtered = prev.filter((d) => d.successorId !== itemId);
          if (predecessorId) {
            return [...filtered, { id: `temp-${Date.now()}`, predecessorId, successorId: itemId }];
          }
          return filtered;
        });
      }
    } else {
      const err = await res.json();
      throw new Error(err.error || "Save failed");
    }
    setEditItem(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/actions/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
    setEditItem(null);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{workstream}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: healthColor + "20", color: healthColor }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: healthColor }} />
              {health}
            </span>
            <span className="text-sm text-slate-500">
              {stats.completed}/{stats.total} completed · {stats.overdue} overdue
            </span>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-48 bg-slate-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${completionPct}%`, backgroundColor: healthColor }}
              />
            </div>
            <span className="text-sm text-slate-500">{Math.round(completionPct)}%</span>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex gap-2 flex-wrap justify-end">
          <StatPill label="Completed" value={stats.completed} color="text-green-600" bg="bg-green-50" />
          <StatPill label="On-track" value={stats.onTrack} color="text-blue-600" bg="bg-blue-50" />
          <StatPill label="At-risk" value={stats.atRisk} color="text-amber-600" bg="bg-amber-50" />
          <StatPill label="Overdue" value={stats.overdue} color="text-red-600" bg="bg-red-50" />
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-5">
        {Array.from(categories.entries()).map(([category, catItems]) => {
          const catSummary = categorySummaries.find((cs) => cs.category === category);
          const catCompleted = catItems.filter((i) => computeStatus(i) === "Completed").length;
          const catPct = catItems.length > 0 ? (catCompleted / catItems.length) * 100 : 0;

          return (
            <div key={category} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Category header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div>
                  <h3 className="font-semibold text-slate-700 text-sm">{category}</h3>
                  {catSummary && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(catSummary.startDate)} → {formatDate(catSummary.endDate)}
                      <span className="ml-2">({catSummary.duration}d)</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 bg-slate-200 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-blue-500"
                      style={{ width: `${catPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{catCompleted}/{catItems.length}</span>
                  <button
                    onClick={() =>
                      setEditItem({
                        id: "",
                        workstream,
                        category,
                        requirement: "",
                        action: "",
                        owner: "",
                        status: "On-track",
                        startDate: new Date().toISOString().split("T")[0],
                        duration: 14,
                        endDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
                        targetCompletionPct: 0,
                        actualCompletionPct: 0,
                        notes: "",
                        sortOrder: 0,
                        createdAt: "",
                        updatedAt: "",
                      })
                    }
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                  >
                    + Add item
                  </button>
                </div>
              </div>

              {/* Items table */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-2 text-slate-500 font-medium">Requirement</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Owner</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Status</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Dates</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-medium">%</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Notes</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {catItems.map((item) => {
                    const status = computeStatus(item);
                    const predId = predMap.get(item.id);
                    const pred = predId ? itemMap.get(predId) : null;

                    return (
                      <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 max-w-xs">
                          <p className="font-medium text-slate-700 truncate">
                            {item.requirement || "—"}
                          </p>
                          {pred && (
                            <p className="text-slate-400 text-xs mt-0.5">
                              ↳ depends on: {pred.requirement || pred.action.slice(0, 40)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{item.owner}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: STATUS_COLORS[status] + "20",
                              color: STATUS_COLORS[status],
                            }}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                          {formatDate(item.startDate)} → {formatDate(item.endDate)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600 font-medium">
                          {Math.round(item.targetCompletionPct * 100)}%
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 max-w-xs">
                          <p className="line-clamp-2">{item.notes}</p>
                        </td>
                        <td className="px-2 py-2.5">
                          <button
                            onClick={() => setEditItem(item)}
                            className="text-slate-300 hover:text-blue-500 transition-colors"
                          >
                            ✎
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Edit/Add modal */}
      {editItem !== null && (() => {
        const predId = editItem.id ? predMap.get(editItem.id) : undefined;
        const pred = predId ? itemMap.get(predId) : undefined;
        const succIds = editItem.id ? (succMap.get(editItem.id) || []) : [];
        const succs = succIds.map((id) => itemMap.get(id)).filter(Boolean) as ActionItem[];
        return (
          <ActionItemModal
            item={editItem.id ? editItem : null}
            onSave={handleSaveItem}
            onClose={() => setEditItem(null)}
            onDelete={handleDelete}
            predecessors={pred ? [pred] : []}
            successors={succs}
            allItems={allItems || items}
          />
        );
      })()}
    </div>
  );
}

function StatPill({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg px-3 py-1.5 text-center min-w-[64px]`}>
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

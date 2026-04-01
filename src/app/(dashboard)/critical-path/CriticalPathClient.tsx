"use client";
import { useMemo, useRef, useState } from "react";
import { ActionItem, Dependency, Project } from "@/types";
import { STATUS_COLORS, formatDate, formatPct } from "@/lib/utils";
import { computeStatus } from "@/lib/dashboard";
import ActionItemModal from "@/components/shared/ActionItemModal";

interface Props {
  items: ActionItem[];
  dependencies: Dependency[];
  project: Project | null;
  criticalIds: string[];
  totalDays: number;
  chain: ActionItem[];
  floatDays: Record<string, number>;
}

const ROW_HEIGHT = 32;
const LABEL_WIDTH = 280;
const HEADER_HEIGHT = 48;
const BAR_PADDING = 6;
const BAR_HEIGHT = ROW_HEIGHT - BAR_PADDING * 2;

export default function CriticalPathClient({ items, dependencies: initialDeps, project, criticalIds, totalDays, chain, floatDays }: Props) {
  const [editItem, setEditItem] = useState<ActionItem | null>(null);
  const [localItems, setLocalItems] = useState(items);
  const [deps, setDeps] = useState(initialDeps);
  const svgRef = useRef<SVGSVGElement>(null);
  const criticalSet = useMemo(() => new Set(criticalIds), [criticalIds]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // All critical items sorted by start date (for the table and Gantt)
  const criticalItems = useMemo(() => {
    return localItems
      .filter((i) => criticalSet.has(i.id))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [localItems, criticalSet]);

  // Date range from critical items
  const startDate = useMemo(() => {
    const src = criticalItems.length > 0 ? criticalItems : localItems;
    if (src.length === 0) return new Date("2026-02-01");
    const min = src.reduce((m, i) => {
      const d = new Date(i.startDate);
      return d < m ? d : m;
    }, new Date(src[0].startDate));
    return new Date(min.getFullYear(), min.getMonth(), 1);
  }, [criticalItems, localItems]);

  const endDate = useMemo(() => {
    if (project?.day1TargetDate) {
      const d = new Date(project.day1TargetDate);
      d.setDate(d.getDate() + 7);
      return d;
    }
    return new Date("2026-09-01");
  }, [project]);

  const pixelsPerDay = 6;
  const totalW = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) * pixelsPerDay;

  function dateToX(dateStr: string): number {
    const d = new Date(dateStr + "T00:00:00");
    const days = Math.ceil((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return days * pixelsPerDay;
  }

  function dateToXFromDate(d: Date): number {
    const days = Math.ceil((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return days * pixelsPerDay;
  }

  // Month lines
  const monthLines = useMemo(() => {
    const lines: { x: number; label: string }[] = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      lines.push({ x: dateToXFromDate(d), label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }) });
      d.setMonth(d.getMonth() + 1);
    }
    return lines;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const todayX = dateToXFromDate(today);
  const day1X = project ? dateToX(project.day1TargetDate) : null;

  const ganttHeight = criticalItems.length * ROW_HEIGHT + HEADER_HEIGHT;

  // Build dep set for checking actual links in the chain flow diagram
  const depSet = useMemo(() => {
    const s = new Set<string>();
    for (const dep of deps) s.add(`${dep.predecessorId}→${dep.successorId}`);
    return s;
  }, [deps]);

  // Build dep maps for modal
  const predMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const dep of deps) map.set(dep.successorId, dep.predecessorId);
    return map;
  }, [deps]);

  const succMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dep of deps) {
      if (!map.has(dep.predecessorId)) map.set(dep.predecessorId, []);
      map.get(dep.predecessorId)!.push(dep.successorId);
    }
    return map;
  }, [deps]);

  const itemMap = useMemo(() => {
    const map = new Map<string, ActionItem>();
    for (const item of localItems) map.set(item.id, item);
    return map;
  }, [localItems]);

  const editPredecessors = useMemo(() => {
    if (!editItem) return [];
    const predId = predMap.get(editItem.id);
    if (!predId) return [];
    const pred = itemMap.get(predId);
    return pred ? [pred] : [];
  }, [editItem, predMap, itemMap]);

  const editSuccessors = useMemo(() => {
    if (!editItem) return [];
    return (succMap.get(editItem.id) || []).map((id) => itemMap.get(id)).filter(Boolean) as ActionItem[];
  }, [editItem, succMap, itemMap]);

  async function handleSave(updated: ActionItem, predecessorId: string | null) {
    const res = await fetch(`/api/actions/${updated.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updated, predecessorId }),
    });
    if (res.ok) {
      const result = await res.json();
      if (result.updatedItems && Array.isArray(result.updatedItems)) {
        setLocalItems((prev) => {
          const updatedMap = new Map(result.updatedItems.map((i: ActionItem) => [i.id, i]));
          return prev.map((i) => (updatedMap.get(i.id) as ActionItem) || i);
        });
      } else {
        setLocalItems((prev) => prev.map((i) => (i.id === result.id ? result : i)));
      }

      // Update local dependencies state
      if (predecessorId !== undefined) {
        setDeps((prev) => {
          const filtered = prev.filter((d) => d.successorId !== updated.id);
          if (predecessorId) {
            return [...filtered, { id: `temp-${Date.now()}`, predecessorId, successorId: updated.id }];
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

  if (criticalItems.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p className="text-lg font-medium mb-2">No critical path found</p>
        <p className="text-sm">Upload a workplan with dependencies to see the critical path.</p>
      </div>
    );
  }

  const negativeFloat = criticalItems.filter((i) => (floatDays[i.id] ?? 0) < 0);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Critical Path</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Zero-float activities — any delay pushes past Day-1
            </p>
            {negativeFloat.length > 0 && (
              <p className="text-xs text-red-600 font-medium mt-1">
                ⚠ {negativeFloat.length} item{negativeFloat.length > 1 ? "s" : ""} already past their latest allowable date
              </p>
            )}
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Critical Items</div>
              <div className="text-2xl font-bold text-red-600">{criticalItems.length}</div>
              <div className="text-xs text-slate-400">of {items.length} total</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Main Chain</div>
              <div className="text-2xl font-bold text-slate-800">{totalDays} days</div>
              <div className="text-xs text-slate-400">{chain.length} linked items</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Chain flow — only if there's a connected critical chain */}
        {chain.length > 1 && (
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 overflow-x-auto">
            <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Longest critical chain</p>
            <div className="flex items-center gap-1 flex-wrap">
              {chain.map((item, i) => {
                const status = computeStatus(item);
                const color = STATUS_COLORS[status] || STATUS_COLORS["On-track"];
                const f = floatDays[item.id] ?? 0;
                return (
                  <div key={item.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setEditItem(item)}
                      className="flex flex-col items-center bg-white border-2 rounded-lg p-2 text-xs hover:shadow-md transition-shadow min-w-[100px] max-w-[130px] text-left"
                      style={{ borderColor: color }}
                    >
                      <div className="w-full font-semibold text-slate-700 truncate text-center" style={{ fontSize: 10 }}>
                        {item.requirement || item.workstream}
                      </div>
                      <div className="text-slate-400 text-center mt-0.5" style={{ fontSize: 9 }}>
                        {item.duration}d · {item.owner.split("/")[0]}
                      </div>
                      <div className="mt-1 px-1.5 py-0.5 rounded text-white text-center w-full" style={{ backgroundColor: color, fontSize: 9 }}>
                        {status}
                      </div>
                      {f < 0 && (
                        <div className="mt-0.5 text-red-600 font-bold text-center" style={{ fontSize: 9 }}>
                          {f}d late
                        </div>
                      )}
                    </button>
                    {i < chain.length - 1 && (
                      <span className="text-slate-300 text-lg">
                        {depSet.has(`${item.id}→${chain[i + 1].id}`) ? "→" : "⋯"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gantt showing ALL critical items */}
        <div className="flex" style={{ minWidth: LABEL_WIDTH + totalW }}>
          {/* Labels */}
          <div className="flex-shrink-0 bg-white border-r border-slate-200" style={{ width: LABEL_WIDTH }}>
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-slate-200 flex items-end px-3 pb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">All Critical Items ({criticalItems.length})</span>
            </div>
            {criticalItems.map((item) => {
              const status = computeStatus(item);
              const f = floatDays[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-center px-3 border-b border-slate-100 text-xs hover:bg-red-50 cursor-pointer"
                  onClick={() => setEditItem(item)}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mr-2" />
                  <span className="truncate text-slate-700 flex-1">{item.requirement || item.action.slice(0, 40)}</span>
                  {status === "Overdue" && <span className="ml-1 text-red-600 font-medium flex-shrink-0">LATE</span>}
                  {f < 0 && <span className="ml-1 text-red-600 font-medium flex-shrink-0">{f}d</span>}
                </div>
              );
            })}
          </div>

          {/* SVG Gantt */}
          <div className="overflow-x-auto flex-1">
            <svg ref={svgRef} width={totalW} height={ganttHeight} className="block">
              {/* Month grid */}
              {monthLines.map((line, i) => (
                <g key={i}>
                  <line x1={line.x} y1={0} x2={line.x} y2={ganttHeight} stroke="#E2E8F0" strokeWidth={1} />
                  <text x={line.x + 4} y={20} fill="#94A3B8" fontSize={11} fontWeight="500">{line.label}</text>
                </g>
              ))}

              {/* Today */}
              <line x1={todayX} y1={0} x2={todayX} y2={ganttHeight} stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4,3" />
              <text x={todayX + 3} y={36} fill="#EF4444" fontSize={10} fontWeight="600">Today</text>

              {/* Day-1 */}
              {day1X !== null && (
                <>
                  <line x1={day1X} y1={0} x2={day1X} y2={ganttHeight} stroke="#1E3A5F" strokeWidth={2} />
                  <text x={day1X + 3} y={36} fill="#1E3A5F" fontSize={10} fontWeight="700">Day-1</text>
                </>
              )}

              {/* Bars */}
              {criticalItems.map((item, idx) => {
                const x = dateToX(item.startDate);
                const endX = dateToX(item.endDate);
                const width = Math.max(endX - x, 4);
                const y = HEADER_HEIGHT + idx * ROW_HEIGHT + BAR_PADDING;
                const itemStatus = computeStatus(item);
                const color = STATUS_COLORS[itemStatus] || STATUS_COLORS["On-track"];
                const f = floatDays[item.id] ?? 0;
                const barColor = f < 0 ? "#EF4444" : color;

                return (
                  <g key={item.id}>
                    <rect x={x - 2} y={y - 2} width={width + 4} height={BAR_HEIGHT + 4} rx={4} fill="#FEE2E2" />
                    <rect x={x} y={y} width={width} height={BAR_HEIGHT} rx={3} fill={barColor} opacity={0.3} className="cursor-pointer" onClick={() => setEditItem(item)} />
                    <rect x={x} y={y} width={width * item.actualCompletionPct} height={BAR_HEIGHT} rx={3} fill={barColor} className="cursor-pointer" onClick={() => setEditItem(item)} />
                    <rect x={x} y={y} width={width} height={BAR_HEIGHT} rx={3} fill="none" stroke="#EF4444" strokeWidth={1.5} />
                    {width > 40 && (
                      <text x={x + 4} y={y + BAR_HEIGHT / 2 + 4} fontSize={10} fill="white" style={{ pointerEvents: "none" }}>
                        {item.requirement.slice(0, Math.floor(width / 6.5))}
                      </text>
                    )}
                  </g>
                );
              })}

              <defs>
                <marker id="cp-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 0, 6 3, 0 6" fill="#EF4444" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>

        {/* Detail table — ALL critical items */}
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Critical Items — sorted by start date</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">#</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Item</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Owner</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Start</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">End</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-medium">Days</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-medium">Float</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-medium">Actual %</th>
                </tr>
              </thead>
              <tbody>
                {criticalItems.map((item, idx) => {
                  const tableStatus = computeStatus(item);
                  const f = floatDays[item.id] ?? 0;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 hover:bg-red-50 cursor-pointer"
                      onClick={() => setEditItem(item)}
                    >
                      <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                          <span className="text-slate-700 font-medium">{item.requirement || item.action.slice(0, 60)}</span>
                        </div>
                        <div className="text-slate-400 pl-3.5">{item.workstream} · {item.category}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{item.owner}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          tableStatus === "Overdue" ? "bg-red-100 text-red-700" :
                          tableStatus === "At-risk" ? "bg-amber-100 text-amber-700" :
                          tableStatus === "Completed" ? "bg-green-100 text-green-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>
                          {tableStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(item.startDate)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(item.endDate)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-700">{item.duration}</td>
                      <td className={`px-3 py-2 text-right font-bold ${f < 0 ? "text-red-600" : f === 0 ? "text-orange-500" : "text-slate-400"}`}>
                        {f === 0 ? "0d" : `${f > 0 ? "+" : ""}${f}d`}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-blue-600">{formatPct(item.actualCompletionPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={6} className="px-3 py-2 text-right text-slate-500 font-medium">Totals / Avg</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-800">
                    {criticalItems.reduce((s, i) => s + i.duration, 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400 text-xs">
                    min: {Math.min(...criticalItems.map((i) => floatDays[i.id] ?? 0))}d
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-blue-600">
                    {criticalItems.length > 0 ? Math.round(criticalItems.reduce((s, i) => s + i.actualCompletionPct, 0) / criticalItems.length * 100) : 0}% avg
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {editItem && (
        <ActionItemModal
          item={editItem}
          onSave={handleSave}
          onClose={() => setEditItem(null)}
          predecessors={editPredecessors}
          successors={editSuccessors}
          allItems={localItems}
        />
      )}
    </div>
  );
}

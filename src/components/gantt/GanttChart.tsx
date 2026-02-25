"use client";
import { useState, useRef, useMemo } from "react";
import { ActionItem, Dependency, Project } from "@/types";
import { STATUS_COLORS, formatDate, formatPct } from "@/lib/utils";
import ActionItemModal from "@/components/shared/ActionItemModal";

interface Props {
  items: ActionItem[];
  dependencies: Dependency[];
  project: Project | null;
}

type GroupBy = "workstream" | "category" | "owner";
type ZoomLevel = "month" | "week";

const ROW_HEIGHT = 30;
const LABEL_WIDTH = 270;
const HEADER_HEIGHT = 56;
const BAR_PADDING = 6;
const BAR_HEIGHT = ROW_HEIGHT - BAR_PADDING * 2;

export default function GanttChart({ items: initialItems, dependencies, project }: Props) {
  const [items, setItems] = useState(initialItems);
  const [groupBy, setGroupBy] = useState<GroupBy>("workstream");
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ item: ActionItem; x: number; y: number } | null>(null);
  const [editItem, setEditItem] = useState<ActionItem | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const startDate = useMemo(() => {
    if (items.length === 0) return new Date("2026-02-01");
    const minDate = items.reduce((min, item) => {
      const d = new Date(item.startDate);
      return d < min ? d : min;
    }, new Date(items[0].startDate));
    return new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  }, [items]);

  const endDate = useMemo(() => {
    if (project?.day1TargetDate) {
      const d = new Date(project.day1TargetDate);
      d.setDate(d.getDate() + 14);
      return d;
    }
    return new Date("2026-09-01");
  }, [project]);

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const pixelsPerDay = zoom === "week" ? 9 : 4;
  const chartWidth = totalDays * pixelsPerDay;

  function dateToX(dateStr: string): number {
    const d = new Date(dateStr + "T00:00:00");
    const days = Math.ceil((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return days * pixelsPerDay;
  }

  function dateToXFromDate(d: Date): number {
    const days = Math.ceil((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return days * pixelsPerDay;
  }

  // Month grid lines
  const monthLines = useMemo(() => {
    const lines: { x: number; label: string }[] = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      lines.push({
        x: dateToXFromDate(d),
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      });
      d.setMonth(d.getMonth() + 1);
    }
    return lines;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, pixelsPerDay]);

  // Week grid lines
  const weekLines = useMemo(() => {
    const lines: { x: number; label: string; isMonthStart: boolean }[] = [];
    const d = new Date(startDate);
    // Start on a Monday
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    while (d <= endDate) {
      const isMonthStart = d.getDate() <= 7;
      lines.push({
        x: dateToXFromDate(d),
        label: isMonthStart
          ? d.toLocaleString("en-US", { month: "short", day: "numeric" })
          : d.toLocaleString("en-US", { day: "numeric" }),
        isMonthStart,
      });
      d.setDate(d.getDate() + 7);
    }
    return lines;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, pixelsPerDay]);

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // Group items
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { label: string; items: ActionItem[] }>();
    for (const item of items) {
      let key = "";
      if (groupBy === "workstream") key = item.workstream;
      else if (groupBy === "category") key = `${item.workstream} · ${item.category}`;
      else key = item.owner;
      if (!groups.has(key)) groups.set(key, { label: key, items: [] });
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values());
  }, [items, groupBy]);

  // Flat rows (respecting collapsed groups)
  const rows = useMemo(() => {
    const result: Array<{ type: "group"; label: string; count: number } | { type: "item"; item: ActionItem }> = [];
    for (const group of groupedItems) {
      result.push({ type: "group", label: group.label, count: group.items.length });
      if (!collapsedGroups.has(group.label)) {
        for (const item of group.items) {
          result.push({ type: "item", item });
        }
      }
    }
    return result;
  }, [groupedItems, collapsedGroups]);

  // Item row index map (for dependency arrows)
  const itemRowMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, idx) => {
      if (row.type === "item") map.set(row.item.id, idx);
    });
    return map;
  }, [rows]);

  // Build predecessor/successor maps for modal
  const predMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const dep of dependencies) {
      map.set(dep.successorId, dep.predecessorId);
    }
    return map;
  }, [dependencies]);

  const succMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dep of dependencies) {
      if (!map.has(dep.predecessorId)) map.set(dep.predecessorId, []);
      map.get(dep.predecessorId)!.push(dep.successorId);
    }
    return map;
  }, [dependencies]);

  const itemMap = useMemo(() => {
    const map = new Map<string, ActionItem>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const totalHeight = rows.length * ROW_HEIGHT + HEADER_HEIGHT;
  const todayX = dateToXFromDate(today);
  const day1X = project ? dateToX(project.day1TargetDate) : null;

  function getBarColor(item: ActionItem): string {
    const isOverdue = item.status !== "Completed" && new Date(item.endDate) < today;
    if (isOverdue) return STATUS_COLORS["Overdue"];
    return STATUS_COLORS[item.status] || STATUS_COLORS["Not Started"];
  }

  function handleBarClick(item: ActionItem) {
    setTooltip(null);
    setEditItem(item);
  }

  async function handleSaveItem(updated: ActionItem) {
    const res = await fetch(`/api/actions/${updated.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const saved = await res.json();
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
    }
    setEditItem(null);
  }

  // Resolve predecessors and successors for the edit item
  const editPredecessors = useMemo(() => {
    if (!editItem) return [];
    const predId = predMap.get(editItem.id);
    if (!predId) return [];
    const pred = itemMap.get(predId);
    return pred ? [pred] : [];
  }, [editItem, predMap, itemMap]);

  const editSuccessors = useMemo(() => {
    if (!editItem) return [];
    const succIds = succMap.get(editItem.id) || [];
    return succIds.map((id) => itemMap.get(id)).filter(Boolean) as ActionItem[];
  }, [editItem, succMap, itemMap]);

  const gridLines = zoom === "week" ? weekLines : monthLines;

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
        <h1 className="text-base font-semibold text-slate-800">Gantt Chart</h1>

        <div className="flex items-center gap-2 ml-4">
          <span className="text-xs text-slate-500">Group:</span>
          {(["workstream", "category", "owner"] as GroupBy[]).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                groupBy === g ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-slate-500">Zoom:</span>
          {(["month", "week"] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                zoom === z ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={() => setCollapsedGroups(new Set(groupedItems.map((g) => g.label)))}
            className="px-2.5 py-1 rounded text-xs text-slate-600 bg-slate-100 hover:bg-slate-200"
          >
            Collapse All
          </button>
          <button
            onClick={() => setCollapsedGroups(new Set())}
            className="px-2.5 py-1 rounded text-xs text-slate-600 bg-slate-100 hover:bg-slate-200"
          >
            Expand All
          </button>
        </div>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-xs text-slate-500">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Gantt area */}
      <div className="flex-1 overflow-auto">
        <div className="flex" style={{ minWidth: LABEL_WIDTH + chartWidth }}>
          {/* Left labels */}
          <div className="flex-shrink-0 bg-white border-r border-slate-200 z-10" style={{ width: LABEL_WIDTH }}>
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-slate-200" />
            {rows.map((row, idx) => (
              <div
                key={idx}
                style={{ height: ROW_HEIGHT }}
                className={`flex items-center px-3 border-b border-slate-100 text-xs ${
                  row.type === "group"
                    ? "bg-slate-50 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={row.type === "group" ? () => toggleGroup(row.label) : undefined}
              >
                {row.type === "group" ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-slate-400 text-xs w-3">
                      {collapsedGroups.has(row.label) ? "▶" : "▼"}
                    </span>
                    <span className="truncate flex-1">{row.label}</span>
                    <span className="text-slate-400 text-xs ml-auto">{row.count}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleBarClick(row.item)}
                    className="text-left truncate hover:text-blue-600 w-full pl-4"
                  >
                    {row.item.requirement || row.item.action.slice(0, 35)}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* SVG chart area */}
          <div className="overflow-x-auto flex-1 relative">
            <svg ref={svgRef} width={chartWidth} height={totalHeight} className="block">
              {/* Grid lines */}
              {gridLines.map((line, i) => (
                <g key={i}>
                  <line
                    x1={line.x} y1={0} x2={line.x} y2={totalHeight}
                    stroke={"isMonthStart" in line && line.isMonthStart ? "#CBD5E1" : "#E2E8F0"}
                    strokeWidth={"isMonthStart" in line && line.isMonthStart ? 1 : 0.5}
                  />
                  <text
                    x={line.x + 3} y={zoom === "week" ? 16 : 20}
                    fill={"isMonthStart" in line && line.isMonthStart ? "#64748B" : "#94A3B8"}
                    fontSize={zoom === "week" ? 9 : 11}
                    fontWeight={"isMonthStart" in line && line.isMonthStart ? "600" : "400"}
                  >
                    {line.label}
                  </text>
                </g>
              ))}

              {/* In week mode, show month labels as secondary header */}
              {zoom === "week" && monthLines.map((line, i) => (
                <text
                  key={`month-${i}`}
                  x={line.x + 3} y={30}
                  fill="#475569"
                  fontSize={10}
                  fontWeight="600"
                >
                  {line.label}
                </text>
              ))}

              {/* Today line */}
              <line x1={todayX} y1={0} x2={todayX} y2={totalHeight} stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4,3" />
              <text x={todayX + 3} y={zoom === "week" ? 44 : 36} fill="#EF4444" fontSize={10} fontWeight="600">Today</text>

              {/* Day-1 line */}
              {day1X !== null && (
                <>
                  <line x1={day1X} y1={0} x2={day1X} y2={totalHeight} stroke="#1E3A5F" strokeWidth={2} />
                  <text x={day1X + 3} y={zoom === "week" ? 44 : 36} fill="#1E3A5F" fontSize={10} fontWeight="700">Day-1</text>
                </>
              )}

              {/* Row backgrounds */}
              {rows.map((row, idx) => (
                <rect
                  key={`bg-${idx}`}
                  x={0} y={HEADER_HEIGHT + idx * ROW_HEIGHT}
                  width={chartWidth} height={ROW_HEIGHT}
                  fill={row.type === "group" ? "#F8FAFC" : "transparent"}
                />
              ))}

              {/* Bars */}
              {rows.map((row, idx) => {
                if (row.type !== "item") return null;
                const item = row.item;
                const x = dateToX(item.startDate);
                const endX = dateToX(item.endDate);
                const width = Math.max(endX - x, 4);
                const y = HEADER_HEIGHT + idx * ROW_HEIGHT + BAR_PADDING;
                const color = getBarColor(item);
                // Use actualCompletionPct for bar fill
                const fillWidth = width * item.actualCompletionPct;

                return (
                  <g key={item.id}>
                    <rect x={x} y={y} width={width} height={BAR_HEIGHT} rx={3} fill={color} opacity={0.25} className="cursor-pointer" onClick={() => handleBarClick(item)} />
                    <rect x={x} y={y} width={fillWidth} height={BAR_HEIGHT} rx={3} fill={color} className="cursor-pointer" onClick={() => handleBarClick(item)} />
                    <rect
                      x={x} y={y} width={width} height={BAR_HEIGHT} rx={3} fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={(e) => {
                        const rect = svgRef.current?.getBoundingClientRect();
                        if (rect) setTooltip({ item, x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => handleBarClick(item)}
                    />
                    {width > 50 && (
                      <text x={x + 4} y={y + BAR_HEIGHT / 2 + 4} fontSize={10} fill={item.status === "Not Started" ? "#475569" : "white"} style={{ pointerEvents: "none" }}>
                        {(item.requirement || item.owner).slice(0, Math.floor(width / 6.5))}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Dependency arrows */}
              {dependencies.map((dep, i) => {
                const predRowIdx = itemRowMap.get(dep.predecessorId);
                const sucRowIdx = itemRowMap.get(dep.successorId);
                const pred = itemMap.get(dep.predecessorId);
                const suc = itemMap.get(dep.successorId);
                if (predRowIdx === undefined || sucRowIdx === undefined || !pred || !suc) return null;

                const x1 = dateToX(pred.endDate);
                const y1 = HEADER_HEIGHT + predRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                const x2 = dateToX(suc.startDate);
                const y2 = HEADER_HEIGHT + sucRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                const cx1 = x1 + Math.min(20, (x2 - x1) / 2);
                const cx2 = x2 - Math.min(20, (x2 - x1) / 2);

                return (
                  <g key={i}>
                    <path d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`} stroke="#94A3B8" strokeWidth={1} fill="none" markerEnd="url(#arrowhead)" />
                  </g>
                );
              })}

              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 0, 6 3, 0 6" fill="#94A3B8" />
                </marker>
              </defs>
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-xs pointer-events-none"
                style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
              >
                <p className="font-semibold text-slate-800 mb-1">
                  {tooltip.item.requirement || tooltip.item.action.slice(0, 60)}
                </p>
                <div className="space-y-0.5 text-slate-600">
                  <p><span className="text-slate-400">Owner:</span> {tooltip.item.owner}</p>
                  <p><span className="text-slate-400">Status:</span> {tooltip.item.status}</p>
                  <p><span className="text-slate-400">Dates:</span> {formatDate(tooltip.item.startDate)} → {formatDate(tooltip.item.endDate)}</p>
                  <p><span className="text-slate-400">Actual:</span> {formatPct(tooltip.item.actualCompletionPct)}</p>
                  <p><span className="text-slate-400">Target:</span> {formatPct(tooltip.item.targetCompletionPct)}</p>
                  {tooltip.item.notes && (
                    <p className="text-slate-500 mt-1 border-t border-slate-100 pt-1">{tooltip.item.notes.slice(0, 100)}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editItem && (
        <ActionItemModal
          item={editItem}
          onSave={handleSaveItem}
          onClose={() => setEditItem(null)}
          predecessors={editPredecessors}
          successors={editSuccessors}
        />
      )}
    </div>
  );
}

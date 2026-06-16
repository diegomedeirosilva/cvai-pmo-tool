"use client";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { ActionItem, Dependency, Project } from "@/types";
import { STATUS_COLORS, formatDate, formatPct } from "@/lib/utils";
import ActionItemModal from "@/components/shared/ActionItemModal";
import { computeCascade } from "@/lib/cascade";

interface Props {
  items: ActionItem[];
  dependencies: Dependency[];
  project: Project | null;
}

type GroupBy = "category" | "owner";
type ZoomLevel = "month" | "week";

const ROW_HEIGHT = 30;
const LABEL_WIDTH = 270;
const HEADER_HEIGHT = 56;
const BAR_PADDING = 6;
const BAR_HEIGHT = ROW_HEIGHT - BAR_PADDING * 2;

export default function GanttChart({ items: initialItems, dependencies: initialDeps, project }: Props) {
  const [items, setItems] = useState(initialItems);
  const [deps, setDeps] = useState(initialDeps);
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ item: ActionItem; x: number; y: number } | null>(null);
  const [editItem, setEditItem] = useState<ActionItem | null>(null);
  const [showDeps, setShowDeps] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  // --- Drag state ---
  interface DragState {
    itemId: string;
    mode: "move" | "resize-left" | "resize-right";
    startMouseX: number;
    origBarX: number;
    origBarEndX: number;
    currentBarX: number;
    currentBarEndX: number;
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Optimistic UI refs — allow drag handlers to read latest state without stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const dragSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const startDate = useMemo(() => {
    if (items.length === 0) return new Date("2026-02-01");
    // Include baseline start dates so baseline bars don't render off-screen after a cascade
    const allStarts = items.flatMap((item) =>
      [item.startDate, item.baselineStartDate].filter(Boolean) as string[]
    );
    const minDate = allStarts.reduce((min, d) => {
      const dt = new Date(d);
      return dt < min ? dt : min;
    }, new Date(allStarts[0]));
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

  function xToDate(x: number): string {
    const days = Math.round(x / pixelsPerDay);
    const ms = startDate.getTime() + days * 86400000;
    return new Date(ms).toISOString().split("T")[0];
  }

  const EDGE_ZONE = 6;
  const DRAG_THRESHOLD = 3;

  function getDragMode(mouseX: number, barX: number, barWidth: number): "move" | "resize-left" | "resize-right" {
    if (mouseX - barX <= EDGE_ZONE) return "resize-left";
    if (barX + barWidth - mouseX <= EDGE_ZONE) return "resize-right";
    return "move";
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
    // Start on a Sunday
    const day = d.getDay();
    const diff = -day;
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
    dragRef.current = null; setDrag(null); document.body.style.cursor = "";
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
      if (groupBy === "category") key = `${item.workstream} · ${item.category}`;
      else key = item.owner;
      if (!groups.has(key)) groups.set(key, { label: key, items: [] });
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values());
  }, [items, groupBy]);

  // Group date ranges for summary bars when collapsed
  const groupStats = useMemo(() => {
    const stats = new Map<string, { minStart: string; maxEnd: string; completedPct: number; completed: number; total: number }>();
    for (const group of groupedItems) {
      if (group.items.length === 0) continue;
      let minStart = group.items[0].startDate;
      let maxEnd = group.items[0].endDate;
      let completed = 0;
      for (const item of group.items) {
        if (item.startDate < minStart) minStart = item.startDate;
        if (item.endDate > maxEnd) maxEnd = item.endDate;
        if (item.actualCompletionPct >= 1.0) completed++;
      }
      stats.set(group.label, {
        minStart,
        maxEnd,
        completedPct: completed / group.items.length,
        completed,
        total: group.items.length,
      });
    }
    return stats;
  }, [groupedItems]);

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
    for (const dep of deps) {
      map.set(dep.successorId, dep.predecessorId);
    }
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
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const totalHeight = rows.length * ROW_HEIGHT + HEADER_HEIGHT;
  const todayX = dateToXFromDate(today);
  const day1X = project ? dateToX(project.day1TargetDate) : null;

  function getBarColor(item: ActionItem): string {
    const status = item.actualCompletionPct >= 1.0 ? "Completed"
      : new Date(item.endDate) < today ? "Overdue"
      : item.actualCompletionPct === 0 && new Date(item.startDate) >= today ? "Not Started"
      : item.actualCompletionPct < item.targetCompletionPct ? "At-risk"
      : "On-track";
    return STATUS_COLORS[status] || STATUS_COLORS["On-track"];
  }

  function handleBarClick(item: ActionItem) {
    setTooltip(null);
    setEditItem(item);
  }

  // --- Drag handlers ---
  function handleDragStart(e: React.MouseEvent<SVGRectElement>, item: ActionItem) {
    if (e.button !== 0) return;
    const barX = dateToX(item.startDate);
    const barEndX = dateToX(item.endDate);
    const barWidth = Math.max(barEndX - barX, 4);

    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const scrollLeft = svgRef.current?.parentElement?.scrollLeft || 0;
    const localX = e.clientX - svgRect.left + scrollLeft;
    const mode = getDragMode(localX, barX, barWidth);

    const state: DragState = {
      itemId: item.id,
      mode,
      startMouseX: e.clientX,
      origBarX: barX,
      origBarEndX: barEndX,
      currentBarX: barX,
      currentBarEndX: barEndX,
    };
    dragRef.current = state;
    setDrag(state);
    setTooltip(null);
    document.body.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
    e.preventDefault();
  }

  const handleDragMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaX = e.clientX - d.startMouseX;

    let newBarX = d.origBarX;
    let newBarEndX = d.origBarEndX;

    if (d.mode === "move") {
      newBarX = d.origBarX + deltaX;
      newBarEndX = d.origBarEndX + deltaX;
    } else if (d.mode === "resize-left") {
      newBarX = Math.min(d.origBarX + deltaX, d.origBarEndX - pixelsPerDay);
    } else {
      newBarEndX = Math.max(d.origBarEndX + deltaX, d.origBarX + pixelsPerDay);
    }

    // Clamp to chart boundaries
    if (d.mode === "move") {
      const barW = newBarEndX - newBarX;
      if (newBarX < 0) { newBarX = 0; newBarEndX = barW; }
      if (newBarEndX > chartWidth) { newBarEndX = chartWidth; newBarX = chartWidth - barW; }
    } else {
      newBarX = Math.max(0, newBarX);
      newBarEndX = Math.min(chartWidth, newBarEndX);
    }

    const updated = { ...d, currentBarX: newBarX, currentBarEndX: newBarEndX };
    dragRef.current = updated;
    setDrag(updated);
  }, [pixelsPerDay, chartWidth]);

  const handleDragEnd = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;

    document.body.style.cursor = "";
    dragRef.current = null;
    setDrag(null);

    // Below threshold → treat as click
    if (Math.abs(e.clientX - d.startMouseX) < DRAG_THRESHOLD) {
      const item = itemsRef.current.find((i) => i.id === d.itemId);
      if (item) handleBarClick(item);
      return;
    }

    const newStartDate = xToDate(d.currentBarX);
    const newEndDate = xToDate(d.currentBarEndX);
    const newDuration = Math.max(Math.round(
      (new Date(newEndDate + "T00:00:00").getTime() - new Date(newStartDate + "T00:00:00").getTime()) / 86400000
    ), 1);

    const item = itemsRef.current.find((i) => i.id === d.itemId);
    if (!item || (newStartDate === item.startDate && newEndDate === item.endDate)) return;

    const updated: ActionItem = { ...item, startDate: newStartDate, endDate: newEndDate, duration: newDuration };

    // --- Optimistic UI: snap bar + cascade locally (instant) ---
    const withUpdated = itemsRef.current.map((i) => i.id === updated.id ? updated : i);
    const cascadeChanges = computeCascade(updated.id, withUpdated, depsRef.current);

    // Save originals for rollback on error
    const rollbackOriginals = new Map<string, ActionItem>();
    rollbackOriginals.set(item.id, { ...item });
    for (const c of cascadeChanges) {
      const orig = itemsRef.current.find((i) => i.id === c.id);
      if (orig) rollbackOriginals.set(c.id, { ...orig });
    }

    // Apply local cascade
    const changeMap = new Map(cascadeChanges.map((c) => [c.id, c]));
    const optimistic = withUpdated.map((i) => {
      const c = changeMap.get(i.id);
      if (!c) return i;
      const dur = Math.max(Math.round((new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / 86400000), 0);
      return { ...i, startDate: c.startDate, endDate: c.endDate, duration: dur };
    });
    itemsRef.current = optimistic;
    setItems(optimistic);

    // --- Debounce: cancel previous save for this bar ---
    const prevTimer = dragSaveTimers.current.get(item.id);
    if (prevTimer) clearTimeout(prevTimer);

    dragSaveTimers.current.set(item.id, setTimeout(async () => {
      dragSaveTimers.current.delete(updated.id);
      try {
        const res = await fetch(`/api/actions/${updated.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (res.ok) {
          const result = await res.json();
          // Server cascade is authoritative — apply over optimistic
          if (result.updatedItems && Array.isArray(result.updatedItems)) {
            setItems((prev) => {
              const map = new Map(result.updatedItems.map((i: ActionItem) => [i.id, i]));
              const next = prev.map((i) => (map.get(i.id) as ActionItem) || i);
              itemsRef.current = next;
              return next;
            });
          }
        } else {
          // Rollback all optimistic changes on error
          setItems((prev) => {
            const next = prev.map((i) => rollbackOriginals.get(i.id) || i);
            itemsRef.current = next;
            return next;
          });
        }
      } catch {
        setItems((prev) => {
          const next = prev.map((i) => rollbackOriginals.get(i.id) || i);
          itemsRef.current = next;
          return next;
        });
      }
    }, 300));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, pixelsPerDay]);

  useEffect(() => {
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
    return () => {
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  async function handleSaveItem(updated: ActionItem, predecessorId: string | null | undefined) {
    const isNew = !updated.id;
    const url = isNew ? "/api/actions" : `/api/actions/${updated.id}`;
    const method = isNew ? "POST" : "PUT";

    // Only include predecessorId in body when explicitly set (not undefined)
    const body = predecessorId !== undefined
      ? { ...updated, predecessorId }
      : { ...updated };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const result = await res.json();
      const itemId = updated.id || result.id;

      if (result.updatedItems && Array.isArray(result.updatedItems)) {
        setItems((prev) => {
          const updatedMap = new Map(result.updatedItems.map((i: ActionItem) => [i.id, i]));
          return prev.map((i) => (updatedMap.get(i.id) as ActionItem) || i);
        });
        if (isNew) setItems((prev) => [...prev, result]);
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
          // Remove old predecessor deps for this item
          const filtered = prev.filter((d) => d.successorId !== itemId);
          // Add new one if set
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
          {(["category", "owner"] as GroupBy[]).map((g) => (
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

        <button
          onClick={() => setShowDeps((prev) => !prev)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            showDeps ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {showDeps ? "Hide Deps" : "Show Deps"}
        </button>

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
                    x={line.x + 3} y={20}
                    fill={"isMonthStart" in line && line.isMonthStart ? "#64748B" : "#94A3B8"}
                    fontSize={zoom === "week" ? 9 : 11}
                    fontWeight={"isMonthStart" in line && line.isMonthStart ? "600" : "400"}
                  >
                    {line.label}
                  </text>
                </g>
              ))}

              {/* Month labels removed from week view per user preference */}

              {/* Today line */}
              <line x1={todayX} y1={0} x2={todayX} y2={totalHeight} stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4,3" />
              <text x={todayX + 3} y={36} fill="#EF4444" fontSize={10} fontWeight="600">Today</text>

              {/* Day-1 line */}
              {day1X !== null && (
                <>
                  <line x1={day1X} y1={0} x2={day1X} y2={totalHeight} stroke="#1E3A5F" strokeWidth={2} />
                  <text x={day1X + 3} y={36} fill="#1E3A5F" fontSize={10} fontWeight="700">Day-1</text>
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
                const isDragging = drag && drag.itemId === item.id;
                const x = isDragging ? drag.currentBarX : dateToX(item.startDate);
                const endX = isDragging ? drag.currentBarEndX : dateToX(item.endDate);
                const width = Math.max(endX - x, 4);
                const y = HEADER_HEIGHT + idx * ROW_HEIGHT + BAR_PADDING;
                const color = getBarColor(item);
                const fillWidth = isDragging ? 0 : width * item.actualCompletionPct;

                return (
                  <g key={item.id}>
                    {/* Ghost bar showing original position during drag */}
                    {isDragging && (
                      <rect
                        x={dateToX(item.startDate)} y={y}
                        width={Math.max(dateToX(item.endDate) - dateToX(item.startDate), 4)}
                        height={BAR_HEIGHT} rx={3}
                        fill="none" stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.4}
                      />
                    )}
                    {/* Baseline bar — shown when item has slipped from original plan */}
                    {!isDragging && item.baselineStartDate && item.baselineEndDate && item.baselineEndDate !== item.endDate && (
                      <rect
                        x={dateToX(item.baselineStartDate)} y={y}
                        width={Math.max(dateToX(item.baselineEndDate) - dateToX(item.baselineStartDate), 4)}
                        height={BAR_HEIGHT} rx={3}
                        fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.5}
                      />
                    )}
                    <rect x={x} y={y} width={width} height={BAR_HEIGHT} rx={3} fill={color} opacity={isDragging ? 0.45 : 0.25} />
                    <rect x={x} y={y} width={fillWidth} height={BAR_HEIGHT} rx={3} fill={color} />
                    {/* Interaction rect */}
                    <rect
                      x={x} y={y} width={width} height={BAR_HEIGHT} rx={3} fill="transparent"
                      style={{ cursor: drag ? "grabbing" : "grab" }}
                      onMouseDown={(e) => handleDragStart(e, item)}
                      onMouseMove={(e) => {
                        if (drag) return;
                        const svgRect = svgRef.current?.getBoundingClientRect();
                        if (!svgRect) return;
                        const scrollLeft = svgRef.current?.parentElement?.scrollLeft || 0;
                        const localX = e.clientX - svgRect.left + scrollLeft;
                        const mode = getDragMode(localX, x, width);
                        e.currentTarget.style.cursor = mode === "move" ? "grab" : "ew-resize";
                      }}
                      onMouseEnter={(e) => {
                        if (drag) return;
                        const rect = svgRef.current?.getBoundingClientRect();
                        if (rect) setTooltip({ item, x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      onMouseLeave={() => { if (!drag) setTooltip(null); }}
                    />
                    {/* Date label above bar during drag */}
                    {isDragging && (
                      <text x={x} y={y - 3} fontSize={9} fill="#475569" style={{ pointerEvents: "none" }}>
                        {xToDate(drag.currentBarX)} → {xToDate(drag.currentBarEndX)}
                      </text>
                    )}
                    {!isDragging && width > 50 && (
                      <text x={x + 4} y={y + BAR_HEIGHT / 2 + 4} fontSize={10} fill="white" style={{ pointerEvents: "none" }}>
                        {(item.requirement || item.owner).slice(0, Math.floor(width / 6.5))}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Group summary bars (when collapsed) */}
              {rows.map((row, idx) => {
                if (row.type !== "group") return null;
                if (!collapsedGroups.has(row.label)) return null;
                const stats = groupStats.get(row.label);
                if (!stats) return null;

                const x = dateToX(stats.minStart);
                const endX = dateToX(stats.maxEnd);
                const width = Math.max(endX - x, 4);
                const y = HEADER_HEIGHT + idx * ROW_HEIGHT + BAR_PADDING;
                const fillWidth = width * stats.completedPct;

                return (
                  <g key={`group-bar-${row.label}`}>
                    <rect x={x} y={y} width={width} height={BAR_HEIGHT} rx={3} fill="#64748B" opacity={0.15} />
                    <rect x={x} y={y} width={fillWidth} height={BAR_HEIGHT} rx={3} fill="#22C55E" opacity={0.5} />
                    {width > 60 && (
                      <text x={x + 4} y={y + BAR_HEIGHT / 2 + 4} fontSize={10} fill="#475569" style={{ pointerEvents: "none" }}>
                        {stats.completed}/{stats.total} completed
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Dependency arrows (dashed, toggleable) */}
              {showDeps && deps.map((dep, i) => {
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
                    <path d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`} stroke="#94A3B8" strokeWidth={1} fill="none" strokeDasharray="4,3" markerEnd="url(#arrowhead)" />
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
                  {tooltip.item.baselineEndDate && tooltip.item.baselineEndDate !== tooltip.item.endDate && (
                    <p className="text-amber-600 mt-1 border-t border-slate-100 pt-1">
                      Original end: {formatDate(tooltip.item.baselineEndDate)} — slipped {Math.round((new Date(tooltip.item.endDate).getTime() - new Date(tooltip.item.baselineEndDate).getTime()) / 86400000)}d
                    </p>
                  )}
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
          allItems={items}
        />
      )}
    </div>
  );
}

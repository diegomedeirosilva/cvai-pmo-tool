"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ActionItem, DashboardSummary, Snapshot } from "@/types";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  ComposedChart, Area, CartesianGrid, XAxis, YAxis, Legend,
} from "recharts";
import { HEALTH_COLORS, HEALTH_LABELS, formatDate } from "@/lib/utils";
import { computeStatus, computeHealth, rollupStatus } from "@/lib/dashboard";
import WorkstreamHealthTable from "./WorkstreamHealthTable";
import MilestonesCard from "./MilestonesCard";
import AttentionCard from "./AttentionCard";
import ActionItemModal from "../shared/ActionItemModal";

interface Props {
  summary: Omit<DashboardSummary, "aiSummary">;
  items: ActionItem[];
}

export default function DashboardClient({ summary, items }: Props) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [allItems, setAllItems] = useState(items);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // Sync allItems when server props change (e.g. after router.refresh())
  useEffect(() => { setAllItems(items); }, [items]);

  // Fetch the recorded snapshots (historical points) for the trend chart.
  useEffect(() => {
    fetch("/api/snapshots")
      .then((r) => r.json())
      .then((data: Snapshot[]) => setSnapshots(Array.isArray(data) ? data : []))
      .catch(() => setSnapshots([]));
  }, []);

  // Recompute stats from live allItems so all cards update instantly on save
  const liveStats = useMemo(() => {
    let notStarted = 0, completed = 0, onTrack = 0, atRisk = 0, overdue = 0;
    for (const item of allItems) {
      const status = computeStatus(item);
      switch (status) {
        case "Not Started": notStarted++; break;
        case "Completed": completed++; break;
        case "On-track": onTrack++; break;
        case "At-risk": atRisk++; break;
        case "Overdue": overdue++; break;
      }
    }
    const total = allItems.length;
    const health = computeHealth(total, completed, overdue, atRisk);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in14Days = new Date(today);
    in14Days.setDate(in14Days.getDate() + 14);
    const milestones = allItems
      .filter((item) => {
        if (computeStatus(item) === "Completed") return false;
        const end = new Date(item.endDate);
        return end >= today && end <= in14Days;
      })
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

    const wsMap = new Map<string, { total: number; notStarted: number; completed: number; onTrack: number; atRisk: number; overdue: number; sumPct: number }>();
    for (const item of allItems) {
      if (!wsMap.has(item.workstream)) wsMap.set(item.workstream, { total: 0, notStarted: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0, sumPct: 0 });
      const ws = wsMap.get(item.workstream)!;
      ws.total++;
      ws.sumPct += item.actualCompletionPct || 0;
      const s = computeStatus(item);
      switch (s) {
        case "Not Started": ws.notStarted++; break;
        case "Completed": ws.completed++; break;
        case "On-track": ws.onTrack++; break;
        case "At-risk": ws.atRisk++; break;
        case "Overdue": ws.overdue++; break;
      }
    }
    const workstreamHealth = Array.from(wsMap.entries()).map(([ws, c]) => ({
      workstream: ws,
      health: computeHealth(c.total, c.completed, c.overdue, c.atRisk),
      groupStatus: rollupStatus(c),
      total: c.total, notStarted: c.notStarted, completed: c.completed, onTrack: c.onTrack, atRisk: c.atRisk, overdue: c.overdue,
      completionPct: c.total > 0 ? c.sumPct / c.total : 0,
    }));

    return { total, notStarted, completed, onTrack, atRisk, overdue, health, milestones, workstreamHealth };
  }, [allItems]);

  // Projected finish = the latest end date in the plan (recomputed live so it
  // reflects edits instantly). Compared against the fixed Day-1 target to show
  // slippage without moving the committed deadline.
  const projection = useMemo(() => {
    let latest: string | null = null;
    for (const i of allItems) {
      if (i.endDate && (!latest || i.endDate > latest)) latest = i.endDate;
    }
    if (!latest) return null;
    const target = summary.project.day1TargetDate;
    const slip = Math.round(
      (new Date(latest + "T00:00:00").getTime() - new Date(target + "T00:00:00").getTime()) / 86400000
    );
    return { latest, slip };
  }, [allItems, summary.project.day1TargetDate]);

  // Status distribution chart data (oldest first)
  const chartData = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    // Historical points from recorded snapshots (drop any stored "today" — we
    // always append a live one below so the latest point reflects current data).
    const rows = [...snapshots]
      .filter((s) => s.snapshotDate !== today)
      .sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime())
      .map((s) => ({
        date: formatDate(s.snapshotDate),
        total: s.totalItems,
        notStarted: s.notStarted,
        completed: s.completed,
        onTrack: s.onTrack,
        atRisk: s.atRisk,
        overdue: s.overdue,
      }));
    // Live "today" point — updates instantly as items are edited and saved.
    rows.push({
      date: formatDate(today),
      total: liveStats.total,
      notStarted: liveStats.notStarted,
      completed: liveStats.completed,
      onTrack: liveStats.onTrack,
      atRisk: liveStats.atRisk,
      overdue: liveStats.overdue,
    });
    return rows;
  }, [snapshots, liveStats]);

  const { total, notStarted, completed, onTrack, atRisk, overdue } = liveStats;
  const pieData = [
    { name: "Not Started", value: notStarted, color: "#94A3B8" },
    { name: "Completed", value: completed, color: "#3B82F6" },
    { name: "On-track", value: onTrack, color: "#22C55E" },
    { name: "At-risk", value: atRisk, color: "#F59E0B" },
    { name: "Overdue", value: overdue, color: "#EF4444" },
  ].filter((d) => d.value > 0);

  const healthColor = HEALTH_COLORS[liveStats.health];
  const healthLabel = HEALTH_LABELS[liveStats.health];
  // Countdown to the PROJECTED Day-1 (latest plan end) — computed live so it
  // moves the moment an edit changes the plan; server value as fallback.
  const daysToDay1 = useMemo(() => {
    if (!projection) return summary.daysToDay1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((new Date(projection.latest + "T00:00:00").getTime() - today.getTime()) / 86400000);
  }, [projection, summary.daysToDay1]);
  const countdownColor = daysToDay1 <= 30 ? "#EF4444" : daysToDay1 <= 60 ? "#F59E0B" : "#1E3A5F";
  const slipColor = projection && projection.slip > 0
    ? (projection.slip <= 14 ? "#F59E0B" : "#EF4444")
    : "#22C55E";

  return (
    <div className="p-5 space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{summary.project.title}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{summary.project.description}</p>
        </div>
        <div className="text-xs text-slate-400">
          {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>

      {/* Row 1: countdown+health + pie metrics + workstream health table */}
      <div className="grid grid-cols-12 gap-4">
        {/* Countdown + Health */}
        <div className="col-span-2 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center justify-center text-center flex-1">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Days to Day-1</div>
            <div className="text-4xl font-bold tabular-nums" style={{ color: countdownColor }}>
              {daysToDay1}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Projected · {new Date((projection ? projection.latest : summary.project.day1TargetDate) + "T00:00:00").toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 w-full">
              <div className="text-slate-400 uppercase tracking-wider" style={{ fontSize: 9 }}>Original target</div>
              <div className="text-sm font-semibold text-slate-700 tabular-nums mt-0.5">
                {new Date(summary.project.day1TargetDate + "T00:00:00").toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </div>
              {projection && (
                <div className="font-semibold mt-0.5" style={{ color: slipColor, fontSize: 11 }}>
                  {projection.slip > 0
                    ? `▲ slipped ${projection.slip}d`
                    : projection.slip < 0
                    ? `▼ ${-projection.slip}d ahead`
                    : "On target"}
                </div>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center justify-center text-center flex-1">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Overall Health</div>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-1"
              style={{ backgroundColor: healthColor + "20", border: `3px solid ${healthColor}` }}
            >
              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: healthColor }} />
            </div>
            <div className="text-xs font-semibold" style={{ color: healthColor }}>{healthLabel}</div>
          </div>
        </div>

        {/* Key Metrics — donut */}
        <div className="col-span-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3 h-full flex flex-col">
            <div className="flex items-baseline justify-between mb-1">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Key Metrics</div>
              <div className="text-xs text-slate-400">
                <span className="font-bold text-slate-700 tabular-nums">{total}</span> total
              </div>
            </div>
            <div className="w-full flex justify-center" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      `${value} (${Math.round(((value as number) / total) * 100)}%)`,
                      name,
                    ]}
                    contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between mt-2 gap-1">
              {[
                { label: "Not Started", value: notStarted, color: "#94A3B8" },
                { label: "Done", value: completed, color: "#3B82F6" },
                { label: "On-track", value: onTrack, color: "#22C55E" },
                { label: "At-risk", value: atRisk, color: "#F59E0B" },
                { label: "Overdue", value: overdue, color: "#EF4444" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex flex-col items-center flex-1">
                  <div className="text-xs font-bold tabular-nums" style={{ color }}>{value}</div>
                  <div className="text-slate-400 leading-tight text-center" style={{ fontSize: 9 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Workstream Health Table */}
        <div className="col-span-7">
          <WorkstreamHealthTable workstreams={liveStats.workstreamHealth} items={allItems} />
        </div>
      </div>

      {/* Row 2: Attention + Upcoming Milestones */}
      <div className="grid grid-cols-2 gap-4">
        <AttentionCard items={allItems} onItemClick={setSelectedItem} />
        <MilestonesCard milestones={liveStats.milestones} onItemClick={setSelectedItem} />
      </div>

      {/* Row 3: Status Distribution Over Time */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-medium text-slate-700 mb-4">Status Distribution Over Time</h2>
        {chartData.length < 2 ? (
          <p className="text-xs text-slate-400 py-8 text-center">
            Not enough history yet — trend points build up from Excel uploads. The latest point always reflects your current data.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value, name, props) => {
                  const tot = props?.payload?.total ?? 0;
                  const pct = tot > 0 ? Math.round(((value as number) / tot) * 100) : 0;
                  return [`${value} (${pct}%)`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* Stacked areas: bottom → top: Completed, On-track, At-risk, Overdue, Not Started */}
              <Area type="monotone" dataKey="completed" stackId="1" fill="#3B82F6" stroke="#3B82F6" name="Completed" />
              <Area type="monotone" dataKey="onTrack" stackId="1" fill="#22C55E" stroke="#22C55E" name="On-track" />
              <Area type="monotone" dataKey="atRisk" stackId="1" fill="#F59E0B" stroke="#F59E0B" name="At-risk" />
              <Area type="monotone" dataKey="overdue" stackId="1" fill="#EF4444" stroke="#EF4444" name="Overdue" />
              <Area type="monotone" dataKey="notStarted" stackId="1" fill="#94A3B8" stroke="#94A3B8" name="Not Started" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Action item modal */}
      {selectedItem && (
        <ActionItemModal
          item={selectedItem}
          allItems={allItems}
          onClose={() => setSelectedItem(null)}
          onSave={async (updated) => {
            const res = await fetch(`/api/actions/${updated.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updated),
            });
            if (!res.ok) {
              const err = await res.text();
              console.error("Save failed:", res.status, err);
              throw new Error(`Save failed (${res.status})`);
            }
            const saved = await res.json();
            setAllItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
            setSelectedItem(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

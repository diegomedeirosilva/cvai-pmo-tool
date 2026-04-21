"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ActionItem, DashboardSummary, Snapshot } from "@/types";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Legend,
} from "recharts";
import { HEALTH_COLORS, HEALTH_LABELS, formatDate } from "@/lib/utils";
import { computeStatus, computeHealth } from "@/lib/dashboard";
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

  // Fetch snapshots for the Status Distribution chart
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

    const wsMap = new Map<string, { total: number; notStarted: number; completed: number; onTrack: number; atRisk: number; overdue: number }>();
    for (const item of allItems) {
      if (!wsMap.has(item.workstream)) wsMap.set(item.workstream, { total: 0, notStarted: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0 });
      const ws = wsMap.get(item.workstream)!;
      ws.total++;
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
      total: c.total, notStarted: c.notStarted, completed: c.completed, onTrack: c.onTrack, atRisk: c.atRisk, overdue: c.overdue,
      completionPct: c.total > 0 ? c.completed / c.total : 0,
    }));

    return { total, notStarted, completed, onTrack, atRisk, overdue, health, milestones, workstreamHealth };
  }, [allItems]);

  // Status distribution chart data (oldest first)
  const { chartData, currentPct, delta14d } = useMemo(() => {
    const sorted = [...snapshots].sort(
      (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime()
    );
    const chartData = sorted.map((s) => ({
      date: formatDate(s.snapshotDate),
      rawDate: s.snapshotDate,
      completionPct: s.totalItems > 0 ? Math.round((s.completed / s.totalItems) * 100) : 0,
      notStarted: s.notStarted,
      completed: s.completed,
      onTrack: s.onTrack,
      atRisk: s.atRisk,
      overdue: s.overdue,
    }));

    const currentPct = chartData.length > 0 ? chartData[chartData.length - 1].completionPct : 0;
    // Find snapshot from ~14 days before the latest; fall back to earliest
    let delta14d: number | null = null;
    if (chartData.length >= 2) {
      const latestDate = new Date(chartData[chartData.length - 1].rawDate).getTime();
      const targetMs = latestDate - 14 * 86400 * 1000;
      let ref = chartData[0];
      for (const s of chartData) {
        if (new Date(s.rawDate).getTime() <= targetMs) ref = s;
      }
      delta14d = currentPct - ref.completionPct;
    }
    return { chartData, currentPct, delta14d };
  }, [snapshots]);

  const { total, notStarted, completed, onTrack, atRisk, overdue } = liveStats;
  const pieData = [
    { name: "Not Started", value: notStarted, color: "#94A3B8" },
    { name: "Completed", value: completed, color: "#22C55E" },
    { name: "On-track", value: onTrack, color: "#3B82F6" },
    { name: "At-risk", value: atRisk, color: "#F59E0B" },
    { name: "Overdue", value: overdue, color: "#EF4444" },
  ].filter((d) => d.value > 0);

  const healthColor = HEALTH_COLORS[liveStats.health];
  const healthLabel = HEALTH_LABELS[liveStats.health];
  const daysToDay1 = summary.daysToDay1;
  const countdownColor = daysToDay1 <= 30 ? "#EF4444" : daysToDay1 <= 60 ? "#F59E0B" : "#1E3A5F";

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
              {new Date(summary.project.day1TargetDate).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
              })}
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
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Key Metrics</div>
            <div className="flex justify-center" style={{ height: 180 }}>
              <ResponsiveContainer width="80%" height={180}>
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
                { label: "Done", value: completed, color: "#22C55E" },
                { label: "On-track", value: onTrack, color: "#3B82F6" },
                { label: "At-risk", value: atRisk, color: "#F59E0B" },
                { label: "Overdue", value: overdue, color: "#EF4444" },
                { label: "Total", value: total, color: "#475569" },
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
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-700">Status Distribution Over Time</h2>
          {chartData.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-slate-800">
                {currentPct}%
              </span>
              <span className="text-xs text-slate-400">complete</span>
              {delta14d !== null && (
                <span
                  className="ml-2 text-xs font-medium px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: delta14d > 0 ? "#22C55E20" : delta14d < 0 ? "#EF444420" : "#94A3B820",
                    color: delta14d > 0 ? "#15803D" : delta14d < 0 ? "#B91C1C" : "#64748B",
                  }}
                  title="Change vs ~14 days ago"
                >
                  {delta14d > 0 ? "▲" : delta14d < 0 ? "▼" : "–"} {delta14d > 0 ? "+" : ""}{delta14d}pp in 14 days
                </span>
              )}
            </div>
          )}
        </div>
        {chartData.length < 2 ? (
          <p className="text-xs text-slate-400 py-8 text-center">
            Trend needs at least 2 snapshots. Visit the Trends page to take a snapshot.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="notStarted" stackId="1" fill="#94A3B8" stroke="#94A3B8" name="Not Started" />
              <Area type="monotone" dataKey="completed" stackId="1" fill="#22C55E" stroke="#22C55E" name="Completed" />
              <Area type="monotone" dataKey="onTrack" stackId="1" fill="#3B82F6" stroke="#3B82F6" name="On-track" />
              <Area type="monotone" dataKey="atRisk" stackId="1" fill="#F59E0B" stroke="#F59E0B" name="At-risk" />
              <Area type="monotone" dataKey="overdue" stackId="1" fill="#EF4444" stroke="#EF4444" name="Overdue" />
            </AreaChart>
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

"use client";
import { useState } from "react";
import { Snapshot } from "@/types";
import { HEALTH_COLORS, formatDate } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

interface Props {
  snapshots: Snapshot[];
}

export default function TrendsClient({ snapshots: initial }: Props) {
  const [snapshots, setSnapshots] = useState(initial);
  const [snapshotting, setSnapshotting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  async function takeSnapshotNow() {
    setSnapshotting(true);
    try {
      await fetch("/api/snapshots", { method: "POST" });
      const res = await fetch("/api/snapshots");
      const data = await res.json();
      setSnapshots(data);
    } catch { /* ignore */ }
    setSnapshotting(false);
  }

  async function backfill() {
    setBackfilling(true);
    try {
      await fetch("/api/snapshots/backfill", { method: "POST" });
      const res = await fetch("/api/snapshots");
      const data = await res.json();
      setSnapshots(data);
    } catch { /* ignore */ }
    setBackfilling(false);
  }

  // Prepare chart data (oldest first)
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime()
  );

  const chartData = sorted.map((s) => ({
    date: formatDate(s.snapshotDate),
    rawDate: s.snapshotDate,
    completionPct: s.totalItems > 0 ? Math.round((s.completed / s.totalItems) * 100) : 0,
    completed: s.completed,
    onTrack: s.onTrack,
    notStarted: s.notStarted,
    delayed: s.delayed,
    overdue: s.overdue,
    total: s.totalItems,
    health: s.overallHealth,
  }));

  // Unique workstreams across all snapshots
  const allWorkstreams = new Set<string>();
  for (const s of sorted) {
    for (const ws of s.workstreamData) {
      allWorkstreams.add(ws.workstream);
    }
  }
  const workstreamList = Array.from(allWorkstreams);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Trends</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <div className="flex gap-2">
          {snapshots.length < 3 && (
            <button
              onClick={backfill}
              disabled={backfilling || snapshotting}
              className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {backfilling ? "Backfilling…" : "Backfill from Uploads"}
            </button>
          )}
          <button
            onClick={takeSnapshotNow}
            disabled={snapshotting || backfilling}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {snapshotting ? "Taking…" : "Take Snapshot Now"}
          </button>
        </div>
      </div>

      {snapshots.length < 2 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 text-sm">
            Trend charts need at least 2 snapshots. Snapshots are taken automatically on each Excel upload and daily via cron.
          </p>
          <p className="text-slate-400 text-xs mt-2">
            Click &quot;Take Snapshot Now&quot; to capture the current state, or &quot;Backfill from Uploads&quot; to generate historical data from past uploads.
          </p>
        </div>
      ) : (
        <>
          {/* Completion % line chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-medium text-slate-700 mb-4">Overall Completion %</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94A3B8" unit="%" />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Completion"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="completionPct"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#3B82F6" }}
                  name="Completion %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Status distribution stacked area */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-medium text-slate-700 mb-4">Status Distribution Over Time</h2>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="completed" stackId="1" fill="#22C55E" stroke="#22C55E" name="Completed" />
                <Area type="monotone" dataKey="onTrack" stackId="1" fill="#3B82F6" stroke="#3B82F6" name="On-track" />
                <Area type="monotone" dataKey="notStarted" stackId="1" fill="#94A3B8" stroke="#94A3B8" name="Not Started" />
                <Area type="monotone" dataKey="delayed" stackId="1" fill="#EF4444" stroke="#EF4444" name="Delayed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Workstream health grid */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-medium text-slate-700 mb-4">Workstream Health Over Time</h2>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium sticky left-0 bg-white">Workstream</th>
                    {sorted.map((s) => (
                      <th key={s.id} className="px-3 py-2 text-slate-500 font-medium text-center whitespace-nowrap">
                        {formatDate(s.snapshotDate)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workstreamList.map((ws) => (
                    <tr key={ws} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700 font-medium sticky left-0 bg-white whitespace-nowrap">{ws}</td>
                      {sorted.map((s) => {
                        const wsData = s.workstreamData.find((w) => w.workstream === ws);
                        const health = wsData?.health || "Green";
                        const color = HEALTH_COLORS[health];
                        return (
                          <td key={s.id} className="px-3 py-2 text-center">
                            <span
                              className="inline-block w-3 h-3 rounded-full"
                              style={{ backgroundColor: color }}
                              title={`${ws}: ${health}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { DashboardSummary, Risk } from "@/types";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { HEALTH_COLORS } from "@/lib/utils";
import WorkstreamHealthTable from "./WorkstreamHealthTable";
import MilestonesCard from "./MilestonesCard";
import AISummaryCard from "./AISummaryCard";

interface Props {
  summary: Omit<DashboardSummary, "aiSummary">;
  risks: Risk[];
}

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export default function DashboardClient({ summary, risks }: Props) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);

  function loadAISummary() {
    setAiLoading(true);
    setAiError(false);
    fetch("/api/ai/summary", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setAiSummary(data.summary || null);
        setAiLoading(false);
        if (!data.summary) setAiError(true);
      })
      .catch(() => {
        setAiLoading(false);
        setAiError(true);
      });
  }

  useEffect(() => { loadAISummary(); }, []);

  const topRisks = risks
    .filter((r) => r.riskStatus === "Open")
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99))
    .slice(0, 5);

  const { totalItems: total, completed, onTrack, notStarted, delayed, overdue } = summary;
  const pieData = [
    { name: "Completed", value: completed, color: "#22C55E" },
    { name: "On-track", value: onTrack, color: "#3B82F6" },
    { name: "Not Started", value: notStarted, color: "#94A3B8" },
    { name: "Delayed", value: delayed, color: "#EF4444" },
    { name: "Overdue", value: overdue, color: "#F59E0B" },
  ].filter((d) => d.value > 0);

  const health = summary.overallHealth;
  const healthColor = HEALTH_COLORS[health];
  const healthLabel = health === "Green" ? "On Track" : health === "Amber" ? "At Risk" : "Critical";
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

      {/* Top row: countdown + health + pie metrics + top risks */}
      <div className="grid grid-cols-12 gap-4">

        {/* Countdown — compact */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-4 h-full flex flex-col items-center justify-center text-center">
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
        </div>

        {/* Health — compact */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-4 h-full flex flex-col items-center justify-center text-center">
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

        {/* Key Metrics — compact: pie on top, single stat row below */}
        <div className="col-span-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3 h-full flex flex-col">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Key Metrics</div>
            {/* Pie chart */}
            <div className="flex justify-center flex-1 min-h-0" style={{ height: 90 }}>
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={24} outerRadius={40} paddingAngle={2} dataKey="value">
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
            {/* Single stat row */}
            <div className="flex items-center justify-between mt-2 gap-1">
              {[
                { label: "Done", value: completed, color: "#22C55E" },
                { label: "On-track", value: onTrack, color: "#3B82F6" },
                { label: "Pending", value: notStarted, color: "#94A3B8" },
                { label: "Delayed", value: delayed, color: "#EF4444" },
                { label: "Overdue", value: overdue, color: "#F59E0B" },
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

        {/* Top Risks — enlarged, clickable */}
        <div className="col-span-5">
          <div className="bg-white rounded-xl border border-slate-200 p-4 h-full">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Top Risks</div>
              <a href="/risks" className="text-xs text-blue-500 hover:underline">View all →</a>
            </div>
            {topRisks.length === 0 ? (
              <p className="text-xs text-slate-400 mt-2">No open risks detected.</p>
            ) : (
              <div className="space-y-1.5">
                {topRisks.map((risk, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedRisk(risk)}
                    className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-left transition-colors"
                  >
                    <span className={`flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                      risk.severity === "Critical" ? "bg-red-600 text-white" :
                      risk.severity === "High" ? "bg-red-100 text-red-700" :
                      risk.severity === "Medium" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {risk.severity.slice(0, 4)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-700 leading-snug line-clamp-2">
                        {risk.description}
                      </div>
                      {risk.workstream && (
                        <div className="text-xs text-slate-400 mt-0.5">{risk.workstream} · {risk.type}</div>
                      )}
                    </div>
                    <span className="text-slate-300 text-xs flex-shrink-0">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle row: workstream health + milestones */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8">
          <WorkstreamHealthTable workstreams={summary.workstreamHealth} />
        </div>
        <div className="col-span-4">
          <MilestonesCard milestones={summary.upcomingMilestones} />
        </div>
      </div>

      {/* Bottom: AI Summary */}
      <AISummaryCard summary={aiSummary} loading={aiLoading} error={aiError} onRetry={loadAISummary} />

      {/* Risk detail popup */}
      {selectedRisk && (
        <RiskModal risk={selectedRisk} onClose={() => setSelectedRisk(null)} />
      )}
    </div>
  );
}

function RiskModal({ risk, onClose }: { risk: Risk; onClose: () => void }) {
  const severityStyle =
    risk.severity === "Critical" ? "bg-red-600 text-white" :
    risk.severity === "High" ? "bg-red-100 text-red-700" :
    risk.severity === "Medium" ? "bg-amber-100 text-amber-700" :
    "bg-slate-100 text-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${severityStyle}`}>
              {risk.severity}
            </span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{risk.type}</span>
            {risk.workstream && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{risk.workstream}</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Description</div>
          <p className="text-sm text-slate-700 leading-relaxed">{risk.description}</p>
        </div>

        {risk.suggestedMitigation && (
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Suggested Mitigation</div>
            <p className="text-sm text-slate-600 leading-relaxed bg-green-50 border border-green-100 rounded-lg p-3">
              {risk.suggestedMitigation}
            </p>
          </div>
        )}

        {risk.owners && risk.owners.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Owner(s)</div>
            <div className="flex flex-wrap gap-1.5">
              {risk.owners.map((o, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{o}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            risk.riskStatus === "Open" ? "bg-red-50 text-red-600" :
            risk.riskStatus === "Mitigated" ? "bg-green-50 text-green-600" :
            "bg-slate-100 text-slate-500"
          }`}>
            {risk.riskStatus}
          </span>
          <a href="/risks" className="text-xs text-blue-500 hover:underline">Manage in Risk Register →</a>
        </div>
      </div>
    </div>
  );
}

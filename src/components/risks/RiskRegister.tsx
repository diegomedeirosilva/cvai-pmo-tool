"use client";
import { useState } from "react";
import { Risk, ActionItem, RiskSeverity, RiskStatus } from "@/types";
import { SEVERITY_COLORS } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

interface Props {
  initialRisks: Risk[];
  items: ActionItem[];
}

const SEVERITY_ORDER: RiskSeverity[] = ["Critical", "High", "Medium", "Low"];

export default function RiskRegister({ initialRisks, items }: Props) {
  const [risks, setRisks] = useState(initialRisks);
  const [filterSeverity, setFilterSeverity] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("Open");
  const [regenerating, setRegenerating] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const itemMap = new Map(items.map((i) => [i.id, i]));

  async function regenerate() {
    setRegenerating(true);
    const res = await fetch("/api/risks", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setRisks(data.risks || []);
    }
    setRegenerating(false);
  }

  async function runAIAnalysis() {
    setAiAnalyzing(true);
    setAiError(null);
    try {
      const res = await fetch("/api/risks/ai", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRisks(data.risks || []);
      } else {
        const data = await res.json();
        setAiError(data.error || "AI analysis failed");
      }
    } catch {
      setAiError("Network error during AI analysis");
    }
    setAiAnalyzing(false);
  }

  async function updateStatus(risk: Risk, status: RiskStatus) {
    const res = await fetch("/api/risks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: risk.id, riskStatus: status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRisks((prev) => prev.map((r) => (r.id === risk.id ? updated : r)));
    }
  }

  const filtered = risks
    .filter((r) => filterSeverity === "All" || r.severity === filterSeverity)
    .filter((r) => filterStatus === "All" || r.riskStatus === filterStatus)
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity as RiskSeverity) - SEVERITY_ORDER.indexOf(b.severity as RiskSeverity));

  const openCount = risks.filter((r) => r.riskStatus === "Open").length;
  const highCount = risks.filter((r) => ["Critical", "High"].includes(r.severity) && r.riskStatus === "Open").length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Risk Register</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {openCount} open risks · {highCount} critical/high
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={regenerate}
            disabled={regenerating || aiAnalyzing}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {regenerating ? "Refreshing…" : "Refresh Risks"}
          </button>
          <button
            onClick={runAIAnalysis}
            disabled={aiAnalyzing || regenerating}
            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {aiAnalyzing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
                </svg>
                AI Analysis
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Severity:</span>
          {["All", "Critical", "High", "Medium", "Low"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filterSeverity === s
                  ? "bg-blue-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status:</span>
          {["All", "Open", "Acknowledged", "Mitigated", "Closed"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filterStatus === s
                  ? "bg-blue-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* AI error toast */}
      {aiError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-sm text-red-700">
          <span>{aiError}</span>
          <button onClick={() => setAiError(null)} className="text-red-400 hover:text-red-600 ml-4">&times;</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg mb-2">No risks matching filters</p>
            <p className="text-sm">Click "Refresh Risks" to run detection</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-24">Severity</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-36">Type</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-28">Workstream</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((risk) => (
                <>
                  <tr
                    key={risk.id}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === risk.id ? null : risk.id)}
                  >
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[risk.severity] || ""}`}>
                        {risk.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5">
                        {risk.type === "AI-Inferred" ? "Strategic" : risk.type}
                        {risk.type === "AI-Inferred" && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
                            </svg>
                            AI
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-md">
                      <p className="line-clamp-2">{risk.description}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{risk.workstream || "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={risk.riskStatus}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateStatus(risk, e.target.value as RiskStatus)}
                        className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        {["Open", "Acknowledged", "Mitigated", "Closed"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  {expandedId === risk.id && (
                    <tr key={`${risk.id}-expanded`} className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="font-medium text-slate-600">Full description: </span>
                            <span className="text-slate-700">{risk.description}</span>
                          </div>
                          {risk.suggestedMitigation && (
                            <div>
                              <span className="font-medium text-slate-600">Suggested mitigation: </span>
                              <span className="text-slate-700">{risk.suggestedMitigation}</span>
                            </div>
                          )}
                          {(risk.affectedItemIds as string[]).length > 0 && (
                            <div>
                              <span className="font-medium text-slate-600">Affected items: </span>
                              <span className="text-slate-700">
                                {(risk.affectedItemIds as string[])
                                  .map((id) => itemMap.get(id)?.requirement || id.slice(0, 8))
                                  .join(", ")}
                              </span>
                            </div>
                          )}
                          {(risk.owners as string[]).length > 0 && (
                            <div>
                              <span className="font-medium text-slate-600">Owners: </span>
                              <span className="text-slate-700">{(risk.owners as string[]).join(", ")}</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

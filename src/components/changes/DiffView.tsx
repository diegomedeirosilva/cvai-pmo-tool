"use client";
import { useState } from "react";
import { ActionItem } from "@/types";
import { computeDiff, DiffResult, ChangeType } from "@/lib/diff-engine";
import { formatDate } from "@/lib/utils";

interface UploadInfo {
  id: string;
  uploadedAt: Date;
  fileName: string;
  itemCount: number;
}

interface Props {
  uploads: UploadInfo[];
}

const CHANGE_STYLES: Record<ChangeType, { bg: string; badge: string; label: string }> = {
  added: { bg: "bg-green-50", badge: "bg-green-100 text-green-700", label: "Added" },
  removed: { bg: "bg-red-50", badge: "bg-red-100 text-red-700", label: "Removed" },
  modified: { bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700", label: "Modified" },
  unchanged: { bg: "", badge: "bg-slate-100 text-slate-500", label: "Unchanged" },
};

export default function DiffView({ uploads }: Props) {
  const [beforeId, setBeforeId] = useState(uploads.length >= 2 ? uploads[1].id : "");
  const [afterId, setAfterId] = useState(uploads.length >= 1 ? "current" : "");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ChangeType | "all">("all");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  async function fetchSnapshot(id: string): Promise<ActionItem[]> {
    if (id === "current") {
      const res = await fetch("/api/actions");
      const data = await res.json();
      return Array.isArray(data) ? data : data.items || [];
    }
    const res = await fetch(`/api/uploads/${id}`);
    const data = await res.json();
    return (data.snapshot || []) as ActionItem[];
  }

  async function compare() {
    if (!beforeId || !afterId) return;
    setLoading(true);
    setDiff(null);
    setFilter("all");
    setExpandedIdx(null);
    try {
      const [oldItems, newItems] = await Promise.all([
        fetchSnapshot(beforeId),
        fetchSnapshot(afterId),
      ]);
      setDiff(computeDiff(oldItems, newItems));
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  function formatUploadLabel(u: UploadInfo) {
    return `${new Date(u.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} — ${u.fileName} (${u.itemCount} items)`;
  }

  if (uploads.length < 1) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-ink mb-1">Changes</h1>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center mt-4">
          <p className="text-slate-500 text-sm">Upload at least two versions of the workplan to see changes between them.</p>
        </div>
      </div>
    );
  }

  const filtered = diff
    ? diff.items.filter((d) => filter === "all" ? d.changeType !== "unchanged" : d.changeType === filter)
    : [];

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-semibold text-ink">Changes</h1>
        <p className="text-slate-500 text-sm mt-0.5">Compare action items between uploads</p>
      </div>

      {/* Selectors */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <div className="grid grid-cols-12 gap-4 items-end">
          <div className="col-span-5">
            <label className="block text-xs font-medium text-slate-600 mb-1">Before (older)</label>
            <select
              value={beforeId}
              onChange={(e) => setBeforeId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">Select upload…</option>
              {uploads.map((u) => (
                <option key={u.id} value={u.id}>{formatUploadLabel(u)}</option>
              ))}
            </select>
          </div>
          <div className="col-span-5">
            <label className="block text-xs font-medium text-slate-600 mb-1">After (newer)</label>
            <select
              value={afterId}
              onChange={(e) => setAfterId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="current">Current Data (live)</option>
              {uploads.map((u) => (
                <option key={u.id} value={u.id}>{formatUploadLabel(u)}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button
              onClick={compare}
              disabled={loading || !beforeId || !afterId}
              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? "Comparing…" : "Compare"}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {diff && (
        <>
          {/* Summary bar */}
          <div className="flex gap-3">
            {[
              { key: "added" as const, count: diff.summary.added, color: "text-green-700 bg-green-50 border-green-200" },
              { key: "removed" as const, count: diff.summary.removed, color: "text-red-700 bg-red-50 border-red-200" },
              { key: "modified" as const, count: diff.summary.modified, color: "text-amber-700 bg-amber-50 border-amber-200" },
              { key: "unchanged" as const, count: diff.summary.unchanged, color: "text-slate-600 bg-slate-50 border-slate-200" },
            ].map(({ key, count, color }) => (
              <button
                key={key}
                onClick={() => setFilter(filter === key ? "all" : key)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${color} ${filter === key ? "ring-2 ring-blue-400" : ""}`}
              >
                {count} {CHANGE_STYLES[key].label}
              </button>
            ))}
          </div>

          {/* Diff table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                {diff.summary.added + diff.summary.removed + diff.summary.modified === 0
                  ? "No changes detected between these two versions."
                  : "No items match the selected filter."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-24">Change</th>
                    <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-36">Workstream</th>
                    <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide">Requirement</th>
                    <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-28">Owner</th>
                    <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-medium uppercase tracking-wide w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d, i) => {
                    const style = CHANGE_STYLES[d.changeType];
                    const isExpanded = expandedIdx === i;
                    return (
                      <>
                        <tr
                          key={i}
                          className={`border-t border-slate-100 ${style.bg} ${d.changes.length > 0 ? "cursor-pointer" : ""} hover:opacity-90`}
                          onClick={() => d.changes.length > 0 && setExpandedIdx(isExpanded ? null : i)}
                        >
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.badge}`}>
                              {style.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{d.item.workstream}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-700 font-medium">
                            {d.item.requirement || d.item.action?.slice(0, 60)}
                            {d.changes.length > 0 && (
                              <span className="text-slate-400 ml-1.5">({d.changes.length} field{d.changes.length > 1 ? "s" : ""})</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{d.item.owner}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{d.item.status}</td>
                        </tr>
                        {isExpanded && d.changes.length > 0 && (
                          <tr key={`${i}-detail`} className="border-t border-slate-100 bg-white">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="space-y-1.5">
                                {d.changes.map((c, ci) => (
                                  <div key={ci} className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-500 font-medium w-28 flex-shrink-0">{c.field}:</span>
                                    <span className="text-red-600 line-through">{formatFieldValue(c.field, c.oldValue)}</span>
                                    <span className="text-slate-400">→</span>
                                    <span className="text-green-700 font-medium">{formatFieldValue(c.field, c.newValue)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatFieldValue(field: string, value: string | number): string {
  if (field === "Completion %" && typeof value === "number") {
    return `${Math.round(value * 100)}%`;
  }
  if ((field === "Start Date" || field === "End Date") && typeof value === "string") {
    return formatDate(value);
  }
  if (field === "Duration" && typeof value === "number") {
    return `${value} days`;
  }
  return String(value);
}

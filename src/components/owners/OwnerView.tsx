"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionItem, OwnerStats } from "@/types";
import { STATUS_COLORS, formatDate } from "@/lib/utils";
import { computeStatus } from "@/lib/dashboard";
import ActionItemModal from "@/components/shared/ActionItemModal";

interface Props {
  ownerStats: OwnerStats[];
}

type SortKey = "total" | "overdue" | "dueSoon7" | "dueSoon14";

export default function OwnerView({ ownerStats }: Props) {
  const router = useRouter();
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("total");
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);

  const sorted = [...ownerStats].sort((a, b) => b[sortBy] - a[sortBy]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Owner Workload</h1>
          <p className="text-slate-500 text-sm mt-0.5">{ownerStats.length} owners tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Sort by:</span>
          {([
            ["total", "Total Items"],
            ["overdue", "Overdue"],
            ["dueSoon7", "Due in 7d"],
            ["dueSoon14", "Due in 14d"],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sortBy === key ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((owner) => {
          const isExpanded = expandedOwner === owner.owner;
          const completionPct = owner.total > 0 ? (owner.completed / owner.total) * 100 : 0;

          return (
            <div key={owner.owner} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Owner header */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpandedOwner(isExpanded ? null : owner.owner)}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-700 font-semibold text-sm">
                    {owner.owner.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm">{owner.owner}</span>
                    {owner.overdue > 0 && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                        {owner.overdue} overdue
                      </span>
                    )}
                    {owner.atRisk > 0 && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                        {owner.atRisk} at-risk
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 max-w-xs">
                      <div
                        className="h-1.5 rounded-full bg-green-500 transition-all"
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{Math.round(completionPct)}% done</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-5 text-center flex-shrink-0">
                  <Stat label="Total" value={owner.total} color="text-slate-700" />
                  <Stat label="Not Started" value={owner.notStarted} color="text-slate-400" />
                  <Stat label="Done" value={owner.completed} color="text-green-600" />
                  <Stat label="On-track" value={owner.onTrack} color="text-blue-600" />
                  <Stat label="Due 7d" value={owner.dueSoon7} color="text-amber-600" />
                  <Stat label="Due 14d" value={owner.dueSoon14} color="text-slate-500" />
                </div>

                <span className="text-slate-300 ml-2">{isExpanded ? "▲" : "▼"}</span>
              </div>

              {/* Expanded item list */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-4 py-2 text-slate-500 font-medium">Requirement</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">Workstream</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">Status</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">End Date</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-medium">Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owner.items
                        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
                        .map((item) => {
                          const status = computeStatus(item);
                          return (
                            <tr
                              key={item.id}
                              className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                              onClick={() => setSelectedItem(item)}
                            >
                              <td className="px-4 py-2 text-slate-700 max-w-xs">
                                <p className="truncate">{item.requirement || item.action.slice(0, 60)}</p>
                                {item.notes && (
                                  <p className="text-slate-400 text-xs truncate mt-0.5">{item.notes.slice(0, 80)}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-500">{item.workstream}</td>
                              <td className="px-3 py-2">
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
                              <td className="px-3 py-2 text-slate-500">{formatDate(item.endDate)}</td>
                              <td className="px-4 py-2 text-right text-slate-500">
                                {Math.round(item.actualCompletionPct * 100)}%
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedItem && (
        <ActionItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSave={async (updated) => {
            const res = await fetch(`/api/actions/${updated.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updated),
            });
            if (!res.ok) throw new Error(`Save failed (${res.status})`);
            setSelectedItem(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

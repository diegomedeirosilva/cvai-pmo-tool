"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { WorkstreamHealth, ActionItem } from "@/types";
import { HEALTH_COLORS, HEALTH_LABELS } from "@/lib/utils";
import { computeStatus, computeHealth } from "@/lib/dashboard";

interface CategoryHealth {
  category: string;
  total: number;
  notStarted: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  health: "Green" | "Amber" | "Red";
}

interface Props {
  workstreams: WorkstreamHealth[];
  items: ActionItem[];
}

export default function WorkstreamHealthTable({ workstreams, items }: Props) {
  const [expandedWs, setExpandedWs] = useState<string | null>(null);

  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryHealth[]>();

    const wsCategories = new Map<string, Map<string, { total: number; notStarted: number; completed: number; onTrack: number; atRisk: number; overdue: number }>>();

    for (const item of items) {
      if (!wsCategories.has(item.workstream)) {
        wsCategories.set(item.workstream, new Map());
      }
      const cats = wsCategories.get(item.workstream)!;
      if (!cats.has(item.category)) {
        cats.set(item.category, { total: 0, notStarted: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0 });
      }
      const c = cats.get(item.category)!;
      c.total++;
      const status = computeStatus(item);
      switch (status) {
        case "Not Started": c.notStarted++; break;
        case "Completed": c.completed++; break;
        case "On-track": c.onTrack++; break;
        case "At-risk": c.atRisk++; break;
        case "Overdue": c.overdue++; break;
      }
    }

    for (const [ws, cats] of wsCategories) {
      const catHealthArr: CategoryHealth[] = [];
      for (const [cat, counts] of cats) {
        catHealthArr.push({
          category: cat,
          ...counts,
          health: computeHealth(counts.total, counts.completed, counts.overdue, counts.atRisk),
        });
      }
      map.set(ws, catHealthArr);
    }

    return map;
  }, [items]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-medium text-slate-700 text-sm">Workstream Health</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide">Workstream</th>
            <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide w-20">Health</th>
            <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide">Progress</th>
            <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide w-16">Done</th>
            <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide w-16">On-track</th>
            <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide w-16">At-risk</th>
            <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide w-16">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {workstreams.map((ws) => {
            const pct = ws.total > 0 ? (ws.completed / ws.total) * 100 : 0;
            const color = HEALTH_COLORS[ws.health];
            const isExpanded = expandedWs === ws.workstream;
            const categories = categoryMap.get(ws.workstream) || [];

            return (
              <>
                <tr
                  key={ws.workstream}
                  className="border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setExpandedWs(isExpanded ? null : ws.workstream)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <svg
                        className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <Link
                        href={`/workstreams/${encodeURIComponent(ws.workstream)}`}
                        className="text-blue-600 hover:underline font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ws.workstream}
                      </Link>
                      <span className="text-slate-400 text-xs">({ws.total} items)</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: color + "20", color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                      {HEALTH_LABELS[ws.health] || ws.health}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
                        <div
                          className="h-1.5 rounded-full transition-[width]"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{Math.round(pct)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-green-600 font-medium">{ws.completed}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-blue-600 font-medium">{ws.onTrack}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-amber-600 font-medium">{ws.atRisk || "—"}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-red-600 font-medium">{ws.overdue || "—"}</td>
                </tr>
                {isExpanded && categories.map((cat) => {
                  const catPct = cat.total > 0 ? (cat.completed / cat.total) * 100 : 0;
                  const catColor = HEALTH_COLORS[cat.health];
                  return (
                    <tr key={`${ws.workstream}-${cat.category}`} className="border-t border-slate-50 bg-slate-50/60">
                      <td className="pl-10 pr-4 py-2">
                        <span className="text-xs text-slate-600">{cat.category}</span>
                        <span className="text-slate-400 text-xs ml-1.5">({cat.total})</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: catColor + "20", color: catColor }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
                          {HEALTH_LABELS[cat.health] || cat.health}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
                            <div
                              className="h-1.5 rounded-full transition-[width]"
                              style={{ width: `${catPct}%`, backgroundColor: catColor }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 w-8 text-right">{Math.round(catPct)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-green-600">{cat.completed}</td>
                      <td className="px-3 py-2 text-center text-xs text-blue-600">{cat.onTrack}</td>
                      <td className="px-3 py-2 text-center text-xs text-amber-600">{cat.atRisk || "—"}</td>
                      <td className="px-3 py-2 text-center text-xs text-red-600">{cat.overdue || "—"}</td>
                    </tr>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

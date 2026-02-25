import Link from "next/link";
import { WorkstreamHealth } from "@/types";
import { HEALTH_COLORS } from "@/lib/utils";

interface Props {
  workstreams: WorkstreamHealth[];
}

export default function WorkstreamHealthTable({ workstreams }: Props) {
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
            <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide w-16">Delayed</th>
            <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide w-16">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {workstreams.map((ws) => {
            const pct = ws.total > 0 ? (ws.completed / ws.total) * 100 : 0;
            const color = HEALTH_COLORS[ws.health];
            return (
              <tr key={ws.workstream} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/workstreams/${encodeURIComponent(ws.workstream)}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {ws.workstream}
                  </Link>
                  <span className="text-slate-400 text-xs ml-1.5">({ws.total} items)</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: color + "20", color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {ws.health}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{Math.round(pct)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-green-600 font-medium">{ws.completed}</td>
                <td className="px-3 py-2.5 text-center text-xs text-blue-600 font-medium">{ws.onTrack}</td>
                <td className="px-3 py-2.5 text-center text-xs text-red-600 font-medium">{ws.delayed || "—"}</td>
                <td className="px-3 py-2.5 text-center text-xs text-amber-600 font-medium">{ws.overdue || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

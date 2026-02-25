import { ActionItem } from "@/types";
import { formatDate, STATUS_COLORS } from "@/lib/utils";

interface Props {
  milestones: ActionItem[];
}

export default function MilestonesCard({ milestones }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 h-full">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-medium text-slate-700 text-sm">Upcoming Milestones (14 days)</h3>
      </div>
      {milestones.length === 0 ? (
        <div className="px-4 py-6 text-center text-slate-400 text-sm">No items due in next 14 days</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {milestones.slice(0, 8).map((m) => {
            const end = new Date(m.endDate);
            const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const isOverdue = daysLeft < 0;

            return (
              <div key={m.id} className="px-4 py-2.5 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {m.requirement || m.action.slice(0, 50)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{m.owner} · {m.workstream}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-slate-500">{formatDate(m.endDate)}</p>
                    <p
                      className="text-xs font-medium mt-0.5"
                      style={{ color: isOverdue ? "#EF4444" : daysLeft <= 3 ? "#F59E0B" : "#64748B" }}
                    >
                      {isOverdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                    </p>
                  </div>
                </div>
                <div
                  className="inline-flex mt-1 px-1.5 py-0.5 rounded text-xs"
                  style={{
                    backgroundColor: STATUS_COLORS[m.status] + "20",
                    color: STATUS_COLORS[m.status],
                  }}
                >
                  {m.status}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

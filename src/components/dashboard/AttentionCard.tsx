"use client";
import { ActionItem } from "@/types";
import { formatDate, STATUS_COLORS } from "@/lib/utils";
import { computeStatus } from "@/lib/dashboard";

interface Props {
  items: ActionItem[];
  onItemClick?: (item: ActionItem) => void;
}

export default function AttentionCard({ items, onItemClick }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter to overdue and at-risk items, overdue first
  const attentionItems = items
    .filter((i) => {
      const status = computeStatus(i);
      return status === "Overdue" || status === "At-risk";
    })
    .sort((a, b) => {
      const sa = computeStatus(a);
      const sb = computeStatus(b);
      if (sa === "Overdue" && sb !== "Overdue") return -1;
      if (sa !== "Overdue" && sb === "Overdue") return 1;
      return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
    });

  return (
    <div className="bg-white rounded-xl border border-slate-200 h-full">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-medium text-slate-700 text-sm">
          Attention Required
          <span className="ml-1.5 text-slate-400 font-normal">({attentionItems.length})</span>
        </h3>
      </div>
      {attentionItems.length === 0 ? (
        <div className="px-4 py-6 text-center text-slate-400 text-sm">No overdue or at-risk items</div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight: 360 }}>
          {attentionItems.map((item) => {
            const status = computeStatus(item);
            const end = new Date(item.endDate);
            const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const isOverdue = status === "Overdue";

            return (
              <div
                key={item.id}
                className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => onItemClick?.(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {item.requirement || item.action.slice(0, 50)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.owner} · {item.workstream}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-slate-500">{formatDate(item.endDate)}</p>
                    <p
                      className="text-xs font-medium mt-0.5"
                      style={{ color: isOverdue ? "#EF4444" : "#F59E0B" }}
                    >
                      {isOverdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="inline-flex px-1.5 py-0.5 rounded text-xs"
                    style={{
                      backgroundColor: STATUS_COLORS[status] + "20",
                      color: STATUS_COLORS[status],
                    }}
                  >
                    {status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {Math.round(item.actualCompletionPct * 100)}% done
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

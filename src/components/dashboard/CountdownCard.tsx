import { formatDate } from "@/lib/utils";

interface Props {
  daysToDay1: number;
  day1Date: string;
}

export default function CountdownCard({ daysToDay1, day1Date }: Props) {
  const isUrgent = daysToDay1 <= 30;
  const isWarning = daysToDay1 <= 60;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 text-center h-full flex flex-col items-center justify-center">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Days to Day-1</div>
      <div
        className={`text-5xl font-bold tabular-nums mb-1 ${
          isUrgent ? "text-red-500" : isWarning ? "text-amber-500" : "text-[#1E3A5F]"
        }`}
      >
        {daysToDay1}
      </div>
      <div className="text-xs text-slate-400 mt-1">Day-1: {formatDate(day1Date)}</div>
    </div>
  );
}

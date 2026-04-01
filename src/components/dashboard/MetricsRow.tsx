interface Props {
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
}

interface MetricProps {
  label: string;
  value: number;
  pct?: number;
  color: string;
  bg: string;
}

function Metric({ label, value, pct, color, bg }: MetricProps) {
  return (
    <div className={`rounded-lg p-3 ${bg} text-center`}>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {pct !== undefined && (
        <div className={`text-xs font-medium ${color} opacity-70`}>
          {Math.round(pct)}%
        </div>
      )}
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function MetricsRow({ total, completed, onTrack, atRisk, overdue }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 h-full">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Key Metrics</div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Total Items" value={total} color="text-slate-700" bg="bg-slate-50" />
        <Metric label="Completed" value={completed} pct={total ? (completed / total) * 100 : 0} color="text-green-600" bg="bg-green-50" />
        <Metric label="On-track" value={onTrack} pct={total ? (onTrack / total) * 100 : 0} color="text-blue-600" bg="bg-blue-50" />
        <Metric label="At-risk" value={atRisk} pct={total ? (atRisk / total) * 100 : 0} color="text-amber-600" bg="bg-amber-50" />
        <Metric label="Overdue" value={overdue} pct={total ? (overdue / total) * 100 : 0} color="text-red-600" bg="bg-red-50" />
      </div>
    </div>
  );
}

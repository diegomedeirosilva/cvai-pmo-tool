import { HEALTH_COLORS } from "@/lib/utils";

interface Props {
  health: "Green" | "Amber" | "Red";
  label: string;
}

const labels = {
  Green: "On Track",
  Amber: "At Risk",
  Red: "Critical",
};

export default function HealthCard({ health, label }: Props) {
  const color = HEALTH_COLORS[health];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 text-center h-full flex flex-col items-center justify-center">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">{label}</div>
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-2"
        style={{ backgroundColor: color + "20", border: `3px solid ${color}` }}
      >
        <div className="w-7 h-7 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="text-sm font-semibold" style={{ color }}>{labels[health]}</div>
    </div>
  );
}

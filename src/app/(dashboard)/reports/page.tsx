"use client";
import { useState } from "react";

export default function ReportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(type: string, filename: string) {
    setDownloading(type);
    try {
      const res = await fetch(`/api/export/excel?type=${type}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed. Please ensure data is loaded.");
    }
    setDownloading(null);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-ink mb-1">Reports & Exports</h1>
      <p className="text-slate-500 text-sm mb-6">Download structured data for reporting and presentations.</p>

      <div className="space-y-4">
        {/* Executive HTML Report — featured */}
        <ExportCard
          icon="🖥️"
          title="Executive HTML Report"
          description="Interactive, board-ready status deck generated live from current data — navigate on screen with the rail/arrow keys, expand tasks, and Export to save a shareable HTML file."
          badge="HTML · interactive · printable"
          badgeColor="bg-teal-100 text-teal-700"
          onDownload={() => window.open("/api/reports/html", "_blank")}
          buttonLabel="Open report"
        />

        {/* Round-trip Excel */}
        <ExportCard
          icon="📊"
          title="Workplan Export (Round-Trip)"
          description="Exports the full workplan in the exact original format — same sheet structure, formulas for dependencies, data validation dropdowns. Can be re-imported to the app."
          badge="Excel .xlsx"
          badgeColor="bg-green-100 text-green-700"
          onDownload={() => download("roundtrip", "JV_Readiness_Plan_Export.xlsx")}
          loading={downloading === "roundtrip"}
        />
      </div>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  description,
  badge,
  badgeColor,
  onDownload,
  loading,
  disabled,
  buttonLabel,
}: {
  icon: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  onDownload?: () => void;
  loading?: boolean;
  disabled?: boolean;
  buttonLabel?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card p-5 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-ink text-sm">{title}</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}>{badge}</span>
            </div>
            <p className="text-slate-500 text-sm">{description}</p>
          </div>
        </div>
        {!disabled && onDownload && (
          <button
            onClick={onDownload}
            disabled={loading}
            className="flex-shrink-0 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? "Exporting…" : buttonLabel || "Download"}
          </button>
        )}
      </div>
    </div>
  );
}

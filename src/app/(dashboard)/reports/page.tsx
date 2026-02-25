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
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Reports & Exports</h1>
      <p className="text-slate-500 text-sm mb-6">Download structured data for reporting and presentations.</p>

      <div className="space-y-4">
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

        {/* Analytics Excel */}
        <ExportCard
          icon="📈"
          title="Analytics Export"
          description="Multi-sheet Excel with: Raw Data (all items), Summary by Workstream, Summary by Owner, Timeline (sorted by deadline). Ideal for updating your PowerPoint slides manually."
          badge="Excel .xlsx · 4 sheets"
          badgeColor="bg-blue-100 text-blue-700"
          onDownload={() => download("analytics", "PMO_Analytics_Export.xlsx")}
          loading={downloading === "analytics"}
        />

        {/* PDF report - coming soon */}
        <ExportCard
          icon="📄"
          title="PDF Executive Report"
          description="Full 12-page executive report with workstream health, Gantt overview, risk register, and owner accountability table."
          badge="Coming in Phase 2"
          badgeColor="bg-slate-100 text-slate-500"
          disabled
        />

        {/* PPTX - coming soon */}
        <ExportCard
          icon="🖼"
          title="PowerPoint Export"
          description="Consulting-style slide deck with one slide per page from the executive report. Editable native PowerPoint objects."
          badge="Coming in Phase 2"
          badgeColor="bg-slate-100 text-slate-500"
          disabled
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
}: {
  icon: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  onDownload?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
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
            {loading ? "Exporting…" : "Download"}
          </button>
        )}
      </div>
    </div>
  );
}

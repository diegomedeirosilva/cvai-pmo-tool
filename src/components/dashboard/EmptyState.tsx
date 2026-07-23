"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusLabel } from "@/lib/utils";

export default function EmptyState() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    totalItems: number;
    workstreams: string[];
    statusCounts: Record<string, number>;
    day1TargetDate: string;
    projectTitle: string;
  } | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("confirm", "false");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPreview(data.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setLoading(false);
  }

  async function handleConfirm() {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("confirm", "true");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-ink">Welcome to PMO Dashboard</h1>
          <p className="text-slate-500 mt-2">Upload your Excel workplan to get started.</p>
        </div>

        {!preview ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f?.name.endsWith(".xlsx")) setFile(f);
              }}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <div className="text-4xl mb-3">📊</div>
              <p className="text-slate-600 font-medium">
                {file ? file.name : "Drop your Excel workplan here"}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {file ? `${(file.size / 1024).toFixed(0)} KB` : "or click to browse — .xlsx files only"}
              </p>
              <input
                id="file-input"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm mt-3 bg-red-50 rounded p-2">{error}</p>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {loading ? "Parsing…" : "Parse Workplan"}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
            <h2 className="font-semibold text-ink mb-4">✓ Preview</h2>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Project</span>
                <span className="font-medium text-slate-800">{preview.projectTitle}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Action items found</span>
                <span className="font-medium text-slate-800">{preview.totalItems}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Workstreams</span>
                <span className="font-medium text-slate-800">{preview.workstreams.length}</span>
              </div>
              {Object.entries(preview.statusCounts).map(([status, count]) => (
                <div key={status} className="flex justify-between py-1.5 border-b border-slate-100">
                  <span>{statusLabel(status)}</span>
                  <span className="font-medium text-slate-800">{count}</span>
                </div>
              ))}
              <div className="flex justify-between py-1.5">
                <span>Day-1 Target</span>
                <span className="font-medium text-slate-800">{preview.day1TargetDate}</span>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setPreview(null); setFile(null); }}
                className="flex-1 border border-slate-200 text-slate-600 font-medium py-2.5 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg disabled:opacity-40"
              >
                {loading ? "Importing…" : "Confirm Import"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

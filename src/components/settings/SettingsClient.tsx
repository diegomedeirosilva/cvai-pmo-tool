"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  title: string;
  description: string;
  day1TargetDate: string;
}

interface Upload {
  id: string;
  uploadedAt: Date;
  fileName: string;
  itemCount: number;
}

interface Props {
  project: Project | null;
  uploadHistory: Upload[];
}

export default function SettingsClient({ project, uploadHistory }: Props) {
  const [title, setTitle] = useState(project?.title || "");
  const [description, setDescription] = useState(project?.description || "");
  const [day1, setDay1] = useState(project?.day1TargetDate || "2026-08-14");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Upload new file
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{
    totalItems: number;
    projectTitle: string;
    workstreams: string[];
    dependenciesCount: number;
    categorySummariesCount: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcStatus, setRecalcStatus] = useState("");
  const router = useRouter();

  async function deleteUpload(id: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"?\n\nThis removes the upload record and its snapshot from the Trends chart. The current action items in the dashboard are NOT affected.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Delete failed");
      } else {
        router.refresh();
      }
    } catch (e) {
      alert("Delete failed: " + (e instanceof Error ? e.message : String(e)));
    }
    setDeletingId(null);
  }

  async function recalculateSnapshots() {
    setRecalculating(true);
    setRecalcStatus("");
    try {
      const res = await fetch("/api/snapshots/backfill", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRecalcStatus(`Done — ${data.backfilled} snapshot(s) recalculated`);
      } else {
        setRecalcStatus("Failed: " + (data.error || "unknown error"));
      }
    } catch (e) {
      setRecalcStatus("Failed: " + (e instanceof Error ? e.message : String(e)));
    }
    setRecalculating(false);
    setTimeout(() => setRecalcStatus(""), 4000);
  }

  async function saveProject() {
    setSaving(true);
    await fetch("/api/project", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, day1TargetDate: day1 }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function handlePreview() {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("confirm", "false");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) { setUploadError(data.error || "Error"); setUploading(false); return; }
    setPreview(data.preview);
    setUploading(false);
  }

  async function handleConfirm() {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("confirm", "true");
    await fetch("/api/upload", { method: "POST", body: fd });
    setFile(null);
    setPreview(null);
    setUploading(false);
    router.refresh();
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Settings</h1>

      {/* Project Metadata */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">Project Metadata</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Project Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input h-20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Day-1 Target Date</label>
            <input type="date" value={day1} onChange={(e) => setDay1(e.target.value)} className="input max-w-xs" />
          </div>
          <button
            onClick={saveProject}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </section>

      {/* Upload new workplan */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-1">Upload New Workplan</h2>
        <p className="text-slate-400 text-xs mb-4">Uploading a new file will replace the current data (previous data is archived).</p>

        {!preview ? (
          <div>
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => document.getElementById("settings-file-input")?.click()}
            >
              <p className="text-slate-500 text-sm">{file ? file.name : "Click to select .xlsx file"}</p>
              <input
                id="settings-file-input"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }}
              />
            </div>
            {uploadError && <p className="text-red-500 text-sm mt-2">{uploadError}</p>}
            <button
              onClick={handlePreview}
              disabled={!file || uploading}
              className="mt-3 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-40"
            >
              {uploading ? "Parsing…" : "Preview Import"}
            </button>
          </div>
        ) : (
          <div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 mb-3 space-y-1">
              <p>Found <strong>{preview.totalItems} action items</strong> across <strong>{preview.workstreams.length} workstreams</strong> in "{preview.projectTitle}"</p>
              <p className="text-xs text-green-600">
                {preview.dependenciesCount > 0
                  ? `✓ ${preview.dependenciesCount} interdependencies detected`
                  : "⚠ No interdependencies detected — check if the Excel has start-date formulas (=I5 pattern)"}
                {" · "}{preview.categorySummariesCount} categories
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setPreview(null); setFile(null); }} className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancel</button>
              <button onClick={handleConfirm} disabled={uploading} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {uploading ? "Importing…" : "Confirm Import"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Upload History */}
      {uploadHistory.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-3">Upload History</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left pb-2 text-xs text-slate-500 font-medium">Date</th>
                <th className="text-left pb-2 text-xs text-slate-500 font-medium">File</th>
                <th className="text-right pb-2 text-xs text-slate-500 font-medium">Items</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {uploadHistory.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 group">
                  <td className="py-2 text-slate-600">
                    {new Date(u.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="py-2 text-slate-500 text-xs">{u.fileName}</td>
                  <td className="py-2 text-right text-slate-600">{u.itemCount}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => deleteUpload(u.id, u.fileName)}
                      disabled={deletingId === u.id}
                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 text-sm"
                      title="Delete this upload and its snapshot"
                    >
                      {deletingId === u.id ? "…" : "×"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 mt-3">
            Deleting an upload removes its entry from the Trends chart. Current dashboard data is not affected.
          </p>
        </section>
      )}

      {/* Recalculate Snapshots */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-1">Recalculate Trend Snapshots</h2>
        <p className="text-slate-400 text-xs mb-4">
          Recomputes all historical snapshots using the current status rules. Use this after changing how statuses are classified.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={recalculateSnapshots}
            disabled={recalculating}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-40"
          >
            {recalculating ? "Recalculating…" : "Recalculate Snapshots"}
          </button>
          {recalcStatus && (
            <span className={`text-sm ${recalcStatus.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
              {recalcStatus}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

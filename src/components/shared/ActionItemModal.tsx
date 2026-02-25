"use client";
import { useState } from "react";
import { ActionItem, Status } from "@/types";
import { STATUS_COLORS } from "@/lib/utils";

interface Props {
  item: ActionItem | null;
  onSave: (item: ActionItem) => Promise<void>;
  onClose: () => void;
  onDelete?: (id: string) => Promise<void>;
  predecessors?: ActionItem[];
  successors?: ActionItem[];
}

const STATUSES: Status[] = ["Not Started", "On-track", "Delayed", "Completed"];

export default function ActionItemModal({ item, onSave, onClose, onDelete, predecessors, successors }: Props) {
  const [form, setForm] = useState<ActionItem>(
    item || {
      id: "",
      workstream: "",
      category: "",
      requirement: "",
      action: "",
      owner: "",
      status: "Not Started",
      startDate: new Date().toISOString().split("T")[0],
      duration: 14,
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      targetCompletionPct: 0,
      actualCompletionPct: 0,
      notes: "",
      sortOrder: 0,
      createdAt: "",
      updatedAt: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function update<K extends keyof ActionItem>(key: K, value: ActionItem[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "startDate" || key === "duration") {
        const start = new Date(key === "startDate" ? (value as string) : prev.startDate);
        const dur = key === "duration" ? (value as number) : prev.duration;
        const end = new Date(start.getTime() + dur * 86400000);
        next.endDate = end.toISOString().split("T")[0];
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  async function handleDelete() {
    if (!onDelete || !form.id) return;
    if (!confirm("Delete this action item?")) return;
    setDeleting(true);
    await onDelete(form.id);
    setDeleting(false);
  }

  const targetPct = Math.round(form.targetCompletionPct * 100);
  const actualPct = Math.round(form.actualCompletionPct * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">
            {item?.id ? "Edit Action Item" : "Add Action Item"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workstream">
              <input
                value={form.workstream}
                onChange={(e) => update("workstream", e.target.value)}
                className="input"
                placeholder="e.g., SHA"
              />
            </Field>
            <Field label="Category">
              <input
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="input"
                placeholder="e.g., Budget and BP"
              />
            </Field>
          </div>

          <Field label="Requirement (short label)">
            <input
              value={form.requirement}
              onChange={(e) => update("requirement", e.target.value)}
              className="input"
              placeholder="e.g., Align Roles & Responsibilities"
            />
          </Field>

          <Field label="Action (detailed description)">
            <textarea
              value={form.action}
              onChange={(e) => update("action", e.target.value)}
              className="input h-20 resize-none"
              placeholder="Detailed action description…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner">
              <input
                value={form.owner}
                onChange={(e) => update("owner", e.target.value)}
                className="input"
                placeholder="e.g., Hassen Moolla"
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value as Status)}
                className="input"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Start Date">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Duration (days)">
              <input
                type="number"
                value={form.duration}
                onChange={(e) => update("duration", parseInt(e.target.value) || 0)}
                className="input"
                min={0}
              />
            </Field>
            <Field label="End Date">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => update("endDate", e.target.value)}
                className="input"
              />
            </Field>
          </div>

          {/* Completion section */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Actual Completion (PMO)</span>
              <span className="text-sm font-bold text-blue-600">{actualPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={actualPct}
              onChange={(e) => update("actualCompletionPct", parseInt(e.target.value) / 100)}
              className="w-full accent-blue-500"
            />
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <span>Time-based target (auto)</span>
              <span>{targetPct}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1">
              <div className="bg-slate-400 h-1 rounded-full" style={{ width: `${targetPct}%` }} />
            </div>
          </div>

          {/* Dependencies section */}
          {((predecessors && predecessors.length > 0) || (successors && successors.length > 0)) && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-2">
              <div className="text-xs font-medium text-slate-600">Dependencies</div>
              {predecessors && predecessors.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">Depends on (must complete first):</div>
                  {predecessors.map((p) => (
                    <div key={p.id} className="text-xs flex items-center gap-2 py-0.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-slate-700 font-medium truncate">{p.requirement || p.action.slice(0, 50)}</span>
                      <span className="text-slate-400 ml-auto flex-shrink-0">{p.owner.split("/")[0]}</span>
                    </div>
                  ))}
                </div>
              )}
              {successors && successors.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">Required by (waiting on this):</div>
                  {successors.map((s) => (
                    <div key={s.id} className="text-xs flex items-center gap-2 py-0.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                      <span className="text-slate-700 font-medium truncate">{s.requirement || s.action.slice(0, 50)}</span>
                      <span className="text-slate-400 ml-auto flex-shrink-0">{s.owner.split("/")[0]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className="input h-24 resize-none"
              placeholder="Additional notes…"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
          <div>
            {onDelete && form.id && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

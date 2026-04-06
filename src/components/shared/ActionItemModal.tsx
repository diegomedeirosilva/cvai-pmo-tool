"use client";
import { useState } from "react";
import { ActionItem } from "@/types";
import { STATUS_BG } from "@/lib/utils";
import { computeStatus } from "@/lib/dashboard";

interface Props {
  item: ActionItem | null;
  onSave: (item: ActionItem, predecessorId: string | null) => Promise<void>;
  onClose: () => void;
  onDelete?: (id: string) => Promise<void>;
  predecessors?: ActionItem[];
  successors?: ActionItem[];
  allItems?: ActionItem[];
}

export default function ActionItemModal({ item, onSave, onClose, onDelete, predecessors, successors, allItems }: Props) {
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
  const [saveError, setSaveError] = useState("");

  // Predecessor selection state
  const [selectedPredId, setSelectedPredId] = useState<string | null>(
    predecessors && predecessors.length > 0 ? predecessors[0].id : null
  );
  const [predSearch, setPredSearch] = useState("");

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

  // When a predecessor is selected, snap start date to predecessor's end date
  function selectPredecessor(predId: string | null) {
    setSelectedPredId(predId);
    if (predId) {
      const pred = (allItems || []).find((i) => i.id === predId);
      if (pred) {
        const newStart = pred.endDate;
        const dur = form.duration;
        const end = new Date(new Date(newStart).getTime() + dur * 86400000);
        setForm((prev) => ({
          ...prev,
          startDate: newStart,
          endDate: end.toISOString().split("T")[0],
        }));
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(form, selectedPredId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setSaveError(msg);
    }
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

  // Filter items for predecessor dropdown
  const predOptions = (allItems || [])
    .filter((i) => i.id !== form.id) // exclude self
    .filter((i) => {
      if (!predSearch) return true;
      const q = predSearch.toLowerCase();
      return (
        (i.requirement?.toLowerCase().includes(q)) ||
        (i.action?.toLowerCase().includes(q)) ||
        (i.owner?.toLowerCase().includes(q)) ||
        (i.workstream?.toLowerCase().includes(q))
      );
    })
    .slice(0, 20);

  const selectedPred = selectedPredId
    ? (allItems || []).find((i) => i.id === selectedPredId)
    : null;

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
            <Field label="Status (auto-computed)">
              <div className="flex items-center h-[38px]">
                <span className={`px-2.5 py-1 rounded text-xs font-medium ${STATUS_BG[computeStatus(form)] || "bg-slate-100 text-slate-600"}`}>
                  {computeStatus(form)}
                </span>
              </div>
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

          {/* Dependencies section — editable */}
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-slate-600">Dependencies</div>

            {/* Editable predecessor */}
            <div>
              <div className="text-xs text-slate-400 mb-1">Depends on (must complete first):</div>

              {/* Selected predecessor chip */}
              {selectedPred && (
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-xs text-slate-700 font-medium truncate flex-1">
                    {selectedPred.requirement || selectedPred.action.slice(0, 50)}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{selectedPred.owner.split("/")[0]}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedPredId(null)}
                    className="text-slate-400 hover:text-red-500 text-sm ml-1 flex-shrink-0"
                    title="Remove dependency"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Search input — always visible so user can change predecessor */}
              <input
                type="text"
                placeholder={selectedPred ? "Change predecessor..." : "Search to add predecessor..."}
                value={predSearch}
                onChange={(e) => setPredSearch(e.target.value)}
                className="input text-xs w-full"
              />

              {/* Inline results list (no absolute positioning — avoids modal overflow clipping) */}
              {predSearch && predOptions.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-lg bg-white max-h-36 overflow-y-auto">
                  {predOptions.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 border-b border-slate-50 last:border-b-0"
                      onClick={() => {
                        selectPredecessor(i.id);
                        setPredSearch("");
                      }}
                    >
                      <div className="font-medium text-slate-700 truncate">
                        {i.requirement || i.action.slice(0, 60)}
                      </div>
                      <div className="text-slate-400">
                        {i.workstream} · {i.owner}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {predSearch && predOptions.length === 0 && (
                <div className="mt-1 px-3 py-2 text-xs text-slate-400">No matching items</div>
              )}
            </div>

            {/* Successors (read-only) */}
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
        <div className="px-5 py-4 border-t border-slate-200 space-y-2">
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {saveError}
            </div>
          )}
          <div className="flex items-center justify-between">
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

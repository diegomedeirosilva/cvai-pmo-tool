"use client";
import { useState } from "react";
import { ActionItem } from "@/types";
import { formatDate } from "@/lib/utils";

interface Props {
  item: ActionItem;
  successorCount: number;
  onConfirm: (newEndDate: string) => Promise<void>;
  onClose: () => void;
}

export default function PropagateDelayModal({ item, successorCount, onConfirm, onClose }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [newEndDate, setNewEndDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const overdueBy = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(item.endDate).getTime()) / 86400000
  );

  async function handleConfirm() {
    if (!newEndDate) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm(newEndDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reschedule failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-800 mb-4">Reschedule Downstream Items</h2>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm">
          <p className="font-medium text-amber-900">{item.requirement || item.action}</p>
          <p className="text-amber-700 text-xs mt-1">{item.workstream}</p>
          <p className="text-amber-700 text-xs mt-1">
            Overdue by <strong>{overdueBy} day{overdueBy !== 1 ? "s" : ""}</strong>
            {item.baselineEndDate && item.baselineEndDate !== item.endDate
              ? ` · Original plan ended ${formatDate(item.baselineEndDate)}`
              : ` · Was due ${formatDate(item.endDate)}`}
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            New projected completion date
          </label>
          <input
            type="date"
            min={today}
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="input w-full"
          />
        </div>

        <div className="bg-slate-50 rounded-lg px-3 py-2 mb-5 text-xs text-slate-600 flex items-start gap-2">
          <span className="text-slate-400 mt-0.5">ℹ</span>
          <span>
            This will automatically reschedule <strong>{successorCount} downstream item{successorCount !== 1 ? "s" : ""}</strong> using the existing dependency chain.
          </span>
        </div>

        {error && <p className="text-red-600 text-xs mb-3">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!newEndDate || saving}
            className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {saving && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? "Rescheduling…" : "Reschedule →"}
          </button>
        </div>
      </div>
    </div>
  );
}

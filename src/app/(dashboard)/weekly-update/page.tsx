"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WeeklyUpdate, WeeklyUpdateSection } from "@/types";
import { HEALTH_COLORS, HEALTH_LABELS } from "@/lib/utils";

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatWeekLabel(d: Date): string {
  return "Week of " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function WeeklyUpdatePage() {
  const [updates, setUpdates] = useState<WeeklyUpdate[]>([]);
  const [currentUpdate, setCurrentUpdate] = useState<WeeklyUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  function toggleCollapse(sectionId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function collapseAll() {
    if (!currentUpdate) return;
    setCollapsedSections(new Set(currentUpdate.sections.map((s) => s.id)));
  }

  function expandAll() {
    setCollapsedSections(new Set());
  }

  // Load all updates on mount
  useEffect(() => {
    fetch("/api/weekly-updates")
      .then((r) => r.json())
      .then((data) => {
        setUpdates(data);
        // Auto-select current week if it exists
        const monday = getMonday(new Date()).toISOString().split("T")[0];
        const thisWeek = data.find((u: WeeklyUpdate) => u.weekStartDate === monday);
        if (thisWeek) setCurrentUpdate(thisWeek);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function createUpdate() {
    const monday = getMonday(new Date());
    const weekStartDate = monday.toISOString().split("T")[0];
    const weekLabel = formatWeekLabel(monday);

    const res = await fetch("/api/weekly-updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate, weekLabel }),
    });
    if (res.ok) {
      const update = await res.json();
      setCurrentUpdate(update);
      setUpdates((prev) => [update, ...prev]);
    }
  }

  async function selectUpdate(id: string) {
    const res = await fetch(`/api/weekly-updates/${id}`);
    if (res.ok) {
      setCurrentUpdate(await res.json());
    }
  }

  async function generateWithAI() {
    if (!currentUpdate) return;
    setGenerating(true);
    setSaveStatus("");
    try {
      const res = await fetch(`/api/weekly-updates/${currentUpdate.id}/generate`, {
        method: "POST",
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        alert("AI response was not JSON: " + text.slice(0, 200));
        setGenerating(false);
        return;
      }
      if (res.ok && data.sections) {
        setCurrentUpdate((prev) =>
          prev ? { ...prev, sections: data.sections } : prev
        );
        setSaveStatus("AI content generated");
        setTimeout(() => setSaveStatus(""), 3000);
      } else {
        alert("AI generation failed: " + (data.error || JSON.stringify(data).slice(0, 200)));
        setSaveStatus(data.error || "AI generation failed");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("AI generation error: " + msg);
      setSaveStatus("AI generation failed");
    }
    setGenerating(false);
  }

  async function saveSections() {
    if (!currentUpdate) return;
    setSaving(true);
    setSaveStatus("");
    try {
      const res = await fetch(`/api/weekly-updates/${currentUpdate.id}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: currentUpdate.sections.map((s) => ({
            id: s.id,
            progressUpdate: s.progressUpdate,
            nextSteps: s.nextSteps,
            needsFromClient: s.needsFromClient,
          })),
        }),
      });
      if (res.ok) {
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000);
      }
    } catch {
      setSaveStatus("Save failed");
    }
    setSaving(false);
  }

  async function finalizeUpdate() {
    if (!currentUpdate) return;
    await saveSections();
    const res = await fetch(`/api/weekly-updates/${currentUpdate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "finalized" }),
    });
    if (res.ok) {
      setCurrentUpdate((prev) => (prev ? { ...prev, status: "finalized" } : prev));
    }
  }

  async function unfinalizeUpdate() {
    if (!currentUpdate) return;
    const res = await fetch(`/api/weekly-updates/${currentUpdate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    });
    if (res.ok) {
      setCurrentUpdate((prev) => (prev ? { ...prev, status: "draft" } : prev));
    }
  }

  function updateSection(sectionId: string, field: keyof WeeklyUpdateSection, value: string) {
    setCurrentUpdate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, [field]: value } : s
        ),
      };
    });
  }

  const isFinalized = currentUpdate?.status === "finalized";
  const monday = getMonday(new Date()).toISOString().split("T")[0];
  const hasCurrentWeek = updates.some((u) => u.weekStartDate === monday);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Weekly Status Update</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Consolidate progress, next steps, and client requests
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Week selector */}
          {updates.length > 0 && (
            <select
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
              value={currentUpdate?.id || ""}
              onChange={(e) => e.target.value && selectUpdate(e.target.value)}
            >
              <option value="">Select a week…</option>
              {updates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.weekLabel} {u.status === "finalized" ? "✓" : "(draft)"}
                </option>
              ))}
            </select>
          )}

          {/* Status badge */}
          {currentUpdate && (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                isFinalized
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {isFinalized ? "Finalized" : "Draft"}
            </span>
          )}
        </div>
      </div>

      {/* No update selected */}
      {!currentUpdate ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <div className="text-slate-400 text-sm mb-4">
            {hasCurrentWeek
              ? "Select a week from the dropdown above."
              : "No update for this week yet."}
          </div>
          {!hasCurrentWeek && (
            <button
              onClick={createUpdate}
              className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg"
            >
              Start This Week&apos;s Update
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Action bar */}
          <div className="flex items-center gap-3 mb-4">
            {!isFinalized && (
              <>
                <button
                  onClick={generateWithAI}
                  disabled={generating}
                  className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {generating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <span className="text-xs">✦</span>
                      Generate with AI
                    </>
                  )}
                </button>
                <button
                  onClick={saveSections}
                  disabled={saving}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Draft"}
                </button>
                <button
                  onClick={finalizeUpdate}
                  className="px-4 py-2 text-sm border border-green-200 rounded-lg text-green-700 hover:bg-green-50"
                >
                  Finalize
                </button>
              </>
            )}
            {isFinalized && (
              <button
                onClick={unfinalizeUpdate}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                Reopen as Draft
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={collapsedSections.size > 0 ? expandAll : collapseAll}
              className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700"
            >
              {collapsedSections.size > 0 ? "Expand all" : "Collapse all"}
            </button>
            {saveStatus && (
              <span className={`text-sm font-medium ${saveStatus.includes("fail") || saveStatus.includes("error") ? "text-red-600" : "text-green-600"}`}>
                {saveStatus}
              </span>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium uppercase tracking-wide w-48">
                    Deliverable
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Progress Update
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Next Steps
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    What We Need From You
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentUpdate.sections.map((section, i) => {
                  const isCollapsed = collapsedSections.has(section.id);
                  const hasContent = !!(section.progressUpdate || section.nextSteps || section.needsFromClient);
                  return (
                    <tr
                      key={section.id}
                      className={`border-b border-slate-100 ${
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                      }`}
                    >
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => toggleCollapse(section.id)}
                          className="w-full flex items-center gap-2 text-sm font-semibold text-white px-3 py-2 rounded-lg hover:opacity-90 text-left"
                          style={{ backgroundColor: "#1E3A5F" }}
                          title={isCollapsed ? "Expand" : "Collapse"}
                        >
                          <svg
                            className={`w-3 h-3 text-white/70 flex-shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="flex-1 truncate">{section.deliverable}</span>
                          {section.health && (
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white/20"
                              style={{ backgroundColor: HEALTH_COLORS[section.health] }}
                              title={`Health: ${HEALTH_LABELS[section.health] || section.health}${section.itemCount ? ` (${section.itemCount} items)` : ""}`}
                            />
                          )}
                        </button>
                      </td>
                      {isCollapsed ? (
                        <td colSpan={3} className="px-4 py-3 text-xs text-slate-400 italic">
                          {hasContent ? "Click to expand" : "Empty"}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 align-top">
                            <AutoTextarea
                              value={section.progressUpdate}
                              onChange={(v) => updateSection(section.id, "progressUpdate", v)}
                              disabled={isFinalized}
                              placeholder="Click to add progress update…"
                              onBlur={saveSections}
                            />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <AutoTextarea
                              value={section.nextSteps}
                              onChange={(v) => updateSection(section.id, "nextSteps", v)}
                              disabled={isFinalized}
                              placeholder="Click to add next steps…"
                              onBlur={saveSections}
                            />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <AutoTextarea
                              value={section.needsFromClient}
                              onChange={(v) => updateSection(section.id, "needsFromClient", v)}
                              disabled={isFinalized}
                              placeholder="Click to add…"
                              onBlur={saveSections}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {currentUpdate.sections.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                No active deliverables found. All categories are either fully completed or not yet started.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  disabled,
  placeholder,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder={placeholder}
      rows={3}
      className={`w-full text-sm leading-relaxed resize-none rounded-lg border border-transparent px-2 py-1.5 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200 ${
        disabled
          ? "bg-transparent text-slate-700 cursor-default"
          : "hover:border-slate-200 text-slate-700"
      }`}
    />
  );
}

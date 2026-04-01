"use client";
import { useState } from "react";

interface Props {
  summary: string | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

function renderBullets(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-2.5">
      {lines.map((line, i) => {
        const match = line.replace(/^[-•]\s*/, "").match(/^\*\*(.+?)\*\*:\s*(.+)$/);
        if (match) {
          return (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-1 rounded-full bg-blue-400 mt-0.5" style={{ minHeight: 18 }} />
              <div>
                <span className="text-sm font-semibold text-slate-800">{match[1]}: </span>
                <span className="text-sm text-slate-600 leading-relaxed">{match[2]}</span>
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 w-1 rounded-full bg-slate-300 mt-0.5" style={{ minHeight: 18 }} />
            <p className="text-sm text-slate-600 leading-relaxed">{line}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function AISummaryCard({ summary, loading, error, onRetry }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${collapsed ? "" : "rotate-90"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-slate-700">AI Executive Briefing</span>
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded font-medium">AI</span>
        </button>
        {onRetry && !collapsed && (
          <button
            onClick={onRetry}
            disabled={loading}
            className="text-xs text-blue-500 hover:text-blue-700 hover:underline disabled:opacity-50"
          >
            {loading ? "Generating…" : error || !summary ? "Retry" : "Refresh"}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="mt-4">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 w-1 rounded-full bg-slate-200 animate-pulse" style={{ minHeight: 18 }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${70 + (i * 5) % 20}%` }} />
                    <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50 + (i * 7) % 30}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : summary ? (
            renderBullets(summary)
          ) : (
            <p className="text-slate-400 text-sm italic">
              {error
                ? "Failed to generate briefing — check your API key or click Retry."
                : "Configure ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local to enable AI briefings."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

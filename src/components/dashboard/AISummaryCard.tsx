"use client";

interface Props {
  summary: string | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

function renderBullets(text: string) {
  // Split by newlines and filter empty lines
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        // Parse **Label**: Content pattern
        const match = line.replace(/^[-•]\s*/, "").match(/^\*\*(.+?)\*\*:\s*(.+)$/);
        if (match) {
          return (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-1 rounded-full bg-blue-400 mt-0.5" style={{ minHeight: 20 }} />
              <div>
                <span className="text-sm font-semibold text-slate-800">{match[1]}: </span>
                <span className="text-sm text-slate-600 leading-relaxed">{match[2]}</span>
              </div>
            </div>
          );
        }
        // Fallback for lines without bold pattern
        return (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 w-1 rounded-full bg-slate-300 mt-0.5" style={{ minHeight: 20 }} />
            <p className="text-sm text-slate-600 leading-relaxed">{line}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function AISummaryCard({ summary, loading, error, onRetry }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">AI Executive Briefing</span>
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded font-medium">AI</span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={loading}
            className="text-xs text-blue-500 hover:text-blue-700 hover:underline disabled:opacity-50"
          >
            {loading ? "Generating…" : error || !summary ? "Retry" : "Refresh"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-1 rounded-full bg-slate-200 animate-pulse" style={{ minHeight: 20 }} />
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
  );
}

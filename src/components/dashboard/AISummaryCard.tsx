"use client";

interface Props {
  summary: string | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export default function AISummaryCard({ summary, loading, error, onRetry }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">AI Narrative Summary</span>
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded font-medium">AI</span>
        </div>
        {(error || (!loading && !summary)) && onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
          >
            Retry
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
          <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6" />
          <div className="h-3 bg-slate-100 rounded animate-pulse w-4/6" />
          <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6" />
        </div>
      ) : summary ? (
        <p className="text-slate-600 text-sm leading-relaxed">{summary}</p>
      ) : (
        <p className="text-slate-400 text-sm italic">
          {error
            ? "Failed to generate summary — check your API key or click Retry."
            : "Configure ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local to enable AI summaries."}
        </p>
      )}
    </div>
  );
}

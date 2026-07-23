export const dynamic = "force-dynamic";

export default function MeetingNotesPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-ink mb-1">Meeting Notes</h1>
      <p className="text-slate-500 text-sm mb-6">AI-powered meeting notes analysis is coming in Phase 2.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 text-blue-700 text-sm">
        <p className="font-medium mb-1">Phase 2 Feature</p>
        <p>Upload meeting notes (.docx, .pdf, .txt) and the AI will extract risks, action item updates, key decisions, and follow-ups — all cross-referenced against your workplan.</p>
      </div>
    </div>
  );
}

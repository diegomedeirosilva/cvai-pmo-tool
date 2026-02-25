export const dynamic = "force-dynamic";

export default function ChangesPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Status Changes</h1>
      <p className="text-slate-500 text-sm mb-6">Diff view between uploads is coming in Phase 2.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 text-blue-700 text-sm">
        <p className="font-medium mb-1">Phase 2 Feature</p>
        <p>Once you upload multiple versions of the workplan, this page will show what changed between uploads — status changes, new items, completion % updates, and date changes.</p>
      </div>
    </div>
  );
}

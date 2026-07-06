import { DashboardSummary, Risk, ActionItem } from "@/types";
import { computeStatus, rollupStatus, computeGroupStatus, averageCompletion } from "@/lib/dashboard";
import { CVA_LOGO_DATA_URI } from "./logo";

// ---- Input shape -----------------------------------------------------------

export interface ReportSection {
  deliverable: string; // category name
  progressUpdate: string;
  nextSteps: string;
  needsFromClient: string;
  health?: "Green" | "Amber" | "Red";
  itemCount?: number;
}

export interface ReportPayload {
  summary: Omit<DashboardSummary, "aiSummary">;
  risks: Risk[];
  items: ActionItem[];
  weeklySections: ReportSection[]; // may be empty (fallback to derived categories)
  weekLabel?: string;
  generatedAt: string; // formatted date string, passed in by the caller
}

// ---- Constants -------------------------------------------------------------

const STATUS_COLOR: Record<string, string> = {
  "Not Started": "#94A3B8",
  Completed: "#3B82F6",
  "On-track": "#22C55E",
  "At-risk": "#F59E0B",
  Overdue: "#EF4444",
};
const STATUS_ORDER: Record<string, number> = {
  Overdue: 0,
  "At-risk": 1,
  "On-track": 2,
  "Not Started": 3,
  Completed: 4,
};
const RAG: Record<string, { color: string; label: string }> = {
  Green: { color: "#22C55E", label: "On Track" },
  Amber: { color: "#F59E0B", label: "At Risk" },
  Red: { color: "#EF4444", label: "Critical" },
};

// ---- Small helpers ---------------------------------------------------------

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function pct(n: number): number {
  return Math.round((n || 0) * 100);
}
function fmtDate(s: string): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return esc(s);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Parse a "- bullet\n- bullet" block into <li> items.
function bulletList(text: string, cls = ""): string {
  const lines = (text || "")
    .split(/\n/)
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `<ul class="bullets ${cls}">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

function statusPill(status: string): string {
  const c = STATUS_COLOR[status] || "#94A3B8";
  return `<span class="pill" style="color:${c};background:${c}1A;"><span class="pdot" style="background:${c}"></span>${esc(status)}</span>`;
}
function statusBadge(status: string): string {
  const color = STATUS_COLOR[status] || "#94A3B8";
  return `<span class="rag"><span class="ragdot" style="background:${color}"></span>${status}</span>`;
}
function progressBar(p: number, color = "#1FC6B8"): string {
  const w = Math.max(0, Math.min(100, p));
  return `<div class="bar"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
}

// Inline SVG donut from segments [{value,color}] — mirrors the dashboard's status pie.
function donutChart(segments: { value: number; color: string }[], size = 220, thickness = 34): string {
  const total = segments.reduce((a, x) => a + (x.value || 0), 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments
    .filter((x) => x.value > 0)
    .map((x) => {
      const len = (x.value / total) * circ;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${x.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
      return el;
    })
    .join("");
  return `<svg viewBox="0 0 ${size} ${size}" class="donut-svg">${arcs}</svg>`;
}

// Split "Project Crystal - JV Day 1 Readiness Plan" onto two lines at the first " - ".
function titleWithBreak(title: string): string {
  const idx = title.indexOf(" - ");
  if (idx === -1) return esc(title);
  return esc(title.slice(0, idx)) + "<br/>" + esc(title.slice(idx + 3));
}

// ---- Gantt timeline helpers ------------------------------------------------

const G_LABEL = 250, G_MIN_PPD = 2, G_MAX_PPD = 8; // label-col width (px) + zoom clamp; row/bar sizes live in CSS
const DAY_MS = 86400000;

type GScale = { startMs: number; endMs: number; totalDays: number; ppd: number; chartWidth: number; day1Ms: number | null; forecastMs: number | null };

function gDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function msToX(ms: number, sc: GScale): number {
  return Math.ceil((ms - sc.startMs) / DAY_MS) * sc.ppd;
}
function dateToX(dateStr: string, sc: GScale): number | null {
  const d = gDate(dateStr);
  return d ? msToX(d.getTime(), sc) : null;
}
function clampX(x: number, sc: GScale): number {
  return Math.max(0, Math.min(sc.chartWidth, x));
}

function timeScale(items: ActionItem[], day1Target: string): GScale {
  const starts = items.map((i) => gDate(i.startDate)).filter(Boolean).map((d) => (d as Date).getTime());
  const ends = items.map((i) => gDate(i.endDate)).filter(Boolean).map((d) => (d as Date).getTime());
  const day1 = gDate(day1Target);
  const forecastMs = ends.length ? Math.max(...ends) : null; // plan's latest finish
  const firstStart = starts.length ? new Date(Math.min(...starts)) : day1 || new Date(2026, 1, 1);
  const start = new Date(firstStart.getFullYear(), firstStart.getMonth(), 1); // first of month
  let endMs = day1 ? day1.getTime() + 14 * DAY_MS : (forecastMs ?? start.getTime() + 180 * DAY_MS);
  // Extend past Day-1 to cover the plan's latest finish (+14d pad) so slipped bars stay on-canvas.
  if (forecastMs != null && forecastMs + 14 * DAY_MS > endMs) endMs = forecastMs + 14 * DAY_MS;
  const startMs = start.getTime();
  if (endMs <= startMs) endMs = startMs + 30 * DAY_MS;
  const totalDays = Math.ceil((endMs - startMs) / DAY_MS);
  const available = 1440 - 250 - 128 - G_LABEL; // viewport − rail − padding − label col
  const ppd = Math.max(G_MIN_PPD, Math.min(G_MAX_PPD, available / totalDays));
  const chartWidth = Math.round(totalDays * ppd);
  return { startMs, endMs, totalDays, ppd, chartWidth, day1Ms: day1 ? day1.getTime() : null, forecastMs };
}

function monthLines(sc: GScale): { x: number; label: string }[] {
  const out: { x: number; label: string }[] = [];
  const d = new Date(sc.startMs);
  d.setDate(1);
  while (d.getTime() <= sc.endMs) {
    out.push({ x: msToX(d.getTime(), sc), label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }) });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

// Min start / max end + completion for a category's items (valid dates only).
function catSpan(items: ActionItem[]) {
  const starts = items.map((i) => gDate(i.startDate)).filter(Boolean).map((d) => (d as Date).getTime());
  const ends = items.map((i) => gDate(i.endDate)).filter(Boolean).map((d) => (d as Date).getTime());
  if (!starts.length || !ends.length) return null;
  const completed = items.filter((i) => i.actualCompletionPct >= 1).length;
  const total = items.length;
  return { minStart: Math.min(...starts), maxEnd: Math.max(...ends), completed, total, completedPct: total ? completed / total : 0 };
}

// Most-severe open status of a group → drives the collapsed bar color.
function groupStatus(items: ActionItem[]): string {
  let overdue = 0, atRisk = 0, onTrack = 0, notStarted = 0;
  for (const i of items) {
    const st = computeStatus(i);
    if (st === "Overdue") overdue++;
    else if (st === "At-risk") atRisk++;
    else if (st === "On-track") onTrack++;
    else if (st === "Not Started") notStarted++;
  }
  if (overdue) return "Overdue";
  if (atRisk) return "At-risk";
  if (onTrack) return "On-track";
  if (notStarted) return "Not Started";
  return "Completed";
}

// ---- Slides ----------------------------------------------------------------

function coverSlide(p: ReportPayload): string {
  const s = p.summary;
  return `
  <section class="slide dark cover" data-name="Cover" data-theme="dark">
    <div class="aurora"></div>
    <div class="slide-inner">
      <img class="cover-logo" data-r="1" src="${CVA_LOGO_DATA_URI}" alt="CVA" />
      <div class="cover-eyebrow" data-r="1">Executive Status Report</div>
      <h1 class="cover-h1" data-r="2">${titleWithBreak(s.project.title)}</h1>
      <div class="cover-date" data-r="4">
        <span class="cover-date-label">Report date</span>
        <span class="cover-date-val">${esc(p.generatedAt)}</span>
      </div>
      <div class="cover-prep" data-r="5">Private &amp; Confidential</div>
    </div>
  </section>`;
}

// Overdue + at-risk items, most urgent first — shared by At-a-Glance.
function attentionItems(items: ActionItem[]) {
  return items
    .map((i) => ({ i, st: computeStatus(i) }))
    .filter((x) => x.st === "Overdue" || x.st === "At-risk")
    .sort(
      (a, b) =>
        (a.st === "Overdue" ? 0 : 1) - (b.st === "Overdue" ? 0 : 1) ||
        a.i.endDate.localeCompare(b.i.endDate)
    );
}

function glanceSlide(p: ReportPayload): string {
  const s = p.summary;
  const complete = Math.round(averageCompletion(p.items) * 100);
  const r = RAG[s.overallHealth] || RAG.Green;

  const segs = [
    { v: s.completed, c: STATUS_COLOR.Completed, l: "Completed" },
    { v: s.onTrack, c: STATUS_COLOR["On-track"], l: "On-track" },
    { v: s.atRisk, c: STATUS_COLOR["At-risk"], l: "At-risk" },
    { v: s.overdue, c: STATUS_COLOR.Overdue, l: "Overdue" },
    { v: s.notStarted, c: STATUS_COLOR["Not Started"], l: "Not started" },
  ];
  const donut = donutChart(segs.map((x) => ({ value: x.v, color: x.c })));
  const legend = segs
    .map(
      (x) => `
      <div class="lg-row">
        <span class="lg-dot" style="background:${x.c}"></span>
        <span class="lg-label">${x.l}</span>
        <span class="lg-val">${x.v}</span>
        <span class="lg-pct">${s.totalItems > 0 ? Math.round((x.v / s.totalItems) * 100) : 0}%</span>
      </div>`
    )
    .join("");

  const attention = attentionItems(p.items);
  const shown = attention.slice(0, 12);
  const attList =
    attention.length > 0
      ? shown
          .map(
            ({ i, st }) => `
        <li class="att">
          ${statusPill(st)}
          <span class="att-name">${esc(i.requirement || i.action)}</span>
          <span class="att-meta">${esc(i.workstream)} · due ${fmtDate(i.endDate)}</span>
        </li>`
          )
          .join("") +
        (attention.length > shown.length
          ? `<li class="att-more">+ ${attention.length - shown.length} more overdue / at-risk items</li>`
          : "")
      : `<li class="empty">No overdue or at-risk items.</li>`;

  // Forecast finish vs the fixed Day-1 target — surfaces slip without moving the deadline.
  const slipDays = s.projectedSlipDays;
  const slipCol = slipDays > 14 ? "#DC2626" : slipDays > 0 ? "#D97706" : "#059669";
  const slipLabel = slipDays > 0 ? `${slipDays}d past target` : slipDays < 0 ? `${-slipDays}d ahead` : "on target";

  return `
  <section class="slide light" data-name="At a Glance" data-theme="light">
    <div class="slide-inner">
      <div class="head">
        <div class="eyebrow" data-r="1">Executive summary</div>
        <div class="title" data-r="1">Status at a glance</div>
        <p class="subtitle" data-r="2">Overall completion <strong>${complete}%</strong> · ${s.workstreamHealth.length} workstreams · projected Day-1 in <strong>${s.daysToDay1} days</strong>.</p>
      </div>
      <div class="body">
        <div class="glance-overview" data-r="3">
          <div class="donut-card">
            <div class="donut-head">
              <span class="col-label">Status distribution · ${s.totalItems} items</span>
              <span class="big-rag light-rag" style="--c:${r.color}"><span class="big-ragdot" style="background:${r.color}"></span>${r.label}</span>
            </div>
            <div class="donut-flex">
              <div class="donut-chart">${donut}<div class="donut-center"><b>${complete}%</b><span>complete</span></div></div>
              <div class="donut-legend">${legend}</div>
            </div>
            <div class="day1-strip">
              ${s.projectedFinish ? `<div><span class="d1k">Projected Day-1</span><span class="d1v" style="color:${slipCol}">${fmtDate(s.projectedFinish)}</span><span class="d1slip" style="color:${slipCol}">${slipLabel}</span></div>` : ""}
              <div><span class="d1k">Original target</span><span class="d1v">${fmtDate(s.project.day1TargetDate)}</span></div>
              <div class="d1days"><b>${s.daysToDay1}</b><span>days to go</span></div>
            </div>
          </div>
          <div class="att-card">
            <div class="col-label">Requires attention · ${attention.length} overdue &amp; at-risk</div>
            <ul class="att-list">${attList}</ul>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

// Per-category rollup (status counts + RAG + completion) for a set of items.
function catStats(items: ActionItem[]) {
  let completed = 0, overdue = 0, atRisk = 0, onTrack = 0, notStarted = 0;
  for (const i of items) {
    const st = computeStatus(i);
    if (st === "Completed") completed++;
    else if (st === "Overdue") overdue++;
    else if (st === "At-risk") atRisk++;
    else if (st === "On-track") onTrack++;
    else notStarted++;
  }
  const total = items.length;
  return {
    total, completed, overdue, atRisk, onTrack, notStarted,
    groupStatus: rollupStatus({ total, overdue, atRisk, onTrack, completed }),
    completionPct: averageCompletion(items),
  };
}

function workstreamSlide(p: ReportPayload): string {
  const s = p.summary;

  // Group categories under each workstream (in first-seen order).
  const catsByWs = new Map<string, Map<string, ActionItem[]>>();
  for (const i of p.items) {
    if (!catsByWs.has(i.workstream)) catsByWs.set(i.workstream, new Map());
    const cm = catsByWs.get(i.workstream)!;
    if (!cm.has(i.category)) cm.set(i.category, []);
    cm.get(i.category)!.push(i);
  }

  const wbars = s.workstreamHealth
    .map((w, idx) => {
      const scol = STATUS_COLOR[w.groupStatus] || "#94A3B8";
      const cp = pct(w.completionPct);
      const flags =
        (w.overdue ? `<span class="wflag" style="color:#EF4444">${w.overdue} overdue</span>` : "") +
        (w.atRisk ? `<span class="wflag" style="color:#F59E0B">${w.atRisk} at-risk</span>` : "");
      return `
      <button class="wbar${idx === 0 ? " active" : ""}" data-ws="${idx}">
        <div class="wbar-top">
          <span class="ragdot" style="background:${scol}"></span>
          <span class="wbar-name">${esc(w.workstream)}</span>
          <span class="wbar-pct">${cp}%</span>
          <span class="wbar-caret">›</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${cp}%;background:${scol}"></div></div>
        <div class="wbar-foot"><span>${w.completed}/${w.total} complete</span><span class="wflags">${flags}</span></div>
      </button>`;
    })
    .join("");

  // Right-hand drill-down panel per workstream (only the active one shown).
  const details = s.workstreamHealth
    .map((w, idx) => {
      const cm = catsByWs.get(w.workstream) || new Map<string, ActionItem[]>();
      const cards = Array.from(cm.entries())
        .map(([cat, items]) => {
          const st = catStats(items);
          const rc = STATUS_COLOR[st.groupStatus] || "#94A3B8";
          const cp = Math.round(st.completionPct * 100);
          const flags =
            (st.overdue ? `<span class="wflag" style="color:#EF4444">${st.overdue} overdue</span>` : "") +
            (st.atRisk ? `<span class="wflag" style="color:#F59E0B">${st.atRisk} at-risk</span>` : "");
          return `
          <div class="catcard">
            <div class="catcard-top">
              <span class="ragdot" style="background:${rc}"></span>
              <span class="catcard-name">${esc(cat)}</span>
              <span class="catcard-pct">${cp}%</span>
            </div>
            <div class="bar"><div class="bar-fill" style="width:${cp}%;background:${rc}"></div></div>
            <div class="catcard-foot"><span>${st.completed}/${st.total} complete</span><span class="wflags">${flags}</span></div>
          </div>`;
        })
        .join("") || `<div class="empty-card">No categories.</div>`;
      return `
        <div class="ws-detail${idx === 0 ? " active" : ""}" data-ws="${idx}">
          <div class="col-label">Categories · ${esc(w.workstream)}</div>
          <div class="catcards">${cards}</div>
        </div>`;
    })
    .join("");

  return `
  <section class="slide light" data-name="By Workstream" data-theme="light">
    <div class="slide-inner">
      <div class="head">
        <div class="eyebrow" data-r="1">Executive summary</div>
        <div class="title" data-r="1">Status by workstream</div>
        <p class="subtitle" data-r="2">Completion across the ${s.workstreamHealth.length} workstreams — select one to drill into its categories.</p>
      </div>
      <div class="body">
        <div class="ws-cols" data-r="3">
          <div>
            <div class="col-label">Completion by workstream <span class="muted">(click to drill in)</span></div>
            <div class="wbars">${wbars}</div>
          </div>
          <div class="ws-detail-wrap">${details}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function timelineSlide(p: ReportPayload): string {
  const s = p.summary;
  const sc = timeScale(p.items, s.project.day1TargetDate);

  // Month gridlines + labels.
  const monthEls = monthLines(sc)
    .map((m) => `<div class="gmonth" style="left:${m.x}px"><span class="gmlabel">${m.label}</span></div>`)
    .join("");

  // Today / Day-1 markers (clamped into view).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayX = clampX(msToX(today.getTime(), sc), sc);
  const day1X = sc.day1Ms != null ? clampX(msToX(sc.day1Ms, sc), sc) : null;
  // Projected Day-1 marker (the plan's latest end) = the prominent navy line;
  // the original target is a subtle dotted grey reference.
  const forecastX = sc.forecastMs != null ? clampX(msToX(sc.forecastMs, sc), sc) : null;
  const marks =
    `<div class="gmark gmark-today" style="left:${todayX}px"><span>Today</span></div>` +
    (day1X != null ? `<div class="gmark gmark-day1" style="left:${day1X}px"><span>Target</span></div>` : "") +
    (forecastX != null ? `<div class="gmark gmark-forecast" style="left:${forecastX}px"><span>Day-1 (proj.)</span></div>` : "");

  // Rows grouped by WORKSTREAM + CATEGORY (e.g. "Entity Formation - Finance" is
  // distinct from "Operational readiness - Finance"). Kept in source (sortOrder)
  // order — first-seen in p.items — so same-workstream categories stay together,
  // matching the tool's Gantt grouping.
  const groupMap = new Map<string, { ws: string; cat: string; items: ActionItem[] }>();
  for (const it of p.items) {
    const key = it.workstream + "|||" + it.category;
    if (!groupMap.has(key)) groupMap.set(key, { ws: it.workstream, cat: it.category, items: [] });
    groupMap.get(key)!.items.push(it);
  }
  const groups = Array.from(groupMap.values())
    .map((g) => ({ ...g, span: catSpan(g.items) }))
    .filter((g) => g.span);

  const rows = groups
    .map(({ ws, cat, items, span }) => {
      const sp = span!;
      const gst = groupStatus(items);
      const color = STATUS_COLOR[computeGroupStatus(items)] || "#94A3B8";
      const cx = clampX(msToX(sp.minStart, sc), sc);
      const plannedEndX = clampX(msToX(sp.maxEnd, sc), sc);
      const cw = Math.max(plannedEndX - cx, 4);
      // Overdue group slips past its planned end → red hatch overrun out to Today.
      const overW = gst === "Overdue" && today.getTime() > sp.maxEnd ? Math.max(todayX - plannedEndX, 0) : 0;
      const overBar = overW > 0 ? `<div class="gbar gbar-over" style="left:${plannedEndX}px;width:${overW}px"></div>` : "";
      const label = ws + " - " + cat;
      const itemRows = [...items]
        .sort((a, b) => (gDate(a.startDate)?.getTime() || 0) - (gDate(b.startDate)?.getTime() || 0))
        .map((it) => {
          const st = computeStatus(it);
          const c = STATUS_COLOR[st] || "#94A3B8";
          const x0 = dateToX(it.startDate, sc);
          const x1 = dateToX(it.endDate, sc);
          let bar = "";
          if (x0 != null && x1 != null) {
            const x = clampX(x0, sc);
            const endX = clampX(x1, sc);
            if (st === "Overdue") {
              // Solid from start → original end; red hatch from original end → Today.
              const plannedW = Math.max(endX - x, 4);
              const ow = Math.max(todayX - endX, 0);
              bar =
                `<div class="gbar gbar-solid" style="left:${x}px;width:${plannedW}px;background:${c}"></div>` +
                (ow > 0 ? `<div class="gbar gbar-over" style="left:${endX}px;width:${ow}px"></div>` : "");
            } else {
              const w = Math.max(endX - x, 4);
              const fw = w * Math.max(0, Math.min(1, it.actualCompletionPct || 0));
              bar = `<div class="gbar" style="left:${x}px;width:${w}px;background:${c}40"><div class="gfill" style="width:${fw}px;background:${c}"></div></div>`;
            }
          }
          return `<div class="grow grow-item"><div class="glabel glabel-item" title="${esc(it.requirement || it.action)}">${esc(it.requirement || it.action)}</div><div class="gtrack" style="width:${sc.chartWidth}px">${bar}</div></div>`;
        })
        .join("");
      return `
        <div class="gcat">
          <div class="grow grow-cat">
            <div class="glabel"><span class="gcaret">▶</span><span class="gcat-name" title="${esc(label)}">${esc(label)}</span><span class="gcat-count">${sp.total}</span></div>
            <div class="gtrack" style="width:${sc.chartWidth}px">
              <div class="gbar gbar-cat" style="left:${cx}px;width:${cw}px;background:${color}"><span class="gbar-txt">${sp.completed}/${sp.total}</span></div>
              ${overBar}
            </div>
          </div>
          <div class="gitems">${itemRows}</div>
        </div>`;
    })
    .join("");

  const legend =
    [["Completed", "#3B82F6"], ["On-track", "#22C55E"], ["At-risk", "#F59E0B"], ["Overdue", "#EF4444"], ["Not started", "#94A3B8"]]
      .map(([l, c]) => `<span class="gl-item"><span class="gl-sw" style="background:${c}"></span>${l}</span>`)
      .join("") +
    `<span class="gl-sep"></span><span class="gl-item"><span class="gl-hatch"></span>Overdue slip</span><span class="gl-item"><span class="gl-mark gl-today"></span>Today</span><span class="gl-item"><span class="gl-mark gl-forecast"></span>Projected Day-1</span><span class="gl-item"><span class="gl-mark gl-day1"></span>Target</span>`;

  return `
  <section class="slide light timeline" data-name="Timeline" data-theme="light">
    <div class="slide-inner">
      <div class="head">
        <div class="eyebrow" data-r="1">Executive Summary</div>
        <div class="title" data-r="1">Timeline</div>
        <p class="subtitle" data-r="2">Plan by workstream-category through projected Day-1 (${fmtDate(s.projectedFinish || s.project.day1TargetDate)}) — click a row to expand its items.</p>
      </div>
      <div class="body">
        <div class="gantt-legend" data-r="3">${legend}</div>
        <div class="gantt-scroll" data-r="3">
          <div class="gantt-canvas" style="width:${G_LABEL + sc.chartWidth}px">
            <div class="gantt-grid" style="left:${G_LABEL}px;width:${sc.chartWidth}px">${monthEls}</div>
            <div class="gantt-marks" style="left:${G_LABEL}px;width:${sc.chartWidth}px">${marks}</div>
            <div class="gantt-header"></div>
            <div class="gantt-rows">${rows}</div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function categorySlide(category: string, section: ReportSection | null, items: ActionItem[]): string {
  // Use computeStatus consistently (date-aware) so pills + counts agree across the report.
  const withStatus = items.map((i) => ({ i, st: computeStatus(i) }));
  const sorted = [...withStatus].sort(
    (a, b) => (STATUS_ORDER[a.st] ?? 9) - (STATUS_ORDER[b.st] ?? 9) || a.i.endDate.localeCompare(b.i.endDate)
  );
  const total = items.length;
  const completed = withStatus.filter((x) => x.st === "Completed").length;
  const notStarted = withStatus.filter((x) => x.st === "Not Started").length;
  const open = total - completed - notStarted; // On-track + At-risk + Overdue
  const cp = Math.round(averageCompletion(items) * 100);
  const gstatus = computeGroupStatus(items);

  const taskRows =
    sorted.length > 0
      ? sorted
          .map(({ i, st }, idx) => {
            const c = STATUS_COLOR[st] || "#94A3B8";
            const ap = pct(i.actualCompletionPct);
            const hasNote = !!(i.notes && i.notes.trim());
            return `
          <div class="task${hasNote ? " has-note" : ""}" ${hasNote ? `data-task="${idx}"` : ""}>
            <div class="task-main">
              ${statusPill(st)}
              <span class="task-name">${esc(i.requirement || i.action)}</span>
              ${hasNote ? `<span class="task-caret">▸</span>` : ""}
            </div>
            <div class="task-meta">
              <span class="task-owner">${esc(i.owner || "—")}</span>
              <span class="task-due">due ${fmtDate(i.endDate)}</span>
              <span class="task-bar">${progressBar(ap, c)}</span>
              <span class="task-pct">${ap}%</span>
            </div>
            ${hasNote ? `<div class="task-notes">${esc(i.notes)}</div>` : ""}
          </div>`;
          })
          .join("")
      : `<div class="empty-card">No tasks in this category.</div>`;

  const progress = section ? bulletList(section.progressUpdate, "b-progress") : "";
  const next = section ? bulletList(section.nextSteps, "b-next") : "";
  const needs = section && (section.needsFromClient || "").trim() ? esc(section.needsFromClient.replace(/^[-•]\s*/, "")) : "";
  const fallbackRollup = !section
    ? `<ul class="bullets b-progress"><li>${completed}/${total} complete · ${gstatus.toLowerCase()}</li></ul>`
    : "";

  return `
  <section class="slide light deepdive" data-name="${esc(category)}" data-theme="light">
    <div class="slide-inner">
      <div class="head">
        <div class="eyebrow" data-r="1">Deep dive</div>
        <div class="title" data-r="1">${esc(category)} ${statusBadge(gstatus)}</div>
        <p class="subtitle" data-r="2"><strong>${completed}/${total} complete</strong> · ${open} open · ${cp}% done</p>
      </div>
      <div class="body dd-body">
        <div class="dd-tasks" data-r="3">
          <div class="col-label">Tasks &amp; accountability <span class="muted">(click a row to expand notes)</span></div>
          <div class="task-list">${taskRows}</div>
        </div>
        <div class="dd-narr" data-r="4">
          <div class="sowhat">
            <div class="sowhat-label">Status update</div>
            ${progress || fallbackRollup || `<p class="muted">No update this week.</p>`}
          </div>
          ${next ? `<div class="narr-card"><div class="narr-label">Next steps</div>${next}</div>` : ""}
          ${needs ? `<div class="narr-callout"><div class="narr-label">Decisions / needs</div><p>${needs}</p></div>` : ""}
        </div>
      </div>
    </div>
  </section>`;
}

// ---- Document --------------------------------------------------------------

export function buildHtmlReport(p: ReportPayload): string {
  // Determine deep-dive categories: prefer weekly-update sections (ordered), else derive from items.
  const sectionByCat = new Map(p.weeklySections.map((s) => [s.deliverable, s]));
  let categories: string[];
  if (p.weeklySections.length > 0) {
    categories = p.weeklySections.map((s) => s.deliverable);
  } else {
    categories = Array.from(new Set(p.items.map((i) => i.category).filter(Boolean)));
  }
  const itemsByCat = new Map<string, ActionItem[]>();
  for (const i of p.items) {
    if (!itemsByCat.has(i.category)) itemsByCat.set(i.category, []);
    itemsByCat.get(i.category)!.push(i);
  }

  const slides = [
    coverSlide(p),
    glanceSlide(p),
    ...(p.items.length > 0 ? [timelineSlide(p)] : []),
    workstreamSlide(p),
    ...categories.map((c) => categorySlide(c, sectionByCat.get(c) || null, itemsByCat.get(c) || [])),
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(p.summary.project.title)} — Executive Status Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --navy-950:#04101F;--navy-900:#061B30;--navy-800:#0B2545;--navy-700:#0E3A5C;
  --teal-400:#3FD9CC;--teal-500:#1FC6B8;--teal-600:#1AAEAC;--teal-700:#11888B;
  --warm:#E8945B;--ink:#0B2545;--ink-soft:#46586C;--ink-faint:#8A98A8;
  --paper:#FFFFFF;--paper-2:#F4F6F8;--rule:#DCE3E8;
  --display:'Cormorant Garamond',Georgia,serif;--body:'Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
  --rail-w:250px;--ease:cubic-bezier(.22,.61,.36,1);--ease-soft:cubic-bezier(.4,0,.2,1);--head-w:min(86%,1180px);
}
body{font-family:var(--body);font-size:16px;line-height:1.55;color:var(--ink);background:var(--navy-950);-webkit-font-smoothing:antialiased;}
#app{position:fixed;inset:0;display:flex;}

/* rail */
#rail{width:var(--rail-w);flex-shrink:0;background:linear-gradient(180deg,#04101F,#061B30 60%,#081f38);color:#fff;display:flex;flex-direction:column;position:relative;z-index:40;border-right:1px solid rgba(255,255,255,.07);}
.rail-logo{padding:28px 26px 18px;}
.rail-logo .rl-word{font-family:var(--display);font-weight:600;font-size:30px;letter-spacing:2px;}
.rail-logo .rl-logo-img{width:92px;height:auto;display:block;}
.rail-logo .tag{margin-top:8px;font-size:9.5px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--teal-500);}
.rail-logo .tag span{display:block;color:rgba(255,255,255,.4);margin-top:3px;}
#rail nav{flex:1;overflow-y:auto;padding:6px 0;position:relative;}
#rail nav::-webkit-scrollbar{width:0;}
.rail-line{position:absolute;left:38px;top:14px;bottom:14px;width:1px;background:rgba(255,255,255,.08);}
.rail-fill{position:absolute;left:38px;top:14px;width:1px;background:linear-gradient(var(--teal-500),var(--teal-700));transition:height .5s var(--ease);box-shadow:0 0 8px rgba(31,198,184,.5);}
.rail-item{display:flex;align-items:center;gap:13px;padding:8px 26px;cursor:pointer;border:none;background:none;width:100%;text-align:left;color:inherit;font-family:inherit;transition:background .3s;}
.rail-item:hover{background:rgba(255,255,255,.03);}
.rail-dot{width:9px;height:9px;border-radius:50%;border:1.5px solid rgba(255,255,255,.28);background:var(--navy-900);flex-shrink:0;margin-left:3px;transition:all .35s var(--ease);}
.rail-item .rail-num{font-size:10px;font-weight:600;color:rgba(255,255,255,.35);width:14px;}
.rail-item .rail-lbl{font-size:12.5px;font-weight:500;color:rgba(255,255,255,.55);line-height:1.3;}
.rail-item.active .rail-dot{border-color:var(--teal-500);background:var(--teal-500);box-shadow:0 0 0 4px rgba(31,198,184,.18),0 0 12px rgba(31,198,184,.6);}
.rail-item.active .rail-lbl{color:#fff;font-weight:600;}
.rail-item.active .rail-num{color:var(--teal-500);}
.rail-item.done .rail-dot{border-color:var(--teal-700);background:var(--teal-700);}
.rail-foot{padding:14px 26px 18px;font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.3);border-top:1px solid rgba(255,255,255,.06);}

/* stage + slides */
#stage{flex:1;position:relative;overflow:hidden;background:var(--navy-950);}
.slide{position:absolute;inset:0;opacity:0;visibility:hidden;pointer-events:none;display:flex;transition:opacity .5s var(--ease-soft),transform .6s var(--ease);transform:scale(1.012);}
.slide.active{opacity:1;visibility:visible;pointer-events:auto;transform:none;z-index:2;}
.slide.prev{opacity:0;transform:scale(.99);}
.slide-inner{flex:1;display:flex;flex-direction:column;justify-content:flex-start;padding:50px 64px 92px;position:relative;z-index:3;min-height:0;}
.slide.cover .slide-inner{justify-content:center;}
.slide.dark{background:var(--navy-900);color:#fff;}
.slide.light{background:var(--paper);}
.aurora{position:absolute;inset:0;z-index:0;overflow:hidden;}
.aurora::before,.aurora::after{content:'';position:absolute;border-radius:50%;filter:blur(70px);opacity:.5;}
.aurora::before{width:55vw;height:55vw;right:-12vw;top:-18vw;background:radial-gradient(circle,rgba(31,198,184,.30),transparent 65%);}
.aurora::after{width:48vw;height:48vw;left:-14vw;bottom:-20vw;background:radial-gradient(circle,rgba(20,80,122,.55),transparent 65%);}

/* type */
.head{width:100%;max-width:var(--head-w);min-height:120px;margin-bottom:18px;flex-shrink:0;}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--teal-600);display:flex;align-items:center;gap:14px;margin-bottom:14px;}
.eyebrow::before{content:'';width:34px;height:2px;background:var(--teal-500);}
.dark .eyebrow{color:var(--teal-400);}
.title{font-family:var(--display);font-weight:600;font-size:clamp(34px,3.6vw,52px);line-height:1.08;letter-spacing:-.4px;color:var(--navy-800);margin-bottom:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.dark .title{color:#fff;}
.subtitle{font-size:18px;line-height:1.55;color:var(--ink-soft);}
.subtitle strong{color:var(--navy-800);}
.body{flex:1;display:flex;flex-direction:column;justify-content:flex-start;min-height:0;width:100%;}
.foot{position:absolute;left:64px;right:64px;bottom:60px;display:flex;justify-content:space-between;font-size:10.5px;letter-spacing:.5px;color:var(--ink-faint);}
.dark .foot{color:rgba(255,255,255,.4);}
.col-label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--teal-700);margin-bottom:14px;}
.col-label .muted{color:var(--ink-faint);font-weight:500;letter-spacing:.5px;text-transform:none;}
.muted{color:var(--ink-faint);}

/* reveal stagger */
[data-r]{opacity:0;transform:translateY(18px);transition:opacity .6s var(--ease),transform .7s var(--ease);}
.slide.active [data-r]{opacity:1;transform:none;}
.slide.active [data-r='1']{transition-delay:.06s;}.slide.active [data-r='2']{transition-delay:.13s;}
.slide.active [data-r='3']{transition-delay:.2s;}.slide.active [data-r='4']{transition-delay:.27s;}
.slide.active [data-r='5']{transition-delay:.34s;}

/* cover */
.cover-logo{width:134px;height:auto;margin-bottom:34px;}
.cover-eyebrow{font-size:12px;font-weight:600;letter-spacing:6px;text-transform:uppercase;color:var(--teal-400);margin-bottom:26px;display:flex;align-items:center;gap:16px;}
.cover-eyebrow::before{content:'';width:46px;height:2px;background:var(--teal-500);}
.cover-h1{font-family:var(--display);font-weight:600;font-size:clamp(44px,6vw,86px);line-height:1.04;letter-spacing:-1px;color:#fff;margin-bottom:22px;}
.cover-sub{font-size:19px;line-height:1.6;color:rgba(255,255,255,.74);max-width:680px;margin-bottom:26px;}
.cover-status{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:26px;}
.big-rag{display:inline-flex;align-items:center;gap:11px;font-family:var(--display);font-weight:600;font-size:30px;color:#fff;border:1px solid var(--c);padding:8px 20px;border-radius:999px;}
.big-ragdot{width:15px;height:15px;border-radius:50%;box-shadow:0 0 14px currentColor;}
.cover-sowhat{font-size:17px;color:rgba(255,255,255,.8);}
.cover-prep{font-size:12px;letter-spacing:1.5px;color:rgba(255,255,255,.5);text-transform:uppercase;}
.cover-stats{position:absolute;left:64px;right:64px;bottom:80px;display:grid;grid-template-columns:repeat(4,1fr);gap:28px;z-index:3;border-top:1px solid rgba(255,255,255,.16);padding-top:24px;}
.cover-stats .cs b{font-family:var(--display);font-weight:600;font-size:clamp(30px,3.4vw,48px);line-height:1;color:#fff;display:block;margin-bottom:7px;}
.cover-stats .cs span{font-size:12px;line-height:1.4;color:rgba(255,255,255,.6);}
.cover-stats .cs{position:relative;padding-left:17px;}
.cover-stats .cs::before{content:'';position:absolute;left:0;top:4px;width:3px;height:calc(100% - 6px);background:linear-gradient(var(--teal-500),transparent);border-radius:2px;}

/* metric strip */
.metric-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:26px;}
.metric{background:var(--paper-2);border:1px solid var(--rule);border-radius:12px;padding:16px 18px;text-align:center;}
.metric-n{font-family:var(--display);font-weight:600;font-size:36px;line-height:1;}
.metric-l{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--ink-faint);margin-top:6px;font-weight:600;}

/* glance columns */
.glance-cols,.risk-cols,.dd-body{display:grid;gap:40px;width:100%;}
.glance-cols{grid-template-columns:1.5fr 1fr;}
.wgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.wcard{background:#fff;border:1px solid var(--rule);border-radius:12px;padding:15px 16px;box-shadow:0 6px 18px rgba(11,37,69,.05);}
.wcard-top{display:flex;align-items:center;gap:10px;margin-bottom:9px;}
.wcard-name{font-weight:600;font-size:14.5px;color:var(--navy-800);flex:1;}
.wcard-pct{font-family:var(--display);font-weight:600;font-size:20px;color:var(--navy-800);}
.wcard-foot{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);margin-top:8px;}
.wflags{display:flex;gap:10px;}.wflag{font-weight:600;}
.rag{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--ink-soft);}
.title .rag{font-size:15px;}
.ragdot{width:11px;height:11px;border-radius:50%;}
.bar{height:7px;border-radius:4px;background:#E8EDF2;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;}
.ms-list,.dec-list,.pri-list{list-style:none;}
.ms{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--rule);font-size:14px;}
.ms-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.ms-name{flex:1;color:var(--navy-800);}
.ms-date{color:var(--ink-soft);font-size:13px;white-space:nowrap;}
.empty,.empty-card{color:var(--ink-faint);font-style:italic;font-size:14px;}
.empty-card{background:var(--paper-2);border:1px dashed var(--rule);border-radius:12px;padding:20px;text-align:center;font-style:normal;}

/* risks */
.risk-cols{grid-template-columns:1.3fr 1fr;}
.risk-grid{display:flex;flex-direction:column;gap:12px;}
.risk{background:#fff;border:1px solid var(--rule);border-left:3px solid #EF4444;border-radius:10px;padding:14px 16px;box-shadow:0 6px 18px rgba(11,37,69,.05);}
.risk-top{display:flex;align-items:center;gap:9px;margin-bottom:7px;}
.sev{font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#fff;padding:3px 9px;border-radius:5px;}
.risk-type{font-weight:600;font-size:13.5px;color:var(--navy-800);}
.risk-ws{font-size:11.5px;color:var(--ink-faint);margin-left:auto;}
.risk-desc{font-size:14px;color:var(--ink);line-height:1.45;}
.risk-mit{font-size:12.5px;color:var(--ink-soft);margin-top:6px;}
.risk-mit b{color:var(--teal-700);}
.risk-aff{font-size:12px;color:var(--ink-faint);margin-top:5px;}
.dec-list li{position:relative;padding:10px 0 10px 0;border-bottom:1px solid var(--rule);font-size:14px;color:var(--ink);}
.dec-cat{display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--teal-700);margin-right:8px;}
.pri-list li{display:flex;gap:12px;padding:7px 0;font-size:13.5px;color:var(--navy-800);}
.pri-date{color:var(--ink-soft);white-space:nowrap;font-size:12.5px;min-width:84px;}

/* deep dive */
.dd-body{grid-template-columns:1.45fr 1fr;}
.dd-tasks{min-height:0;}
.task-list{display:flex;flex-direction:column;gap:8px;max-height:54vh;overflow-y:auto;padding-right:6px;}
.task{background:#fff;border:1px solid var(--rule);border-radius:10px;padding:11px 14px;}
.task.has-note{cursor:pointer;}
.task-main{display:flex;align-items:center;gap:11px;}
.task-name{flex:1;font-weight:600;font-size:14px;color:var(--navy-800);}
.task-caret{color:var(--ink-faint);font-size:11px;transition:transform .2s;}
.task.open .task-caret{transform:rotate(90deg);}
.task-meta{display:flex;align-items:center;gap:12px;margin-top:8px;padding-left:2px;}
.task-owner{font-size:12.5px;color:var(--ink-soft);min-width:90px;}
.task-due{font-size:12px;color:var(--ink-faint);white-space:nowrap;}
.task-bar{flex:1;}.task-bar .bar{height:6px;}
.task-pct{font-size:12px;font-weight:600;color:var(--ink-soft);width:36px;text-align:right;}
.task-notes{display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--rule);font-size:13px;color:var(--ink-soft);line-height:1.5;white-space:pre-wrap;}
.task.open .task-notes{display:block;}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.3px;padding:3px 9px;border-radius:999px;white-space:nowrap;}
.pdot{width:6px;height:6px;border-radius:50%;}
.dd-narr{display:flex;flex-direction:column;gap:18px;}
.sowhat{background:linear-gradient(180deg,#F0FBFA,#F4F6F8);border:1px solid #CFEAE7;border-radius:14px;padding:18px 20px;}
.sowhat-label,.narr-label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--teal-700);margin-bottom:10px;}
.narr-card{background:var(--paper-2);border:1px solid var(--rule);border-radius:14px;padding:18px 20px;}
.narr-card .narr-label{color:var(--ink-soft);}
.narr-callout{background:#FFF7ED;border:1px solid #FCE3C8;border-radius:14px;padding:18px 20px;}
.narr-callout .narr-label{color:var(--warm);}
.narr-callout p{font-size:14.5px;color:#7c4a16;line-height:1.5;}
.bullets{list-style:none;}
.bullets li{position:relative;padding-left:20px;font-size:14.5px;line-height:1.5;color:var(--ink);margin:8px 0;}
.bullets li::before{content:'';position:absolute;left:0;top:8px;width:7px;height:7px;border-radius:50%;background:var(--teal-500);}
.b-next li::before{background:var(--navy-700);}

/* cover date */
.cover-date{margin-top:32px;}
.cover-date-label{display:block;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--teal-400);margin-bottom:7px;}
.cover-date-val{font-family:var(--display);font-weight:600;font-size:36px;color:#fff;line-height:1;}
.cover-prep{margin-top:24px;font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,.5);text-transform:uppercase;}

/* glance — donut + attention */
.glance-overview{display:grid;grid-template-columns:1.15fr 1fr;gap:30px;width:100%;align-items:stretch;}
.donut-card{background:#fff;border:1px solid var(--rule);border-radius:16px;padding:22px 26px;box-shadow:0 8px 24px rgba(11,37,69,.06);display:flex;flex-direction:column;}
.donut-head{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:18px;}
.donut-head .col-label{margin-bottom:0;}
.donut-head .big-rag.light-rag{color:var(--navy-800);font-size:17px;padding:5px 14px;border-color:var(--c);}
.att-card{background:#fff;border:1px solid var(--rule);border-radius:16px;padding:22px 26px;box-shadow:0 8px 24px rgba(11,37,69,.06);display:flex;flex-direction:column;min-height:0;}
.att-card .att-list{flex:1;}
.donut-flex{display:flex;align-items:center;gap:28px;flex:1;}
.donut-chart{position:relative;width:220px;height:220px;flex-shrink:0;}
.donut-svg{width:220px;height:220px;display:block;}
.donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;}
.donut-center b{font-family:var(--display);font-weight:600;font-size:48px;color:var(--navy-800);line-height:1;}
.donut-center span{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:var(--ink-faint);margin-top:5px;}
.day1-strip{margin-top:auto;padding-top:18px;border-top:1px solid var(--rule);display:flex;align-items:flex-end;justify-content:space-between;gap:14px;}
.day1-strip .d1k{display:block;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--teal-700);}
.day1-strip .d1v{display:block;font-family:var(--display);font-weight:600;font-size:24px;color:var(--navy-800);margin-top:3px;}
.day1-strip .d1days{text-align:right;}
.day1-strip .d1days b{font-family:var(--display);font-weight:600;font-size:28px;color:var(--navy-800);line-height:1;}
.day1-strip .d1days span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:1px;color:var(--ink-faint);margin-top:3px;}
.day1-strip .d1slip{display:block;font-size:10.5px;font-weight:700;margin-top:2px;}
.donut-legend{flex:1;display:flex;flex-direction:column;gap:11px;min-width:0;}
.lg-row{display:flex;align-items:center;gap:11px;font-size:14.5px;}
.lg-dot{width:12px;height:12px;border-radius:3px;flex-shrink:0;}
.lg-label{flex:1;color:var(--navy-800);font-weight:500;}
.lg-val{font-weight:700;color:var(--navy-800);font-variant-numeric:tabular-nums;}
.lg-pct{width:46px;text-align:right;color:var(--ink-faint);font-size:13px;font-variant-numeric:tabular-nums;}
.kpi-col{display:flex;flex-direction:column;gap:16px;}
.kpi{background:#fff;border:1px solid var(--rule);border-radius:16px;padding:20px 24px;box-shadow:0 8px 24px rgba(11,37,69,.06);}
.kpi-l{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--teal-700);margin-bottom:9px;}
.kpi-days{flex:1;display:flex;flex-direction:column;justify-content:center;}
.kpi-days .kpi-n{font-family:var(--display);font-weight:600;font-size:58px;line-height:.95;}
.kpi-sub{font-size:13.5px;color:var(--ink-soft);margin-top:8px;}
.kpi-health .big-rag.light-rag{color:var(--navy-800);font-size:23px;padding:7px 18px;border-color:var(--c);}
.kpi-comp-row{display:flex;align-items:baseline;gap:9px;margin-bottom:11px;}
.kpi-comp-row b{font-family:var(--display);font-weight:600;font-size:32px;color:var(--navy-800);}
.kpi-comp-row span{font-size:13.5px;color:var(--ink-soft);}
.kpi-comp .bar{height:9px;}

/* by-workstream — clickable bars + category drill-down */
.ws-cols{display:grid;grid-template-columns:1.05fr 1fr;gap:40px;width:100%;min-height:0;}
.wbars{display:flex;flex-direction:column;gap:11px;max-height:64vh;overflow-y:auto;padding-right:4px;}
.wbar{display:block;width:100%;text-align:left;font-family:inherit;background:#fff;border:1px solid var(--rule);border-radius:12px;padding:12px 16px;box-shadow:0 6px 18px rgba(11,37,69,.05);flex-shrink:0;cursor:pointer;transition:border-color .2s,box-shadow .2s,transform .15s;}
.wbar:hover{border-color:var(--teal-500);}
.wbar.active{border-color:var(--teal-500);box-shadow:0 0 0 2px rgba(31,198,184,.25),0 8px 20px rgba(11,37,69,.08);}
.wbar-top{display:flex;align-items:center;gap:11px;margin-bottom:8px;}
.wbar-name{flex:1;font-weight:600;font-size:15px;color:var(--navy-800);}
.wbar-pct{font-family:var(--display);font-weight:600;font-size:21px;color:var(--navy-800);}
.wbar-caret{color:var(--ink-faint);font-size:18px;font-weight:700;transition:color .2s,transform .2s;}
.wbar.active .wbar-caret{color:var(--teal-600);transform:translateX(3px);}
.wbar .bar{height:8px;}
.wbar-foot{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);margin-top:8px;}
/* drill-down */
.ws-detail-wrap{min-height:0;display:flex;flex-direction:column;}
.ws-detail{display:none;flex-direction:column;min-height:0;}
.ws-detail.active{display:flex;}
.catcards{display:flex;flex-direction:column;gap:11px;max-height:64vh;overflow-y:auto;padding-right:4px;}
.catcard{background:#fff;border:1px solid var(--rule);border-radius:12px;padding:12px 16px;box-shadow:0 6px 18px rgba(11,37,69,.04);flex-shrink:0;}
.catcard-top{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.catcard-name{flex:1;font-weight:600;font-size:14px;color:var(--navy-800);}
.catcard-pct{font-family:var(--display);font-weight:600;font-size:19px;color:var(--navy-800);}
.catcard .bar{height:7px;}
.catcard-foot{display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-soft);margin-top:8px;}
.att-list{list-style:none;display:flex;flex-direction:column;max-height:62vh;overflow-y:auto;padding-right:4px;}
.att{display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid var(--rule);}
.att .pill{flex-shrink:0;}
.att-name{flex:1;font-size:14px;color:var(--navy-800);font-weight:500;line-height:1.35;}
.att-meta{font-size:12px;color:var(--ink-faint);white-space:nowrap;flex-shrink:0;}
.att-more{padding:12px 0 0;font-size:12.5px;color:var(--teal-700);font-weight:600;}

/* timeline (gantt) */
.gantt-legend{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:14px;font-size:12px;color:var(--ink-soft);}
.gl-item{display:inline-flex;align-items:center;gap:6px;}
.gl-sw{width:12px;height:12px;border-radius:3px;}
.gl-sep{width:1px;height:14px;background:var(--rule);}
.gl-mark{width:14px;height:0;border-top:2px solid;display:inline-block;}
.gl-today{border-top-style:dashed;border-top-color:#EF4444;}
.gl-day1{border-top-style:dotted;border-top-color:#94A3B8;}
.gl-forecast{border-top-color:#1E3A5F;}
.gl-hatch{width:16px;height:11px;border-radius:2px;background:repeating-linear-gradient(45deg,rgba(239,68,68,.5) 0,rgba(239,68,68,.5) 1.5px,rgba(239,68,68,.1) 1.5px,rgba(239,68,68,.1) 6px);}
.gantt-scroll{overflow:auto;max-height:64vh;border:1px solid var(--rule);border-radius:12px;background:#fff;}
.gantt-canvas{position:relative;min-width:100%;}
.gantt-grid{position:absolute;top:0;bottom:0;z-index:1;pointer-events:none;}
.gantt-marks{position:absolute;top:0;bottom:0;z-index:5;pointer-events:none;}
.gmonth{position:absolute;top:0;bottom:0;width:1px;background:#CBD5E1;}
.gmlabel{position:absolute;top:9px;left:4px;font-size:11px;font-weight:600;color:#64748B;white-space:nowrap;}
.gmark{position:absolute;top:0;bottom:0;}
.gmark-today{border-left:1.5px dashed #EF4444;}
.gmark-day1{border-left:1.5px dotted #94A3B8;}
.gmark-forecast{border-left:2px solid #1E3A5F;}
.gmark span{position:absolute;top:20px;left:4px;font-size:10px;font-weight:700;white-space:nowrap;}
.gmark-today span{color:#EF4444;}
.gmark-day1 span{color:#94A3B8;top:34px;}
.gmark-forecast span{color:#1E3A5F;}
.gantt-header{height:34px;}
.grow{display:flex;align-items:center;height:30px;border-bottom:1px solid #F1F5F9;}
.grow-cat{background:#F8FAFC;cursor:pointer;}
.grow-cat:hover{background:#EEF2F6;}
.glabel{flex:0 0 250px;width:250px;padding:0 12px;font-size:12px;color:#475569;display:flex;align-items:center;gap:7px;overflow:hidden;}
.grow-cat .glabel{font-weight:700;color:#334155;}
.gcaret{color:#94A3B8;font-size:9px;transition:transform .2s;flex-shrink:0;}
.gcat-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gcat-count{font-size:11px;font-weight:600;color:#94A3B8;}
.glabel-item{padding-left:30px;color:#64748B;white-space:nowrap;text-overflow:ellipsis;}
.gtrack{position:relative;height:30px;z-index:2;flex:0 0 auto;}
.gbar{position:absolute;top:6px;height:18px;border-radius:3px;overflow:hidden;}
.gfill{position:absolute;left:0;top:0;height:100%;border-radius:3px;}
.gbar-over{background:repeating-linear-gradient(45deg,rgba(239,68,68,.5) 0,rgba(239,68,68,.5) 1.5px,rgba(239,68,68,.1) 1.5px,rgba(239,68,68,.1) 8px);}
.gbar-txt{position:absolute;left:6px;top:2px;font-size:10px;font-weight:600;color:#fff;white-space:nowrap;z-index:1;text-shadow:0 1px 1px rgba(0,0,0,.22);}
.gitems{display:none;}
.gcat.open .gitems{display:block;}
.gcat.open .gcaret{transform:rotate(90deg);}

/* controls */
#progressbar{position:absolute;left:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--teal-600),var(--teal-400));z-index:31;transition:width .5s var(--ease);box-shadow:0 0 10px rgba(31,198,184,.6);}
#controls{position:absolute;left:0;right:0;bottom:0;height:60px;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:0 64px;pointer-events:none;}
#controls .seg{display:flex;align-items:center;gap:16px;pointer-events:auto;}
.nav-btn{width:40px;height:40px;border-radius:50%;border:1px solid rgba(11,37,69,.2);background:rgba(11,37,69,.03);color:var(--navy-800);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .3s var(--ease);}
.nav-btn:hover:not(:disabled){border-color:var(--teal-600);background:rgba(31,198,184,.12);}
.nav-btn:disabled{opacity:.3;cursor:default;}
.nav-btn svg{width:15px;height:15px;}
.theme-light .nav-btn{border-color:rgba(11,37,69,.2);color:var(--navy-800);}
.print-btn{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.4px;color:var(--navy-800);background:rgba(11,37,69,.04);border:1px solid rgba(11,37,69,.18);border-radius:999px;padding:8px 16px;cursor:pointer;transition:all .3s;}
.print-btn:hover{border-color:var(--teal-600);background:rgba(31,198,184,.12);}
.counter{font-size:12px;letter-spacing:1px;color:var(--navy-800);font-variant-numeric:tabular-nums;pointer-events:auto;}
.counter b{font-family:var(--display);font-size:18px;}.counter .now{color:var(--teal-700);}.counter .sep{opacity:.4;margin:0 6px;}
.slide-name{font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--ink-faint);pointer-events:auto;}
/* dark-slide control colors */
.theme-dark .counter,.theme-dark .slide-name{color:rgba(255,255,255,.7);}
.theme-dark .counter .now{color:var(--teal-400);}
.theme-dark .nav-btn,.theme-dark .print-btn{border-color:rgba(255,255,255,.25);color:#fff;background:rgba(255,255,255,.05);}
.hint{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);font-size:9.5px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink-faint);z-index:30;pointer-events:none;transition:opacity .5s;}

/* intro */
#intro{position:fixed;inset:0;z-index:100;background:var(--navy-950);display:flex;align-items:center;justify-content:center;flex-direction:column;transition:opacity .8s var(--ease),visibility .8s;}
#intro.gone{opacity:0;visibility:hidden;}
.intro-word{font-family:var(--display);font-weight:600;font-size:60px;letter-spacing:3px;color:#fff;}
.intro-logo{width:156px;height:auto;}
#intro .il{margin-top:14px;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:var(--teal-500);}

@media (max-width:1080px){
  :root{--rail-w:0px;--head-w:94%;}
  #rail{display:none;}
  .slide-inner{padding:40px 36px 84px;}
  .glance-cols,.risk-cols,.dd-body{grid-template-columns:1fr;}
  .metric-strip{grid-template-columns:repeat(3,1fr);}
  .wgrid{grid-template-columns:1fr;}
}

/* ===== PRINT → multi-page PDF ===== */
@media print{
  @page{size:A4 landscape;margin:10mm;}
  html,body{background:#fff !important;height:auto !important;overflow:visible !important;}
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  #rail,#controls,#progressbar,.hint,#intro{display:none !important;}
  #app{position:static !important;display:block !important;}
  #stage{position:static !important;overflow:visible !important;}
  .slide{position:static !important;opacity:1 !important;visibility:visible !important;display:block !important;transform:none !important;page-break-after:always;break-after:page;min-height:0 !important;}
  .slide:last-child{page-break-after:auto;}
  .slide-inner{padding:14mm 12mm !important;display:block !important;min-height:0 !important;}
  .slide.cover .slide-inner{min-height:170mm;}
  [data-r]{opacity:1 !important;transform:none !important;}
  .task-list,.att-list,.wbars,.catcards,.gantt-scroll{max-height:none !important;overflow:visible !important;}
  .task-notes{display:block !important;}
  .task,.wcard,.risk,.metric,.wbar,.kpi,.donut-card,.att-card,.att,.catcard,.grow,.gbar,.gcat{break-inside:avoid;}
  .gitems{display:block !important;}
  .gcat .gcaret{transform:rotate(90deg) !important;}
  .foot{position:static !important;margin-top:22px;}
  .dd-body,.glance-overview,.ws-cols{display:grid !important;}
}
</style>
</head>
<body>
<div id="intro"><img class="intro-logo" src="${CVA_LOGO_DATA_URI}" alt="CVA" /><div class="il">${esc(p.summary.project.title)}</div></div>
<div id="app">
  <aside id="rail">
    <div class="rail-logo"><img class="rl-logo-img" src="${CVA_LOGO_DATA_URI}" alt="CVA" /><div class="tag">Executive Report<span>${esc(p.weekLabel || "Status update")}</span></div></div>
    <nav id="railnav"><div class="rail-line"></div><div class="rail-fill" id="railfill"></div></nav>
    <div class="rail-foot">Private &amp; Confidential</div>
  </aside>
  <main id="stage">
    ${slides}
    <div id="progressbar"></div>
    <div id="controls">
      <div class="seg">
        <div class="counter"><b class="now">01</b><span class="sep">/</span><b class="tot">01</b></div>
        <span class="slide-name" id="slidename">Cover</span>
      </div>
      <div class="seg">
        <button class="print-btn" id="exportBtn">⬇ Export</button>
        <button class="nav-btn" id="prevBtn" aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button class="nav-btn" id="nextBtn" aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
    </div>
    <div class="hint" id="hint">Use ← → or space · click a task to expand · Export to save</div>
  </main>
</div>
<script>(function(){
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var total = slides.length, cur = 0, animating = false;
  var railnav = document.getElementById('railnav'), railfill = document.getElementById('railfill');
  var prevBtn = document.getElementById('prevBtn'), nextBtn = document.getElementById('nextBtn');
  var nowEl = document.querySelector('.counter .now'), totEl = document.querySelector('.counter .tot');
  var nameEl = document.getElementById('slidename'), progressbar = document.getElementById('progressbar');
  var app = document.getElementById('app'), stage = document.getElementById('stage'), hint = document.getElementById('hint');
  totEl.textContent = String(total).padStart(2,'0');
  var items = [];
  slides.forEach(function(s,i){
    var b = document.createElement('button');
    b.className = 'rail-item';
    b.innerHTML = '<span class="rail-num">'+String(i+1).padStart(2,'0')+'</span><span class="rail-dot"></span><span class="rail-lbl">'+(s.dataset.name||'')+'</span>';
    b.addEventListener('click', function(){ go(i); });
    railnav.appendChild(b); items.push(b);
  });
  function applyTheme(t){ app.classList.remove('theme-light','theme-dark'); app.classList.add(t==='dark'?'theme-dark':'theme-light'); }
  function render(){
    slides.forEach(function(s,i){ s.classList.remove('active','prev'); if(i===cur) s.classList.add('active'); else if(i<cur) s.classList.add('prev'); });
    items.forEach(function(b,i){ b.classList.toggle('active', i===cur); b.classList.toggle('done', i<cur); });
    progressbar.style.width = ((cur+1)/total*100)+'%';
    nowEl.textContent = String(cur+1).padStart(2,'0');
    nameEl.textContent = slides[cur].dataset.name || '';
    prevBtn.disabled = cur===0; nextBtn.disabled = cur===total-1;
    applyTheme(slides[cur].dataset.theme);
    if(cur>0 && hint) hint.style.opacity='0';
  }
  function updateRailFill(){
    if(!items.length) return;
    var navRect = railnav.getBoundingClientRect(), dot = items[cur].querySelector('.rail-dot'), dRect = dot.getBoundingClientRect();
    railfill.style.height = Math.max(0,(dRect.top + dRect.height/2) - navRect.top - 14 + railnav.scrollTop)+'px';
  }
  function go(i){ if(i<0||i>=total||i===cur||animating) return; animating=true; cur=i; render(); setTimeout(updateRailFill,30); items[cur].scrollIntoView({block:'nearest'}); setTimeout(function(){animating=false;},420); }
  function next(){ go(cur+1); } function prev(){ go(cur-1); }
  nextBtn.addEventListener('click', next); prevBtn.addEventListener('click', prev);
  document.getElementById('exportBtn').addEventListener('click', function(){
    var a = document.createElement('a');
    a.href = '/api/reports/html?download=1';
    a.setAttribute('download', '');
    document.body.appendChild(a); a.click(); a.remove();
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){ e.preventDefault(); next(); }
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); prev(); }
    else if(e.key==='Home'){ e.preventDefault(); go(0); } else if(e.key==='End'){ e.preventDefault(); go(total-1); }
  });
  // Mouse wheel does NOT change slides — it scrolls content within a slide
  // (tables, task lists, the gantt). Navigation is buttons + keyboard arrows only.
  // expand/collapse tasks, gantt categories, and workstream drill-down
  stage.addEventListener('click', function(e){
    if(!e.target.closest) return;
    var t = e.target.closest('.task.has-note');
    if(t){ t.classList.toggle('open'); return; }
    var g = e.target.closest('.grow-cat');
    if(g){ var gc = g.closest('.gcat'); if(gc) gc.classList.toggle('open'); return; }
    var wb = e.target.closest('.wbar');
    if(wb){
      var idx = wb.getAttribute('data-ws');
      var slide = wb.closest('.slide');
      slide.querySelectorAll('.wbar').forEach(function(b){ b.classList.toggle('active', b===wb); });
      slide.querySelectorAll('.ws-detail').forEach(function(d){ d.classList.toggle('active', d.getAttribute('data-ws')===idx); });
    }
  });
  window.addEventListener('resize', updateRailFill);
  window.addEventListener('load', function(){ setTimeout(function(){ var i=document.getElementById('intro'); if(i) i.classList.add('gone'); }, 1200); });
  render(); setTimeout(updateRailFill,120);
})();</script>
</body>
</html>`;
}

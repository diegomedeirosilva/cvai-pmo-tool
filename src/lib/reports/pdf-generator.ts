import type { DashboardSummary, Risk, ActionItem, WorkstreamHealth, OwnerStats } from "@/types";

interface ReportData {
  summary: Omit<DashboardSummary, "aiSummary">;
  risks: Risk[];
  items: ActionItem[];
  ownerStats: OwnerStats[];
}

type RGB = [number, number, number];

const NAVY: RGB = [30, 58, 95];   // #1E3A5F
const WHITE: RGB = [255, 255, 255];
const GRAY: RGB = [100, 116, 139];
const LIGHT_GRAY: RGB = [241, 245, 249];
const GREEN: RGB = [34, 197, 94];
const AMBER: RGB = [245, 158, 11];
const RED: RGB = [239, 68, 68];
const BLUE: RGB = [59, 130, 246];

function healthColor(h: string): RGB {
  if (h === "Green") return GREEN;
  if (h === "Amber") return AMBER;
  return RED;
}

function fmtDate(s: string): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtPct(v: number): string {
  return Math.round(v * 100) + "%";
}

export async function generatePDF(data: ReportData): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 15; // margin
  const CW = W - 2 * M; // content width

  // ─── Helper functions ───
  function drawHeader(title: string) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 28, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title, M, 18);

    // Right-side date
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), W - M, 18, { align: "right" });
  }

  function drawFooter(pageNum: number, totalPages: number) {
    doc.setFillColor(...NAVY);
    doc.rect(0, H - 10, W, 10, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.text(data.summary.project.title, M, H - 4);
    doc.text(`Page ${pageNum} of ${totalPages}`, W - M, H - 4, { align: "right" });
  }

  function drawSectionTitle(title: string, y: number): number {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(title, M, y);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.5);
    doc.line(M, y + 1.5, M + CW, y + 1.5);
    return y + 7;
  }

  function tableRow(y: number, cols: { text: string; x: number; w: number; align?: "left" | "center" | "right" }[], isHeader: boolean, bgColor?: readonly [number, number, number]) {
    const rowH = 7;
    if (bgColor) {
      doc.setFillColor(...bgColor);
      doc.rect(M, y - 4.5, CW, rowH, "F");
    }
    cols.forEach(({ text, x, w, align }) => {
      doc.setFontSize(isHeader ? 7 : 8);
      doc.setFont("helvetica", isHeader ? "bold" : "normal");
      doc.setTextColor(isHeader ? 255 : 51, isHeader ? 255 : 65, isHeader ? 255 : 85);
      const truncated = text.length > Math.floor(w / 1.8) ? text.slice(0, Math.floor(w / 1.8)) + "…" : text;
      doc.text(truncated, x + (align === "center" ? w / 2 : align === "right" ? w - 1 : 1), y, {
        align: align || "left",
      });
    });
    return y + rowH;
  }

  const totalPages = 5;

  // ─── PAGE 1: Cover ───
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, H, "F");

  // Project title
  doc.setTextColor(...WHITE);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(data.summary.project.title, W / 2, 100, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Executive Status Report", W / 2, 115, { align: "center" });

  // Key info
  doc.setTextColor(200, 210, 220);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Day-1 Target: ${fmtDate(data.summary.project.day1TargetDate)}`, W / 2, 175, { align: "center" });
  doc.text(`${data.summary.daysToDay1} days remaining`, W / 2, 183, { align: "center" });

  // Date
  doc.setTextColor(150, 160, 180);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, W / 2, 220, { align: "center" });

  drawFooter(1, totalPages);

  // ─── PAGE 2: Executive Summary ───
  doc.addPage();
  drawHeader("Executive Summary");
  let y = 38;

  // KPI boxes
  const kpis = [
    { label: "Total Items", value: String(data.summary.totalItems), color: NAVY },
    { label: "Not Started", value: String(data.summary.notStarted), color: GRAY },
    { label: "Completed", value: String(data.summary.completed), color: GREEN },
    { label: "On Track", value: String(data.summary.onTrack), color: BLUE },
    { label: "At-risk", value: String(data.summary.atRisk), color: AMBER },
    { label: "Overdue", value: String(data.summary.overdue), color: RED },
  ];
  const boxW = (CW - 5 * 4) / 6;

  kpis.forEach((kpi, i) => {
    const bx = M + i * (boxW + 4);
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(bx, y, boxW, 22, 2, 2, "F");
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...kpi.color);
    doc.text(kpi.value, bx + boxW / 2, y + 12, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(kpi.label, bx + boxW / 2, y + 19, { align: "center" });
  });
  y += 32;

  // Status breakdown
  y = drawSectionTitle("Status Breakdown", y);
  const statusItems = [
    { label: "Not Started", count: data.summary.notStarted, pct: data.summary.totalItems > 0 ? data.summary.notStarted / data.summary.totalItems : 0, color: GRAY },
    { label: "Completed", count: data.summary.completed, pct: data.summary.totalItems > 0 ? data.summary.completed / data.summary.totalItems : 0, color: GREEN },
    { label: "On Track", count: data.summary.onTrack, pct: data.summary.totalItems > 0 ? data.summary.onTrack / data.summary.totalItems : 0, color: BLUE },
    { label: "At-risk", count: data.summary.atRisk, pct: data.summary.totalItems > 0 ? data.summary.atRisk / data.summary.totalItems : 0, color: AMBER },
    { label: "Overdue", count: data.summary.overdue, pct: data.summary.totalItems > 0 ? data.summary.overdue / data.summary.totalItems : 0, color: RED },
  ];
  statusItems.forEach((si) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(`${si.label} (${si.count})`, M, y);
    doc.text(fmtPct(si.pct), M + 50, y);

    // Progress bar
    const barX = M + 58;
    const barW = CW - 58;
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(barX, y - 3, barW, 4, 1, 1, "F");
    if (si.pct > 0) {
      doc.setFillColor(...si.color);
      doc.roundedRect(barX, y - 3, barW * si.pct, 4, 1, 1, "F");
    }
    y += 9;
  });

  y += 5;

  // Countdown & Health
  y = drawSectionTitle("Project Timeline", y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(`Day-1 Target Date: ${fmtDate(data.summary.project.day1TargetDate)}`, M, y);
  y += 6;
  doc.text(`Days Remaining: ${data.summary.daysToDay1}`, M, y);

  drawFooter(2, totalPages);

  // ─── PAGE 3: Workstream Health ───
  doc.addPage();
  drawHeader("Workstream Health");
  y = 38;

  y = drawSectionTitle("Workstream Performance", y);

  const wsCols = [
    { text: "Workstream", x: M, w: 50 },
    { text: "Health", x: M + 50, w: 14, align: "center" as const },
    { text: "Total", x: M + 64, w: 14, align: "center" as const },
    { text: "Closed", x: M + 78, w: 14, align: "center" as const },
    { text: "On Track", x: M + 92, w: 18, align: "center" as const },
    { text: "At-risk", x: M + 110, w: 16, align: "center" as const },
    { text: "Overdue", x: M + 126, w: 16, align: "center" as const },
    { text: "Completion", x: M + 142, w: 28, align: "center" as const },
  ];

  // Header
  y = tableRow(y, wsCols, true, NAVY);

  // Data
  const wsData = data.summary.workstreamHealth.sort((a, b) => b.total - a.total);
  wsData.forEach((ws, i) => {
    const bg = i % 2 === 0 ? undefined : LIGHT_GRAY;
    const cols = [
      { text: ws.workstream, x: M, w: 50 },
      { text: ws.health, x: M + 50, w: 14, align: "center" as const },
      { text: String(ws.total), x: M + 64, w: 14, align: "center" as const },
      { text: String(ws.completed), x: M + 78, w: 14, align: "center" as const },
      { text: String(ws.onTrack), x: M + 92, w: 18, align: "center" as const },
      { text: String(ws.atRisk), x: M + 110, w: 16, align: "center" as const },
      { text: String(ws.overdue), x: M + 126, w: 16, align: "center" as const },
      { text: fmtPct(ws.completionPct), x: M + 142, w: 28, align: "center" as const },
    ];
    y = tableRow(y, cols, false, bg);

    if (y > H - 30) {
      drawFooter(3, totalPages);
      doc.addPage();
      drawHeader("Workstream Health (cont.)");
      y = 38;
    }
  });

  drawFooter(3, totalPages);

  // ─── PAGE 4: Risk Register ───
  doc.addPage();
  drawHeader("Risk Register");
  y = 38;

  y = drawSectionTitle("Top Risks", y);

  const topRisks = data.risks
    .filter((r) => r.riskStatus === "Open")
    .sort((a, b) => {
      const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity] ?? 99) - (order[b.severity] ?? 99);
    })
    .slice(0, 15);

  if (topRisks.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    doc.text("No open risks detected.", M, y);
  } else {
    const riskCols = [
      { text: "Severity", x: M, w: 18 },
      { text: "Type", x: M + 18, w: 28 },
      { text: "Workstream", x: M + 46, w: 35 },
      { text: "Description", x: M + 81, w: 70 },
      { text: "Owner(s)", x: M + 151, w: 29 },
    ];
    y = tableRow(y, riskCols, true, NAVY);

    topRisks.forEach((risk, i) => {
      const bg = i % 2 === 0 ? undefined : LIGHT_GRAY;
      const cols = [
        { text: risk.severity, x: M, w: 18 },
        { text: risk.type, x: M + 18, w: 28 },
        { text: risk.workstream || "—", x: M + 46, w: 35 },
        { text: risk.description, x: M + 81, w: 70 },
        { text: risk.owners.join(", "), x: M + 151, w: 29 },
      ];
      y = tableRow(y, cols, false, bg);

      if (y > H - 30) {
        drawFooter(4, totalPages);
        doc.addPage();
        drawHeader("Risk Register (cont.)");
        y = 38;
      }
    });
  }

  drawFooter(4, totalPages);

  // ─── PAGE 5: Upcoming Milestones ───
  doc.addPage();
  drawHeader("Upcoming Milestones");
  y = 38;

  y = drawSectionTitle("Due in Next 14 Days", y);

  const milestones = data.summary.upcomingMilestones.slice(0, 25);

  if (milestones.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    doc.text("No upcoming milestones in the next 14 days.", M, y);
  } else {
    const msCols = [
      { text: "Due Date", x: M, w: 22 },
      { text: "Workstream", x: M + 22, w: 35 },
      { text: "Requirement", x: M + 57, w: 55 },
      { text: "Owner", x: M + 112, w: 30 },
      { text: "Status", x: M + 142, w: 20 },
      { text: "Progress", x: M + 162, w: 18, align: "center" as const },
    ];
    y = tableRow(y, msCols, true, NAVY);

    milestones.forEach((item, i) => {
      const bg = i % 2 === 0 ? undefined : LIGHT_GRAY;
      const cols = [
        { text: fmtDate(item.endDate), x: M, w: 22 },
        { text: item.workstream, x: M + 22, w: 35 },
        { text: item.requirement || item.action.slice(0, 40), x: M + 57, w: 55 },
        { text: item.owner, x: M + 112, w: 30 },
        { text: item.status, x: M + 142, w: 20 },
        { text: fmtPct(item.actualCompletionPct), x: M + 162, w: 18, align: "center" as const },
      ];
      y = tableRow(y, cols, false, bg);

      if (y > H - 30) {
        drawFooter(5, totalPages);
        doc.addPage();
        drawHeader("Upcoming Milestones (cont.)");
        y = 38;
      }
    });
  }

  drawFooter(5, totalPages);

  return doc.output("blob");
}

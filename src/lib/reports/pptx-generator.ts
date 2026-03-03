import type { DashboardSummary, Risk, ActionItem, WorkstreamHealth, OwnerStats } from "@/types";

interface ReportData {
  summary: Omit<DashboardSummary, "aiSummary">;
  risks: Risk[];
  items: ActionItem[];
  ownerStats: OwnerStats[];
}

const NAVY = "1E3A5F";
const WHITE = "FFFFFF";
const LIGHT_BG = "F1F5F9";
const GREEN_HEX = "22C55E";
const AMBER_HEX = "F59E0B";
const RED_HEX = "EF4444";
const BLUE_HEX = "3B82F6";
const GRAY_HEX = "64748B";

function healthHex(h: string): string {
  if (h === "Green") return GREEN_HEX;
  if (h === "Amber") return AMBER_HEX;
  return RED_HEX;
}

function fmtDate(s: string): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtPct(v: number): string {
  return Math.round(v * 100) + "%";
}

export async function generatePPTX(data: ReportData): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches
  pptx.author = "PMO Dashboard";
  pptx.title = `${data.summary.project.title} — Status Report`;

  // Master slide background
  const masterOpts = {
    background: { color: NAVY },
  };

  // ─── SLIDE 1: Cover ───
  const slide1 = pptx.addSlide();
  slide1.background = { color: NAVY };

  slide1.addText(data.summary.project.title, {
    x: 0.5, y: 1.5, w: 12.33, h: 1.2,
    fontSize: 36, fontFace: "Arial", color: WHITE, bold: true, align: "center",
  });
  slide1.addText("Executive Status Report", {
    x: 0.5, y: 2.7, w: 12.33, h: 0.6,
    fontSize: 18, fontFace: "Arial", color: "CBD5E1", align: "center",
  });

  // Health circle
  const hlabel = data.summary.overallHealth === "Green" ? "ON TRACK" : data.summary.overallHealth === "Amber" ? "AT RISK" : "CRITICAL";
  slide1.addShape(pptx.ShapeType.ellipse, {
    x: 5.67, y: 3.8, w: 2, h: 2,
    fill: { color: healthHex(data.summary.overallHealth) },
  });
  slide1.addText(hlabel, {
    x: 5.67, y: 4.3, w: 2, h: 1,
    fontSize: 12, fontFace: "Arial", color: WHITE, bold: true, align: "center", valign: "middle",
  });

  slide1.addText(`Day-1 Target: ${fmtDate(data.summary.project.day1TargetDate)}    |    ${data.summary.daysToDay1} days remaining`, {
    x: 0.5, y: 6.2, w: 12.33, h: 0.5,
    fontSize: 12, fontFace: "Arial", color: "94A3B8", align: "center",
  });

  slide1.addText(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, {
    x: 0.5, y: 6.8, w: 12.33, h: 0.4,
    fontSize: 9, fontFace: "Arial", color: "64748B", align: "center",
  });

  // ─── SLIDE 2: Key Metrics ───
  const slide2 = pptx.addSlide();
  slide2.background = { color: WHITE };

  // Title bar
  slide2.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.7,
    fill: { color: NAVY },
  });
  slide2.addText("Executive Summary", {
    x: 0.5, y: 0.05, w: 12, h: 0.6,
    fontSize: 18, fontFace: "Arial", color: WHITE, bold: true,
  });

  // KPI boxes
  const kpis = [
    { label: "Total Items", value: String(data.summary.totalItems), color: NAVY },
    { label: "Completed", value: String(data.summary.completed), color: GREEN_HEX },
    { label: "On Track", value: String(data.summary.onTrack), color: BLUE_HEX },
    { label: "Delayed", value: String(data.summary.delayed), color: RED_HEX },
    { label: "Overdue", value: String(data.summary.overdue), color: AMBER_HEX },
  ];

  const kpiW = 2.2;
  const kpiGap = 0.3;
  const kpiStartX = (13.33 - (kpis.length * kpiW + (kpis.length - 1) * kpiGap)) / 2;

  kpis.forEach((kpi, i) => {
    const bx = kpiStartX + i * (kpiW + kpiGap);
    slide2.addShape(pptx.ShapeType.roundRect, {
      x: bx, y: 1.2, w: kpiW, h: 1.3,
      fill: { color: LIGHT_BG }, rectRadius: 0.1,
    });
    slide2.addText(kpi.value, {
      x: bx, y: 1.2, w: kpiW, h: 0.9,
      fontSize: 32, fontFace: "Arial", color: kpi.color, bold: true, align: "center", valign: "middle",
    });
    slide2.addText(kpi.label, {
      x: bx, y: 2.0, w: kpiW, h: 0.5,
      fontSize: 10, fontFace: "Arial", color: GRAY_HEX, align: "center", valign: "top",
    });
  });

  // Status breakdown bars
  const statuses = [
    { label: "Completed", count: data.summary.completed, color: GREEN_HEX },
    { label: "On Track", count: data.summary.onTrack, color: BLUE_HEX },
    { label: "Not Started", count: data.summary.notStarted, color: "94A3B8" },
    { label: "Delayed", count: data.summary.delayed, color: RED_HEX },
    { label: "Overdue", count: data.summary.overdue, color: AMBER_HEX },
  ];

  const barStartY = 3.2;
  const total = data.summary.totalItems || 1;
  statuses.forEach((s, i) => {
    const by = barStartY + i * 0.65;
    const pct = s.count / total;
    slide2.addText(`${s.label} (${s.count})`, {
      x: 1, y: by, w: 2.5, h: 0.4,
      fontSize: 10, fontFace: "Arial", color: "334155", align: "right", valign: "middle",
    });
    // Background bar
    slide2.addShape(pptx.ShapeType.roundRect, {
      x: 3.7, y: by + 0.1, w: 8.5, h: 0.25,
      fill: { color: LIGHT_BG }, rectRadius: 0.05,
    });
    // Fill bar
    if (pct > 0) {
      slide2.addShape(pptx.ShapeType.roundRect, {
        x: 3.7, y: by + 0.1, w: Math.max(8.5 * pct, 0.1), h: 0.25,
        fill: { color: s.color }, rectRadius: 0.05,
      });
    }
    slide2.addText(fmtPct(pct), {
      x: 12.3, y: by, w: 0.8, h: 0.4,
      fontSize: 9, fontFace: "Arial", color: "334155", align: "left", valign: "middle",
    });
  });

  // Timeline info
  slide2.addText([
    { text: `Day-1 Target: ${fmtDate(data.summary.project.day1TargetDate)}`, options: { fontSize: 11, color: "334155" } },
    { text: `   |   ${data.summary.daysToDay1} days remaining`, options: { fontSize: 11, color: NAVY, bold: true } },
    { text: `   |   Overall Health: ${data.summary.overallHealth === "Green" ? "On Track" : data.summary.overallHealth === "Amber" ? "At Risk" : "Critical"}`, options: { fontSize: 11, color: healthHex(data.summary.overallHealth), bold: true } },
  ], {
    x: 1, y: 6.5, w: 11.33, h: 0.5,
    fontFace: "Arial", align: "center",
  });

  // ─── SLIDE 3: Workstream Health ───
  const slide3 = pptx.addSlide();
  slide3.background = { color: WHITE };

  slide3.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.7,
    fill: { color: NAVY },
  });
  slide3.addText("Workstream Health", {
    x: 0.5, y: 0.05, w: 12, h: 0.6,
    fontSize: 18, fontFace: "Arial", color: WHITE, bold: true,
  });

  const wsHeaders = ["Workstream", "Health", "Total", "Done", "On Track", "Delayed", "Overdue", "Completion"];
  const wsColW = [3.5, 1.2, 1.0, 1.0, 1.2, 1.2, 1.2, 1.5];
  const wsStartX = 0.6;

  const wsRows: { text: string; options: { fontSize: number; fontFace: string; color: string; bold?: boolean; align: "left" | "center" | "right"; fill?: { color: string } } }[][] = [];

  // Header row
  wsRows.push(wsHeaders.map((h, i) => ({
    text: h,
    options: {
      fontSize: 9,
      fontFace: "Arial",
      color: WHITE,
      bold: true,
      align: (i === 0 ? "left" : "center") as "left" | "center",
      fill: { color: NAVY },
    },
  })));

  // Data rows
  const wsData = data.summary.workstreamHealth.sort((a, b) => b.total - a.total);
  wsData.forEach((ws, i) => {
    const bgColor = i % 2 === 0 ? WHITE : LIGHT_BG;
    wsRows.push([
      { text: ws.workstream, options: { fontSize: 9, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
      { text: ws.health, options: { fontSize: 9, fontFace: "Arial", color: healthHex(ws.health), bold: true, align: "center", fill: { color: bgColor } } },
      { text: String(ws.total), options: { fontSize: 9, fontFace: "Arial", color: "334155", align: "center", fill: { color: bgColor } } },
      { text: String(ws.completed), options: { fontSize: 9, fontFace: "Arial", color: "334155", align: "center", fill: { color: bgColor } } },
      { text: String(ws.onTrack), options: { fontSize: 9, fontFace: "Arial", color: "334155", align: "center", fill: { color: bgColor } } },
      { text: String(ws.delayed), options: { fontSize: 9, fontFace: "Arial", color: "334155", align: "center", fill: { color: bgColor } } },
      { text: String(ws.overdue), options: { fontSize: 9, fontFace: "Arial", color: "334155", align: "center", fill: { color: bgColor } } },
      { text: fmtPct(ws.completionPct), options: { fontSize: 9, fontFace: "Arial", color: "334155", bold: true, align: "center", fill: { color: bgColor } } },
    ]);
  });

  slide3.addTable(wsRows, {
    x: wsStartX, y: 1.1, w: 12,
    colW: wsColW,
    border: { type: "solid", pt: 0.5, color: "E2E8F0" },
    rowH: 0.4,
  });

  // ─── SLIDE 4: Risk Register ───
  const slide4 = pptx.addSlide();
  slide4.background = { color: WHITE };

  slide4.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.7,
    fill: { color: NAVY },
  });
  slide4.addText("Risk Register — Top Open Risks", {
    x: 0.5, y: 0.05, w: 12, h: 0.6,
    fontSize: 18, fontFace: "Arial", color: WHITE, bold: true,
  });

  const topRisks = data.risks
    .filter((r) => r.riskStatus === "Open")
    .sort((a, b) => {
      const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity] ?? 99) - (order[b.severity] ?? 99);
    })
    .slice(0, 10);

  if (topRisks.length === 0) {
    slide4.addText("No open risks detected.", {
      x: 1, y: 2, w: 11, h: 1,
      fontSize: 14, fontFace: "Arial", color: GRAY_HEX, italic: true, align: "center",
    });
  } else {
    const riskHeaders = ["Severity", "Type", "Workstream", "Description", "Owner(s)"];
    const riskColW = [1.3, 2.0, 2.5, 4.5, 2.0];

    const riskRows: { text: string; options: { fontSize: number; fontFace: string; color: string; bold?: boolean; align: "left" | "center"; fill?: { color: string } } }[][] = [];

    riskRows.push(riskHeaders.map((h) => ({
      text: h,
      options: { fontSize: 9, fontFace: "Arial", color: WHITE, bold: true, align: "left" as const, fill: { color: NAVY } },
    })));

    topRisks.forEach((risk, i) => {
      const bgColor = i % 2 === 0 ? WHITE : LIGHT_BG;
      const sevColor = risk.severity === "Critical" ? RED_HEX : risk.severity === "High" ? RED_HEX : risk.severity === "Medium" ? AMBER_HEX : GRAY_HEX;
      riskRows.push([
        { text: risk.severity, options: { fontSize: 9, fontFace: "Arial", color: sevColor, bold: true, align: "left", fill: { color: bgColor } } },
        { text: risk.type, options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
        { text: risk.workstream || "—", options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
        { text: risk.description.length > 80 ? risk.description.slice(0, 80) + "…" : risk.description, options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
        { text: risk.owners.join(", "), options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
      ]);
    });

    slide4.addTable(riskRows, {
      x: 0.5, y: 1.1, w: 12.3,
      colW: riskColW,
      border: { type: "solid", pt: 0.5, color: "E2E8F0" },
      rowH: 0.45,
    });
  }

  // ─── SLIDE 5: Upcoming Milestones ───
  const slide5 = pptx.addSlide();
  slide5.background = { color: WHITE };

  slide5.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.7,
    fill: { color: NAVY },
  });
  slide5.addText("Upcoming Milestones — Next 14 Days", {
    x: 0.5, y: 0.05, w: 12, h: 0.6,
    fontSize: 18, fontFace: "Arial", color: WHITE, bold: true,
  });

  const milestones = data.summary.upcomingMilestones.slice(0, 15);

  if (milestones.length === 0) {
    slide5.addText("No upcoming milestones in the next 14 days.", {
      x: 1, y: 2, w: 11, h: 1,
      fontSize: 14, fontFace: "Arial", color: GRAY_HEX, italic: true, align: "center",
    });
  } else {
    const msHeaders = ["Due Date", "Workstream", "Requirement", "Owner", "Status", "Progress"];
    const msColW = [1.5, 2.5, 4.0, 2.0, 1.3, 1.0];

    const msRows: { text: string; options: { fontSize: number; fontFace: string; color: string; bold?: boolean; align: "left" | "center"; fill?: { color: string } } }[][] = [];

    msRows.push(msHeaders.map((h, i) => ({
      text: h,
      options: { fontSize: 9, fontFace: "Arial", color: WHITE, bold: true, align: (i >= 4 ? "center" : "left") as "left" | "center", fill: { color: NAVY } },
    })));

    milestones.forEach((item, i) => {
      const bgColor = i % 2 === 0 ? WHITE : LIGHT_BG;
      msRows.push([
        { text: fmtDate(item.endDate), options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
        { text: item.workstream, options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
        { text: (item.requirement || item.action).slice(0, 60), options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
        { text: item.owner, options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "left", fill: { color: bgColor } } },
        { text: item.status, options: { fontSize: 8, fontFace: "Arial", color: "334155", align: "center", fill: { color: bgColor } } },
        { text: fmtPct(item.actualCompletionPct), options: { fontSize: 8, fontFace: "Arial", color: "334155", bold: true, align: "center", fill: { color: bgColor } } },
      ]);
    });

    slide5.addTable(msRows, {
      x: 0.5, y: 1.1, w: 12.3,
      colW: msColW,
      border: { type: "solid", pt: 0.5, color: "E2E8F0" },
      rowH: 0.4,
    });
  }

  const output = await pptx.write({ outputType: "blob" });
  return output as Blob;
}

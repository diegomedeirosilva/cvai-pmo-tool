import ExcelJS from "exceljs";
import { ActionItem, Dependency, Project } from "@/types";
import { computeStatus, timeBasedTarget } from "@/lib/dashboard";

const STATUS_VALUES = ["Not Started", "Completed", "On-track", "At-risk", "Overdue"];
const STATUS_COLORS: Record<string, string> = {
  "Not Started": "FF94A3B8",
  "Completed": "FF22C55E",
  "On-track": "FF3B82F6",
  "At-risk": "FFF59E0B",
  "Overdue": "FFEF4444",
};

export async function exportRoundTrip(
  project: Project,
  items: ActionItem[],
  deps: Dependency[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // === COVER SHEET ===
  const cover = workbook.addWorksheet("Cover");
  cover.getCell("C7").value = "Title";
  cover.getCell("D7").value = project.title;
  cover.getCell("C9").value = "Description";
  cover.getCell("D9").value = project.description;
  cover.getCell("C11").value = "Date";
  cover.getCell("D11").value = { formula: "TODAY()" } as ExcelJS.CellFormulaValue;

  // === JV READINESS PLAN SHEET ===
  const sheet = workbook.addWorksheet("JV Readiness Plan");

  // Row 1: Title + Day-1 date
  sheet.getCell("A1").value = project.title;
  sheet.getCell("I1").value = new Date(project.day1TargetDate);
  sheet.getCell("I1").numFmt = "yyyy-mm-dd";

  // Row 2: Empty

  // Row 3: Headers
  const headers = [
    "Workstream", "Category", "Requirement", "Action", "Owner",
    "Status", "Start date", "Duration", "End date", "Target Completion (%)", "Notes", "Actual Completion (%)",
  ];
  headers.forEach((h, i) => {
    const cell = sheet.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  // Build predecessor map: successorId → predecessorId
  const predMap = new Map<string, string>();
  for (const dep of deps) {
    predMap.set(dep.successorId, dep.predecessorId);
  }

  // Map itemId → Excel row number (row 4+)
  const itemToRow = new Map<string, number>();

  // Group items by workstream → category → items
  const workstreamOrder = Array.from(new Set(items.map((i) => i.workstream)));
  const grouped = new Map<string, Map<string, ActionItem[]>>();
  for (const ws of workstreamOrder) {
    grouped.set(ws, new Map());
  }
  for (const item of items) {
    if (!grouped.has(item.workstream)) grouped.set(item.workstream, new Map());
    const wsMap = grouped.get(item.workstream)!;
    if (!wsMap.has(item.category)) wsMap.set(item.category, []);
    wsMap.get(item.category)!.push(item);
  }

  let currentRow = 4;

  for (const [ws, catMap] of grouped) {
    for (const [cat, catItems] of catMap) {
      // Category header row
      const firstItemRow = currentRow + 1;
      const lastItemRow = currentRow + catItems.length;

      const headerRow = sheet.getRow(currentRow);
      headerRow.getCell(2).value = cat;
      headerRow.getCell(7).value = { formula: `MIN(G${firstItemRow}:G${lastItemRow})` } as ExcelJS.CellFormulaValue;
      headerRow.getCell(8).value = { formula: `I${currentRow}-G${currentRow}` } as ExcelJS.CellFormulaValue;
      headerRow.getCell(9).value = { formula: `MAX(I${firstItemRow}:I${lastItemRow})` } as ExcelJS.CellFormulaValue;
      headerRow.getCell(7).numFmt = "yyyy-mm-dd";
      headerRow.getCell(9).numFmt = "yyyy-mm-dd";
      headerRow.font = { bold: true, italic: true };
      headerRow.getCell(2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      currentRow++;

      // Action item rows
      for (const item of catItems) {
        itemToRow.set(item.id, currentRow);
        currentRow++;
      }

      // Now write item data
      let rowIdx = currentRow - catItems.length;
      for (const item of catItems) {
        const row = sheet.getRow(rowIdx);
        const status = computeStatus(item);
        row.getCell(1).value = item.workstream;
        row.getCell(2).value = item.category;
        row.getCell(3).value = item.requirement;
        row.getCell(4).value = item.action;
        row.getCell(5).value = item.owner;
        row.getCell(6).value = status;

        // G: Start date — use formula if there's a predecessor
        const predId = predMap.get(item.id);
        if (predId) {
          const predRow = itemToRow.get(predId);
          if (predRow) {
            row.getCell(7).value = { formula: `I${predRow}` } as ExcelJS.CellFormulaValue;
          } else {
            row.getCell(7).value = new Date(item.startDate);
          }
        } else {
          row.getCell(7).value = new Date(item.startDate);
        }
        row.getCell(7).numFmt = "yyyy-mm-dd";

        row.getCell(8).value = item.duration;
        row.getCell(9).value = { formula: `G${rowIdx}+H${rowIdx}` } as ExcelJS.CellFormulaValue;
        row.getCell(9).numFmt = "yyyy-mm-dd";

        row.getCell(10).value = {
          formula: `IFERROR(MAX(0,MIN(1,(TODAY()-G${rowIdx})/(I${rowIdx}-G${rowIdx}))),"")`,
        } as ExcelJS.CellFormulaValue;
        row.getCell(10).numFmt = "0%";

        row.getCell(11).value = item.notes;

        row.getCell(12).value = item.actualCompletionPct;
        row.getCell(12).numFmt = "0%";

        // Status cell color
        const statusColor = STATUS_COLORS[status];
        if (statusColor) {
          row.getCell(6).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: statusColor },
          };
        }

        rowIdx++;
      }
    }
  }

  // Data validation for Status column
  for (let r = 4; r < currentRow; r++) {
    const cell = sheet.getCell(`F${r}`);
    if (cell.value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cell as any).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Completed,On-track,At-risk,Overdue"'],
      };
    }
  }

  // Column widths
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 25;
  sheet.getColumn(4).width = 50;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(6).width = 13;
  sheet.getColumn(7).width = 12;
  sheet.getColumn(8).width = 10;
  sheet.getColumn(9).width = 12;
  sheet.getColumn(10).width = 20;
  sheet.getColumn(11).width = 40;
  sheet.getColumn(12).width = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportAnalytics(
  project: Project,
  items: ActionItem[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // === Sheet 1: Raw Data ===
  const rawSheet = workbook.addWorksheet("Raw Data");
  const rawHeaders = [
    "ID", "Workstream", "Category", "Requirement", "Action", "Owner",
    "Status", "Start Date", "Duration", "End Date", "Target %", "Actual %", "Notes",
    "Created At",
  ];
  rawSheet.addRow(rawHeaders).font = { bold: true };
  for (const item of items) {
    const status = computeStatus(item);
    rawSheet.addRow([
      item.id, item.workstream, item.category, item.requirement, item.action,
      item.owner, status, item.startDate, item.duration, item.endDate,
      Math.round(timeBasedTarget(item) * 100) + "%",
      Math.round(item.actualCompletionPct * 100) + "%", item.notes,
      item.createdAt,
    ]);
  }

  // === Sheet 2: Summary by Workstream ===
  const wsSheet = workbook.addWorksheet("By Workstream");
  wsSheet.addRow(["Workstream", "Total", "Completed", "On-track", "At-risk", "Overdue", "Completion %"]).font = { bold: true };
  const wsMap = new Map<string, Record<string, number>>();
  for (const item of items) {
    if (!wsMap.has(item.workstream)) {
      wsMap.set(item.workstream, { total: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0 });
    }
    const w = wsMap.get(item.workstream)!;
    w.total++;
    const status = computeStatus(item);
    if (status === "Completed") w.completed++;
    else if (status === "On-track") w.onTrack++;
    else if (status === "At-risk") w.atRisk++;
    else if (status === "Overdue") w.overdue++;
  }
  for (const [ws, c] of wsMap) {
    wsSheet.addRow([ws, c.total, c.completed, c.onTrack, c.atRisk, c.overdue,
      c.total > 0 ? Math.round((c.completed / c.total) * 100) + "%" : "0%"]);
  }

  // === Sheet 3: Summary by Owner ===
  const ownerSheet = workbook.addWorksheet("By Owner");
  ownerSheet.addRow(["Owner", "Total", "Completed", "On-track", "At-risk", "Overdue"]).font = { bold: true };
  const ownerMap = new Map<string, Record<string, number>>();
  for (const item of items) {
    const owners = item.owner.includes("/")
      ? item.owner.split("/").map((o) => o.trim())
      : [item.owner];
    for (const owner of owners) {
      if (!ownerMap.has(owner)) {
        ownerMap.set(owner, { total: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0 });
      }
      const o = ownerMap.get(owner)!;
      o.total++;
      const status = computeStatus(item);
      if (status === "Completed") o.completed++;
      else if (status === "On-track") o.onTrack++;
      else if (status === "At-risk") o.atRisk++;
      else if (status === "Overdue") o.overdue++;
    }
  }
  for (const [owner, c] of ownerMap) {
    ownerSheet.addRow([owner, c.total, c.completed, c.onTrack, c.atRisk, c.overdue]);
  }

  // === Sheet 4: Timeline (sorted by end date) ===
  const timelineSheet = workbook.addWorksheet("Timeline");
  timelineSheet.addRow([
    "Workstream", "Category", "Requirement", "Owner", "Status",
    "Start Date", "End Date", "Duration", "Target %", "Actual %", "Notes"
  ]).font = { bold: true };
  const sorted = [...items].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  for (const item of sorted) {
    const status = computeStatus(item);
    timelineSheet.addRow([
      item.workstream, item.category, item.requirement, item.owner, status,
      item.startDate, item.endDate, item.duration,
      Math.round(timeBasedTarget(item) * 100) + "%",
      Math.round(item.actualCompletionPct * 100) + "%", item.notes,
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

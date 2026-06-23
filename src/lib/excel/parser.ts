import ExcelJS from "exceljs";
import { ActionItem, CategorySummary, Dependency, Project } from "@/types";
import { computeStatus } from "@/lib/dashboard";

interface ParsedWorkbook {
  project: Omit<Project, "id" | "createdAt" | "updatedAt">;
  actionItems: Omit<ActionItem, "id" | "createdAt" | "updatedAt">[];
  categorySummaries: Omit<CategorySummary, "id">[];
  dependencies: { predecessorIndex: number; successorIndex: number }[];
}

function toDateString(val: unknown): string {
  if (!val) return new Date().toISOString().split("T")[0];
  if (val instanceof Date) return val.toISOString().split("T")[0];
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  if (typeof val === "number") {
    // Excel serial date
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  return new Date().toISOString().split("T")[0];
}

function getCellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  // Formula cell
  if (typeof v === "object" && "result" in v) {
    return (v as ExcelJS.CellFormulaValue).result;
  }
  // Rich text
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText
      .map((r) => r.text)
      .join("");
  }
  return v;
}

function getCellFormula(cell: ExcelJS.Cell): string | null {
  // Try direct shortcut first (ExcelJS property)
  if (cell.formula) return cell.formula;
  // Fall back to value object inspection
  const v = cell.value;
  if (!v || typeof v !== "object") return null;
  if ("formula" in v) return (v as ExcelJS.CellFormulaValue).formula;
  if ("sharedFormula" in v)
    return (v as ExcelJS.CellSharedFormulaValue).sharedFormula;
  return null;
}

function cleanText(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// parseStatus removed — status is now computed from dates and completion %

// Parse the predecessor row from a start-date formula that references the end-date column:
// "K5", "=K5", "$K$5", "'Sheet'!K5", and offset forms like "K77-7" (start = predecessor end ± n days).
// The reference may appear anywhere in the formula; the FIRST end-date-column reference defines the
// predecessor link (the arithmetic offset only shifts the date, not the dependency).
// ExcelJS returns formula strings WITHOUT the leading "=", so we handle both forms.
// The end-date column letter is dynamic — it shifted from I (v6/v8) to K (v10).
function parseDependencyRef(formula: string | null, endDateColLetter: string): number | null {
  if (!formula) return null;
  let f = formula.trim().replace(/^=/, "");
  // Strip any sheet-qualifier prefixes like 'JV Readiness Plan'! or Sheet1! so they can't be misread
  f = f.replace(/(?:'[^']+'|[A-Za-z0-9_]+)!/g, "");
  // First reference to the end-date column: optional $ anchors, must not be part of a longer column
  // name (e.g. column "AK" must not match "K"). Matches K5, $K$5, and the row in K77-7.
  const ref = new RegExp(`(?:^|[^A-Za-z0-9_])\\$?${endDateColLetter}\\$?(\\d+)`, "i");
  const match = f.match(ref);
  if (match) return parseInt(match[1], 10);
  return null;
}

export async function parseExcelWorkplan(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  // Parse Cover sheet for project metadata
  const coverSheet = workbook.getWorksheet("Cover");
  let projectTitle = "JV Day 1 Readiness Plan";
  let projectDescription = "";
  let day1TargetDate = "2026-08-14";

  if (coverSheet) {
    const d7 = getCellValue(coverSheet.getCell("D7"));
    const d9 = getCellValue(coverSheet.getCell("D9"));
    const d11 = getCellValue(coverSheet.getCell("D11"));
    if (d7) projectTitle = cleanText(d7);
    if (d9) projectDescription = cleanText(d9);
    if (d11) day1TargetDate = toDateString(d11);
  }

  // Parse JV Readiness Plan sheet
  const sheet = workbook.getWorksheet("JV Readiness Plan");
  if (!sheet) throw new Error('Sheet "JV Readiness Plan" not found');

  const actionItems: Omit<ActionItem, "id" | "createdAt" | "updatedAt">[] = [];
  const categorySummaries: Omit<CategorySummary, "id">[] = [];
  // Map: Excel row number → action item index (for formula-based dependency detection)
  const rowToIndex = new Map<number, number>();
  const rawDeps: { predecessorRowNum: number; successorIndex: number }[] = [];

  let formulaDepsFound = 0;

  // --- Dynamic column mapping from header row (row 3) ---
  // This handles different Excel structures (e.g. Notes column present or not)
  const headerRow = sheet.getRow(3);
  const col: Record<string, number> = {};
  const headerAliases: Record<string, string> = {
    workstream: "workstream",
    category: "category",
    requirement: "requirement",
    action: "action",
    owner: "owner",
    "maaden owner": "owner", // v10 renamed "Owner" to "Maaden Owner"
    status: "status",
    "start date": "startDate",
    "start": "startDate",
    duration: "duration",
    "end date": "endDate",
    "end": "endDate",
    "target completion (%)": "targetPct",
    "target completion": "targetPct",
    "target %": "targetPct",
    "target": "targetPct",
    "actual completion (%)": "actualPct",
    "actual completion": "actualPct",
    "actual %": "actualPct",
    notes: "notes",
    comments: "notes",
  };
  headerRow.eachCell((cell, colNumber) => {
    const raw = cleanText(getCellValue(cell)).toLowerCase();
    const mapped = headerAliases[raw];
    if (mapped) col[mapped] = colNumber;
  });

  // Fallback to fixed positions if headers weren't found
  if (!col.workstream) col.workstream = 1;
  if (!col.category) col.category = 2;
  if (!col.requirement) col.requirement = 3;
  if (!col.action) col.action = 4;
  if (!col.owner) col.owner = 5;
  if (!col.status) col.status = 6;
  if (!col.startDate) col.startDate = 7;
  if (!col.duration) col.duration = 8;
  if (!col.endDate) col.endDate = 9;
  if (!col.targetPct) col.targetPct = 10;
  // actualPct and notes may or may not exist — no forced fallback

  console.log("[Parser] Column mapping:", col);

  // Check for day1 target date in the end-date column of row 1
  const endDateColLetter = String.fromCharCode(64 + col.endDate); // e.g. 9 → "I"
  const day1Cell = getCellValue(sheet.getCell(`${endDateColLetter}1`));
  if (day1Cell) {
    const d = toDateString(day1Cell);
    if (d) day1TargetDate = d;
  }

  let sortOrder = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return; // Skip title + empty + header rows

    const workstreamVal = getCellValue(row.getCell(col.workstream));
    const categoryVal = getCellValue(row.getCell(col.category));
    const requirementVal = getCellValue(row.getCell(col.requirement));
    const actionVal = getCellValue(row.getCell(col.action));
    const ownerVal = getCellValue(row.getCell(col.owner));
    const statusVal = getCellValue(row.getCell(col.status));
    const startDateVal = getCellValue(row.getCell(col.startDate));
    const durationVal = getCellValue(row.getCell(col.duration));
    const endDateVal = getCellValue(row.getCell(col.endDate));
    const targetPctVal = col.targetPct ? getCellValue(row.getCell(col.targetPct)) : null;
    const notesVal = col.notes ? getCellValue(row.getCell(col.notes)) : null;
    const actualPctVal = col.actualPct ? getCellValue(row.getCell(col.actualPct)) : null;

    const workstream = cleanText(workstreamVal);
    const category = cleanText(categoryVal);

    // Skip empty rows
    if (!category) return;

    // Category header row: no workstream, no action, no owner
    if (!workstream && !actionVal && !ownerVal) {
      const start = toDateString(startDateVal);
      const end = toDateString(endDateVal);
      const dur = typeof durationVal === "number" ? Math.round(durationVal) : 0;
      if (category && start && end) {
        categorySummaries.push({ category, workstream: "", startDate: start, endDate: end, duration: dur });
      }
      return;
    }

    // Action item row
    if (!workstream) return;

    // --- Formula-based dependency detection ---
    const startCell = row.getCell(col.startDate);
    const startFormula = getCellFormula(startCell);
    const predecessorRowNum = parseDependencyRef(startFormula, endDateColLetter);

    const startDate = toDateString(startDateVal);
    const endDate = toDateString(endDateVal);
    const duration = typeof durationVal === "number" ? Math.round(durationVal) : 0;

    let targetPct = 0;
    if (typeof targetPctVal === "number") {
      targetPct = Math.min(1, Math.max(0, targetPctVal));
    } else {
      const today = new Date();
      const start = new Date(startDate);
      const end = new Date(endDate);
      const total = end.getTime() - start.getTime();
      if (total > 0) {
        targetPct = Math.min(1, Math.max(0, (today.getTime() - start.getTime()) / total));
      }
    }

    let actualPct = 0;
    if (typeof actualPctVal === "number") {
      actualPct = Math.min(1, Math.max(0, actualPctVal));
    }

    const itemIndex = actionItems.length;
    rowToIndex.set(rowNumber, itemIndex);

    if (predecessorRowNum !== null) {
      rawDeps.push({ predecessorRowNum, successorIndex: itemIndex });
      formulaDepsFound++;
    }

    const itemData = {
      workstream,
      category,
      requirement: cleanText(requirementVal),
      action: cleanText(actionVal),
      owner: cleanText(ownerVal),
      status: "On-track" as const, // placeholder — computed below
      startDate,
      duration,
      endDate,
      targetCompletionPct: targetPct,
      actualCompletionPct: actualPct,
      notes: cleanText(notesVal),
      sortOrder: sortOrder++,
    };
    // Compute status from dates and completion rates
    itemData.status = computeStatus(itemData) as typeof itemData.status;
    actionItems.push(itemData);
  });

  // --- Resolve formula-based dependencies ---
  const depPairs = new Set<string>(); // "predIdx-succIdx" for deduplication
  const dependencies: { predecessorIndex: number; successorIndex: number }[] = [];

  for (const { predecessorRowNum, successorIndex } of rawDeps) {
    const predIndex = rowToIndex.get(predecessorRowNum);
    if (predIndex !== undefined) {
      const key = `${predIndex}-${successorIndex}`;
      if (!depPairs.has(key)) {
        depPairs.add(key);
        dependencies.push({ predecessorIndex: predIndex, successorIndex });
      }
    }
  }

  // NOTE: Dependencies are derived EXCLUSIVELY from Excel start-date formulas (e.g. =K5).
  // We deliberately do NOT infer dependencies from matching dates — coincidental date
  // alignment between unrelated items (e.g. across categories) produced false links.

  console.log(
    `[Parser] Items: ${actionItems.length}, Categories: ${categorySummaries.length}, ` +
    `Formula deps: ${formulaDepsFound}, Total deps: ${dependencies.length}`
  );

  // Fix category summaries: assign workstream from the first action item in that category
  const categoryToWorkstream = new Map<string, string>();
  for (const item of actionItems) {
    if (!categoryToWorkstream.has(item.category)) {
      categoryToWorkstream.set(item.category, item.workstream);
    }
  }
  for (const cs of categorySummaries) {
    if (!cs.workstream) {
      cs.workstream = categoryToWorkstream.get(cs.category) || "";
    }
  }

  return {
    project: { title: projectTitle, description: projectDescription, day1TargetDate },
    actionItems,
    categorySummaries,
    dependencies,
  };
}

export interface ParsePreview {
  totalItems: number;
  workstreams: string[];
  statusCounts: Record<string, number>;
  day1TargetDate: string;
  projectTitle: string;
  categorySummariesCount: number;
  dependenciesCount: number;
}

export function buildPreview(parsed: ParsedWorkbook): ParsePreview {
  const statusCounts: Record<string, number> = {};
  const workstreams = new Set<string>();
  for (const item of parsed.actionItems) {
    workstreams.add(item.workstream);
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  return {
    totalItems: parsed.actionItems.length,
    workstreams: Array.from(workstreams),
    statusCounts,
    day1TargetDate: parsed.project.day1TargetDate,
    projectTitle: parsed.project.title,
    categorySummariesCount: parsed.categorySummaries.length,
    dependenciesCount: parsed.dependencies.length,
  };
}

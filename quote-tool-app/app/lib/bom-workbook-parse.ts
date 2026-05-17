import * as XLSX from "xlsx";
import { extractBomRowsWithAi } from "@/app/lib/ai-document-extraction";
import {
  resolveMajorProjectBomHeaderRow,
  resolveMajorProjectBomImportColumnMap,
} from "@/app/lib/major-project-bom-import";
import type { MajorProjectBomImportSheet } from "@/app/lib/quote-record";

const MAJOR_PROJECT_BOM_MAX_SHEET_ROWS = 250;

function normalizeSheetRows(worksheet: XLSX.WorkSheet) {
  const rawRows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  return rawRows
    .map((row, index) => ({
      rowNumber: index + 1,
      cells: (Array.isArray(row) ? row : []).map((value) => String(value ?? "").trim()),
    }))
    .filter((row) => row.cells.some((cell) => cell.trim().length > 0));
}

function shouldAttemptAiFallback(sheet: MajorProjectBomImportSheet) {
  if (!sheet.rows.length) return false;
  if (/data validation|lookup|reference|list/i.test(sheet.name)) return false;
  if (sheet.rows.length > 300) return false;

  const headerRowIndex = resolveMajorProjectBomHeaderRow(sheet);
  if (headerRowIndex < 0) return true;

  const { columnMap } = resolveMajorProjectBomImportColumnMap(sheet);
  return Object.values(columnMap).filter((value) => value !== null && value !== undefined).length < 3;
}

export async function parseMajorProjectBomWorkbookBytes(params: {
  bytes: Uint8Array;
  fileName?: string;
}) {
  const workbook = XLSX.read(params.bytes, {
    type: "array",
    dense: false,
  });
  const sheetEntries = workbook.SheetNames
    .map((rawSheetName) => ({
      rawSheetName,
      displayName: rawSheetName.trim(),
    }))
    .filter((entry) => entry.displayName);
  const sheetNames = sheetEntries.map((entry) => entry.displayName);

  if (!sheetNames.length) {
    throw new Error("Workbook parsed but no sheets were found.");
  }

  const aiExtractedSheetNames: string[] = [];
  const sheets: MajorProjectBomImportSheet[] = [];

  for (const sheetEntry of sheetEntries) {
    const worksheet = workbook.Sheets[sheetEntry.rawSheetName];
    const normalizedRows = normalizeSheetRows(worksheet);
    let rows = normalizedRows.slice(0, MAJOR_PROJECT_BOM_MAX_SHEET_ROWS);

    if (shouldAttemptAiFallback({ name: sheetEntry.displayName, rowCount: normalizedRows.length, rows })) {
      try {
        const aiRows = await extractBomRowsWithAi({
          fileName: params.fileName ?? "workbook",
          sheetName: sheetEntry.displayName,
          rows,
        });
        if (aiRows?.length) {
          rows = aiRows;
          aiExtractedSheetNames.push(sheetEntry.displayName);
        }
      } catch {
        // Preserve deterministic rows if AI fallback fails.
      }
    }

    sheets.push({
      name: sheetEntry.displayName,
      rowCount: rows.length,
      rows,
    });
  }

  return {
    sheetNames,
    sheets,
    aiExtractedSheetNames,
  };
}

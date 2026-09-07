import { AND, AVERAGEIF, COUNTIF, INT, IRR, ISNUMBER, MOD, NPV, SUM, SUMIF } from "@formulajs/formulajs";
import calculate from "xlsx-calc";
import { read, type WorkBook } from "xlsx";

calculate.import_functions({ AND, AVERAGEIF, COUNTIF, INT, IRR, ISNUMBER, MOD, NPV, SUM, SUMIF }, { override: true });

type CalculatedCell = { type: "n" | "str" | "b"; value: number | string | boolean };
const directReference = /^(?:(?:'(?:[^']|'')+'|[^'!]+)!)?\$?[A-Z]+\$?[1-9][0-9]*$/;

export function calculateQuoteMasterValues(workbook: WorkBook): Map<string, CalculatedCell> {
  // Excel treats references to empty cells as zero. These stubs exist only in the calculation copy.
  for (const sheet of Object.values(workbook.Sheets)) {
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!")) continue;
      if (cell.f) {
        delete cell.v;
        delete cell.w;
        cell.t = "n";
      } else if (cell.v == null || cell.v === "") sheet[address] = { t: "n", v: 0 };
    }
  }
  try {
    calculate(workbook);
  } catch (cause) {
    throw new Error(`Quote Master calculations could not be completed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const results = new Map<string, CalculatedCell>();
  for (const [name, sheet] of Object.entries(workbook.Sheets)) {
    for (const [address, cell] of Object.entries(sheet)) {
      if (!cell.f) continue;
      const value: unknown = cell.v == null && directReference.test(cell.f) ? 0 : cell.v;
      if (cell.t === "e" || !(typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))) {
        throw new Error(`Quote Master calculation failed at ${name}!${address}. No workbook was downloaded.`);
      }
      results.set(`${name}!${address}`, { type: typeof value === "string" ? "str" : typeof value === "boolean" ? "b" : "n", value });
    }
  }
  return results;
}

export function calculateQuoteMasterWorkbook(bytes: Uint8Array) {
  return calculateQuoteMasterValues(read(bytes, { type: "array", cellFormula: true, sheetStubs: true }));
}

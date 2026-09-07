declare module "xlsx-calc" {
  import type { WorkBook } from "xlsx";

  interface SpreadsheetCalculator {
    (workbook: WorkBook): void;
    import_functions(functions: Record<string, unknown>, options?: { override?: boolean }): void;
  }

  const calculate: SpreadsheetCalculator;
  export default calculate;
}

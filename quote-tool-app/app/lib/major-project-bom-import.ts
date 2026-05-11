import type {
  MajorProjectBomColumnKey,
  MajorProjectBomColumnMap,
  MajorProjectBomImportSheet,
} from "@/app/lib/quote-record";

const MAJOR_PROJECT_BOM_COLUMN_MATCHERS: Record<MajorProjectBomColumnKey, string[]> = {
  name: ["item name", "item", "product", "component", "equipment", "service", "part", "material"],
  description: ["description", "scope", "details", "notes"],
  quantity: ["qty", "quantity", "q'ty", "qyt", "count"],
  vendor: ["vendor", "supplier", "distributor"],
  manufacturer: ["manufacturer", "mfg", "make", "provider", "brand"],
  unitCost: ["unit cost", "cost ea", "ea cost", "each cost", "unit price", "price each", "cost per", "unit amount"],
  totalCost: ["extended cost", "ext cost", "line total", "total cost", "amount", "extended price", "ext price"],
};

function normalizeMajorProjectBomHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveMajorProjectBomHeaderRow(sheet: MajorProjectBomImportSheet) {
  let bestIndex = -1;
  let bestScore = 0;
  const scanRows = sheet.rows.slice(0, Math.min(sheet.rows.length, 12));

  for (const row of scanRows) {
    let score = 0;
    for (const cell of row.cells) {
      const normalizedCell = normalizeMajorProjectBomHeader(cell);
      if (!normalizedCell) continue;
      for (const candidates of Object.values(MAJOR_PROJECT_BOM_COLUMN_MATCHERS)) {
        if (candidates.some((candidate) => normalizedCell.includes(candidate))) {
          score += 1;
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = sheet.rows.findIndex((candidate) => candidate.rowNumber === row.rowNumber);
    }
  }

  return bestScore >= 2 ? bestIndex : -1;
}

export function resolveMajorProjectBomColumnMap(headerCells: string[]) {
  const columnMap: Partial<Record<MajorProjectBomColumnKey, number>> = {};

  headerCells.forEach((cell, index) => {
    const normalizedCell = normalizeMajorProjectBomHeader(cell);
    if (!normalizedCell) return;

    for (const [columnKey, candidates] of Object.entries(MAJOR_PROJECT_BOM_COLUMN_MATCHERS) as Array<[MajorProjectBomColumnKey, string[]]>) {
      if (columnMap[columnKey] !== undefined) continue;
      if (candidates.some((candidate) => normalizedCell.includes(candidate))) {
        columnMap[columnKey] = index;
        break;
      }
    }
  });

  return columnMap;
}

export function resolveMajorProjectBomImportColumnMap(
  sheet: MajorProjectBomImportSheet,
  reviewedColumnMapBySheet?: Partial<Record<string, MajorProjectBomColumnMap>>,
): {
  headerRowIndex: number;
  columnMap: Partial<Record<MajorProjectBomColumnKey, number>>;
} {
  const headerRowIndex = resolveMajorProjectBomHeaderRow(sheet);
  if (headerRowIndex === -1) {
    return {
      headerRowIndex,
      columnMap: {},
    };
  }

  const detectedMap = resolveMajorProjectBomColumnMap(sheet.rows[headerRowIndex]?.cells ?? []);
  const reviewedMap = reviewedColumnMapBySheet?.[sheet.name] ?? {};
  const columnKeys = Object.keys(MAJOR_PROJECT_BOM_COLUMN_MATCHERS) as MajorProjectBomColumnKey[];
  const columnMap: Partial<Record<MajorProjectBomColumnKey, number>> = {};

  columnKeys.forEach((columnKey) => {
    const reviewedIndex = reviewedMap[columnKey];
    if (reviewedIndex === null) {
      return;
    }
    if (reviewedIndex !== undefined) {
      columnMap[columnKey] = reviewedIndex;
      return;
    }

    const detectedIndex = detectedMap[columnKey];
    if (detectedIndex !== undefined) {
      columnMap[columnKey] = detectedIndex;
    }
  });

  return {
    headerRowIndex,
    columnMap,
  };
}

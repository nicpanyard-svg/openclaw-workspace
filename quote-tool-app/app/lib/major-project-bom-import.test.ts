import assert from "node:assert/strict";

import { resolveMajorProjectBomImportColumnMap } from "./major-project-bom-import";
import type { MajorProjectBomImportSheet } from "./quote-record";

function createSheet(name: string): MajorProjectBomImportSheet {
  return {
    name,
    rowCount: 2,
    rows: [
      {
        rowNumber: 1,
        cells: ["Item", "Qty", "Vendor", "Unit Cost", "Total Cost"],
      },
      {
        rowNumber: 2,
        cells: ["Router", "2", "Acme", "$10.00", "$20.00"],
      },
    ],
  };
}

{
  const result = resolveMajorProjectBomImportColumnMap(createSheet("Primary"), {
    Primary: {
      quantity: 3,
      vendor: 2,
    },
  });

  assert.equal(result.headerRowIndex, 0);
  assert.equal(result.columnMap.quantity, 3);
  assert.equal(result.columnMap.vendor, 2);
  assert.equal(result.columnMap.name, 0);
}

{
  const result = resolveMajorProjectBomImportColumnMap(createSheet("Primary"), {
    Primary: {
      quantity: null,
    },
  });

  assert.equal(result.headerRowIndex, 0);
  assert.equal("quantity" in result.columnMap, false);
  assert.equal(result.columnMap.name, 0);
}

{
  const result = resolveMajorProjectBomImportColumnMap(createSheet("Selected"), {
    Other: {
      vendor: 4,
      quantity: null,
    },
  });

  assert.equal(result.headerRowIndex, 0);
  assert.equal(result.columnMap.vendor, 2);
  assert.equal(result.columnMap.quantity, 1);
}

console.log("app/lib/major-project-bom-import.test.ts: ok");

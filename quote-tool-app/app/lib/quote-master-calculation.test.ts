import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { read, type WorkBook } from "xlsx";
import { fixtureComponent, fixtureQuote, quoteMasterFixtures } from "../../scripts/quote-master-fixtures";
import { calculateQuoteMasterValues } from "./quote-master-calculation";
import { buildQuoteMasterFormulaRepairs } from "./quote-master-formulas";
import { buildQuoteMasterInputs, type QuoteMasterSelection } from "./quote-master-model";

function workbookFor(selections: QuoteMasterSelection[]) {
  const wb = read(readFileSync("public/templates/quote-master-2026-08-28.xlsx"), { cellFormula: true, sheetStubs: true });
  for (const edit of [...buildQuoteMasterFormulaRepairs(), ...buildQuoteMasterInputs(selections).cells]) {
    wb.Sheets[edit.sheet][edit.address] = edit.formula !== undefined
      ? { t: "n", f: edit.formula, v: 987654321 }
      : { t: typeof edit.value === "string" ? "s" : "n", v: edit.value ?? 0 };
  }
  return wb;
}

test("single-option purchase exports calculated totals without depending on Excel to recalculate", () => {
  const quote = fixtureQuote("QA-CACHE", "Single option", [
    fixtureComponent("Equipment", 100, 40, { quantity: 2, customerUnitPrice: 50, vendorUnitCost: 20 }),
    fixtureComponent("Optional equipment", 150, 60, { quantity: 2, customerUnitPrice: 75, vendorUnitCost: 30, optional: true }),
    fixtureComponent("Install", 20, 10, { lineType: "installation" }),
    fixtureComponent("Service", 30, 16, { quantity: 2, customerUnitPrice: 15, vendorUnitCost: 8, schedule: "recurring", lineType: "subscription" }),
  ]);
  const wb = workbookFor([{ quote, optionId: quote.majorProject.activeOptionId }]);
  const result = calculateQuoteMasterValues(wb);
  assert.equal(result.get("Pricing!E99")?.value, 120);
  assert.equal(result.get("Pricing!E100")?.value, 70);
  assert.equal(result.get("Pricing!E55")?.value, 30);
  assert.equal(result.get("Pricing!E53")?.value, 16);
  assert.equal(result.get("Sale (BOM)!H11")?.value, 0);
  assert.equal(result.get("Exec Summary!F44")?.value, 120);
  assert.equal(result.get("Exec Summary!F20")?.type, "str");
  assert.equal(result.get("Exec Summary!E34")?.value, 0);
  assert.equal(result.get("Exec Summary!M33")?.value, 0);
  for (const [name, sheet] of Object.entries(wb.Sheets)) {
    for (const [address, cell] of Object.entries(sheet)) if (cell.f) assert.ok(result.has(`${name}!${address}`));
  }
  assert.equal(wb.Sheets["Exec Summary"].F44.f, "'Pricing'!E99");
});

test("five-column annual and connectivity calculations match the existing template model", () => {
  const result = calculateQuoteMasterValues(workbookFor(quoteMasterFixtures()));
  for (const [address, expected] of Object.entries({ E99: 11944.46, F99: 9660.76, G99: 10200, H55: 92.5, I55: 285.5, G55: 1600 / 12, D99: 31805.22, D100: 10805.22 })) {
    assert.ok(Math.abs(Number(result.get(`Pricing!${address}`)?.value) - expected) < 0.00001, address);
  }
});

test("lease calculations retain upfront capex, monthly service and payback", () => {
  const quote = fixtureQuote("QA-CACHE-LEASE", "Lease", [
    fixtureComponent("Gateway", 1000, 650),
    fixtureComponent("Install", 300, 200, { lineType: "installation" }),
    fixtureComponent("Service", 65, 40, { schedule: "recurring", lineType: "subscription" }),
  ]);
  Object.assign(quote.metadata, { quoteType: "lease", hasActiveDataAgreement: true, leaseTermMonths: 3, leaseMarginPercent: 35 });
  const result = calculateQuoteMasterValues(workbookFor([{ quote, optionId: quote.majorProject.activeOptionId }]));
  assert.equal(result.get("Pricing!E52")?.value, 650);
  assert.equal(result.get("Pricing!E99")?.value, 300);
  assert.equal(result.get("Cashflow & Payback!C33")?.value, -550);
  assert.ok(Math.abs(Number(result.get("Pricing!E60")?.value) - 550 / 358.33) < 0.000001);
});

test("typed results and errors never reuse an old cached total", () => {
  const wb: WorkBook = { SheetNames: ["Test"], Sheets: { Test: {
    A1: { t: "n", f: "SUM(2,3)", v: 999 },
    A2: { t: "s", f: 'IF(A1=5,"Ready","Wrong")', v: "Wrong" },
    A3: { t: "b", f: "ISNUMBER(A1)", v: false },
    A4: { t: "n", f: "B4", v: 42 },
    B4: { t: "s", v: "" },
    A6: { t: "s", f: 'IF(1=1,"","No")', v: "stale" },
  } } };
  const result = calculateQuoteMasterValues(wb);
  assert.deepEqual(result.get("Test!A1"), { type: "n", value: 5 });
  assert.deepEqual(result.get("Test!A2"), { type: "str", value: "Ready" });
  assert.deepEqual(result.get("Test!A3"), { type: "b", value: true });
  assert.deepEqual(result.get("Test!A4"), { type: "n", value: 0 });
  assert.deepEqual(result.get("Test!A6"), { type: "str", value: "" });
  wb.Sheets.Test.A5 = { t: "n", f: "1/0", v: 999 };
  assert.throws(() => calculateQuoteMasterValues(wb), /calculation/i);
});

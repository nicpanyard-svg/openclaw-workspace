import assert from "node:assert/strict";
import test from "node:test";
import { blankQuoteMasterInputs, buildQuoteMasterColumns, buildQuoteMasterInputs } from "./quote-master-model";
import { buildQuoteMasterFormulaRepairs } from "./quote-master-formulas";
import { fixtureComponent, fixtureQuote, quoteMasterFixtures } from "../../scripts/quote-master-fixtures";

test("SARA columns separate hardware, annual AI/cloud and replacement connectivity without mutating saved data", () => {
  const selections = quoteMasterFixtures(), before = structuredClone(selections);
  const columns = buildQuoteMasterColumns(selections);
  assert.deepEqual(columns.map((column) => column.label), ["Radar hardware", "Camera hardware", "AI / cloud", "Cellular + SecureLynk", "Starlink + SecureLynk"]);
  assert.deepEqual(columns.map((column) => column.oneTime), [11944.46, 9660.76, 10200, 0, 0]);
  assert.deepEqual(columns.map((column) => column.monthly), [0, 0, 0, 92.5, 285.5]);
  assert.equal(columns[2].annual, 1600);
  assert.equal(columns[2].annualFirstYear, 1600);
  assert.equal(columns[2].modelMonthly, 1600 / 12);
  assert.deepEqual(selections, before);
});

test("template input mapping carries real line costs, quantities and margins and excludes optional quantities", () => {
  const selections = quoteMasterFixtures();
  const { cells, fileName } = buildQuoteMasterInputs(selections);
  const value = (sheet: string, address: string) => cells.find((cell) => cell.sheet === sheet && cell.address === address)?.value;
  assert.equal(value("Sale (BOM)", "C10"), 6000);
  assert.equal(value("Sale (BOM)", "D10"), 1 - 6000 / 8944.46);
  assert.equal(value("Sale (BOM)", "F10"), 1);
  assert.equal(value("Pricing", "E65"), 1);
  assert.equal(value("Pricing", "G6"), 1600 / 12);
  assert.equal(value("Pricing", "H6"), 92.5);
  assert.equal(value("Pricing", "I6"), 285.5);
  const optional = cells.find((cell) => typeof cell.value === "string" && cell.value.startsWith("OPTION: Serenity"))!;
  const row = optional.address.slice(1);
  for (const col of ["D", "F", "H", "J", "L"]) assert.equal(value("Rental (BOM)", `${col}${row}`), 0);
  assert.match(String(value("Rental (BOM)", `O${row}`)), /Opt 3 qty 1: \$750.00\/yr; cost \$500.00\/yr; Y2/);
  assert.ok(fileName.endsWith("Quote Master.xlsx"));
});

test("full quoted quantities are not multiplied by the quote site count a second time", () => {
  const selections = quoteMasterFixtures().slice(0, 1);
  selections[0].quote.majorProject.options[0].siteCount = 3;
  const model = buildQuoteMasterInputs(selections);
  assert.equal(model.columns[0].oneTime, 11944.46);
  assert.equal(model.cells.find((cell) => cell.sheet === "Pricing" && cell.address === "E65")!.value, 1);
  assert.match(String(model.cells.find((cell) => cell.address === "K3")!.value), /3 quoted site/);
});

test("annual averages respect partial terms and Year 2 starts without changing the invoice cadence", () => {
  const selection = quoteMasterFixtures()[2];
  selection.quote.majorProject.commercial.termMonths = 18;
  let column = buildQuoteMasterColumns([selection])[0];
  assert.equal(column.modelMonthly, 3200 / 18);
  selection.quote.majorProject.options[0].components![3].optional = false;
  column = buildQuoteMasterColumns([selection])[0];
  assert.equal(column.annualFirstYear, 1600);
  assert.equal(column.annual, 2350);
  assert.equal(column.modelMonthly, 3950 / 18);
});

test("zero-cost priced items and no-charge cost items retain their quoted prices", () => {
  const quote = fixtureQuote("QA-FIXED", "Fixed prices", [fixtureComponent("License", 408, 0), fixtureComponent("Included service", 0, 50)]);
  const { cells } = buildQuoteMasterInputs([{ quote, optionId: quote.majorProject.activeOptionId }]);
  assert.equal(cells.find((cell) => cell.sheet === "Sale (BOM)" && cell.address === "E10")!.value, 408);
  assert.equal(cells.find((cell) => cell.sheet === "Sale (BOM)" && cell.address === "E11")!.value, 0);
});

test("blank template removes example service costs, quantities and stale package counts", () => {
  const cells = blankQuoteMasterInputs();
  for (const address of ["C128", "C129", "C130", "C131", "C132", "D129", "F129", "F150"]) assert.equal(cells.find((cell) => cell.sheet === "Rental (BOM)" && cell.address === address)!.value, 0);
  for (const col of ["E", "F", "G", "H", "I"]) assert.equal(cells.find((cell) => cell.sheet === "Pricing" && cell.address === col + "65")!.value, 0);
});

test("unsafe or oversized selections fail explicitly, never truncate the workbook", () => {
  assert.throws(() => buildQuoteMasterColumns([]), /Select at least/);
  const six = [...quoteMasterFixtures(), ...quoteMasterFixtures().slice(0, 1)];
  assert.throws(() => buildQuoteMasterColumns(six), /five option columns/);
  const mismatch = quoteMasterFixtures();
  mismatch[0].quote.customer.name = "Different customer";
  assert.throws(() => buildQuoteMasterColumns(mismatch), /same customer/);
  const currency = quoteMasterFixtures().slice(0, 1);
  currency[0].quote.metadata.currencyCode = "EUR";
  assert.throws(() => buildQuoteMasterColumns(currency), /USD-only/);
  const quote = fixtureQuote("QA-LIMIT", "Capacity", Array.from({ length: 32 }, (_, i) => fixtureComponent(`Hardware ${i}`, 100, 60)));
  assert.throws(() => buildQuoteMasterInputs([{ quote, optionId: quote.majorProject.activeOptionId }]), /existing BOM rows/);
});

test("lease hardware goes to rental capex, never an additional one-time purchase", () => {
  const quote = fixtureQuote("QA-LEASE", "Equipment lease", [fixtureComponent("Leased gateway", 1000, 650), fixtureComponent("Install", 300, 200, { lineType: "installation" }), fixtureComponent("Service", 65, 40, { schedule: "recurring", lineType: "subscription" })]);
  Object.assign(quote.metadata, { quoteType: "lease", hasActiveDataAgreement: true, leaseTermMonths: 3, leaseMarginPercent: 35 });
  const model = buildQuoteMasterInputs([{ quote, optionId: quote.majorProject.activeOptionId }]);
  assert.equal(model.columns[0].oneTime, 300);
  assert.equal(model.columns[0].monthly, 398.33);
  assert.equal(model.cells.find((cell) => cell.sheet === "Rental (BOM)" && cell.address === "C10")!.value, 650);
  quote.metadata.hasActiveDataAgreement = false;
  assert.throws(() => buildQuoteMasterColumns([{ quote, optionId: quote.majorProject.activeOptionId }]), /active data agreement/);
});

test("usage rates retain unit pricing without becoming included monthly charges", () => {
  const quote = fixtureQuote("QA-USAGE", "Overage", [fixtureComponent("Service", 100, 50, { lineType: "subscription", schedule: "recurring" }), fixtureComponent("Overage", 0, 0, { unit: "GB", quantity: 0, customerUnitPrice: 2, vendorUnitCost: 1, lineType: "subscription", schedule: "recurring", quickQuoteSource: { section: "sectionA", rowId: "overage", usageBased: true } })]);
  const { cells, columns } = buildQuoteMasterInputs([{ quote, optionId: quote.majorProject.activeOptionId }]);
  assert.equal(columns[0].monthly, 100);
  assert.equal(cells.find((cell) => cell.sheet === "Rental (BOM)" && cell.address === "D129")!.value, 0);
  assert.match(String(cells.find((cell) => cell.sheet === "Rental (BOM)" && cell.address === "O129")!.value), /usage: \$2.00\/GB; cost \$1.00\/GB/);
});

test("recurring financial-model terms must fit the template's ten-year horizon", () => {
  const selection = quoteMasterFixtures()[2];
  selection.quote.majorProject.commercial.termMonths = 121;
  assert.throws(() => buildQuoteMasterColumns([selection]), /1 to 120 months/);
});

test("formula repairs align all five summary columns and correct cash-flow signs and partial years", () => {
  const changes = buildQuoteMasterFormulaRepairs();
  const formula = (sheet: string, address: string) => changes.findLast((cell) => cell.sheet === sheet && cell.address === address)?.formula;
  assert.equal(formula("Exec Summary", "D44"), "'Pricing'!D99");
  assert.equal(formula("Exec Summary", "J31"), "'Pricing'!G56");
  assert.equal(formula("Exec Summary", "N40"), "'Pricing'!I65");
  assert.equal(formula("Pricing", "F60"), "'Cashflow & Payback'!C74");
  assert.equal(formula("Cashflow & Payback", "C33"), "-C32");
  assert.equal(formula("Cashflow & Payback", "C6"), "SUM('Pricing'!E7:I7)");
  assert.equal(formula("Exec Summary", "D29"), "SUM('Pricing'!E7:I7)");
  assert.equal(formula("NPV - IRR", "E7"), "-D7");
  assert.equal(formula("NPV - IRR", "E8"), "'Pricing'!E$56*MAX(0,MIN(12,'Pricing'!E$4-(C8-1)*12))");
  assert.ok(!changes.some((cell) => cell.formula?.includes("E10101")));
});

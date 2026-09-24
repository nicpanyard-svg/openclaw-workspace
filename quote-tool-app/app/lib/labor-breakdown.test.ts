import assert from "node:assert/strict";
import test from "node:test";
import { applyLaborCosts, laborTotals } from "./labor-breakdown";
import { ensureMajorProjectState, applyMajorProjectToQuote, convertQuickQuoteToMajorProject } from "./major-project";
import { buildQuoteMasterInputs } from "./quote-master-model";
import { fixtureComponent, fixtureQuote } from "../../scripts/quote-master-fixtures";
import { getCustomerQuoteContent } from "./proposal-customer-content";
import { createBlankQuoteRecord } from "./quote-template";

test("labor tasks set cost once, preserve sell price, persist and export internally", () => {
  const component = fixtureComponent("Installation", 1200, 100);
  Object.assign(component, { lineType: "installation", quantity: 2, customerUnitPrice: 1200, customerExtendedPrice: 2400, laborTasks: [
    { id: "a", task: "Private task setup", role: "Technician", people: 2, hours: 3, hourlyCost: 50 },
    { id: "b", task: "Private task testing", role: "Engineer", people: 1, hours: 1.5, hourlyCost: 100 },
  ] });
  const original = structuredClone(component);
  const priced = applyLaborCosts(component);
  assert.deepEqual(component, original);
  assert.deepEqual(laborTotals(priced.laborTasks), { hours: 7.5, cost: 450 });
  assert.equal(priced.vendorUnitCost, 450);
  assert.equal(priced.vendorExtendedCost, 900);
  assert.equal(priced.customerExtendedPrice, 2400);
  const quote = ensureMajorProjectState(JSON.parse(JSON.stringify(fixtureQuote("LABOR", "Install", [component]))));
  const model = buildQuoteMasterInputs([{ quote, optionId: quote.majorProject.activeOptionId }]);
  assert.equal(model.columns[0].lines[0].cost, 900);
  assert.ok(model.cells.some(cell => typeof cell.value === "string" && cell.value.includes("Private task setup") && cell.value.includes("15.00 quoted person-hours")));
  assert.ok(!JSON.stringify(getCustomerQuoteContent(applyMajorProjectToQuote(quote))).includes("Private task"));
});
test("legacy labor costs remain unchanged without a breakdown", () => {
  const component = fixtureComponent("Legacy installation", 1000, 400);
  component.lineType = "installation";
  assert.deepEqual(applyLaborCosts(component), component);
});
test("Quick Quote can export through a temporary conversion without modifying the quote", () => {
  const quote = createBlankQuoteRecord();
  quote.customer.name = "Export test";
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "item", sourceType: "custom", itemName: "Router", partNumber: "R1", description: "Router", quantity: 2, unitPrice: 100, totalPrice: 200 }];
  const before = structuredClone(quote);
  const converted = convertQuickQuoteToMajorProject(quote);
  const model = buildQuoteMasterInputs([{ quote: converted, optionId: converted.majorProject.activeOptionId }]);
  assert.equal(model.columns[0].oneTime, 200);
  assert.deepEqual(quote, before);
});



import assert from "node:assert/strict";
import test from "node:test";
import { isCustomerLabelLinked, renameQuoteItem, setCustomerLabelLinked } from "./quote-labels";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { ensureMajorProjectState } from "./major-project";
import { fixtureComponent, fixtureQuote } from "../../scripts/quote-master-fixtures";

test("new and matching legacy customer labels follow the internal name", () => {
  for (const customerFacingLabel of [undefined, "", "Controller"]) {
    const original = { internalName: "Controller", customerFacingLabel };
    const next = renameQuoteItem(original, "Radar controller");
    assert.equal(next.customerFacingLabel, "Radar controller");
    assert.equal(isCustomerLabelLinked(next), true);
    assert.equal(original.internalName, "Controller");
  }
});

test("custom legacy wording and explicit overrides are preserved", () => {
  assert.equal(renameQuoteItem({ internalName: "Vendor X", customerFacingLabel: "Traffic sensor" }, "Vendor Y").customerFacingLabel, "Traffic sensor");
  const independent = setCustomerLabelLinked({ internalName: "Controller", customerFacingLabel: "Controller" }, false);
  assert.equal(renameQuoteItem(independent, "New controller").customerFacingLabel, "Controller");
  const relinked = setCustomerLabelLinked(independent, true);
  assert.equal(renameQuoteItem(relinked, "New controller").customerFacingLabel, "New controller");
});

test("deliberate customer label overrides survive save and normalization", () => {
  const component = { ...fixtureComponent("Controller", 100, 50), customerLabelOverride: true };
  const quote = fixtureQuote("QA-LABEL", "Linked labels", [component]);
  const restored = ensureMajorProjectState(deserializeQuoteRecord(serializeQuoteRecord(quote))!);
  const item = restored.majorProject.options[0].components![0];
  assert.equal(isCustomerLabelLinked(item), false);
  assert.equal(renameQuoteItem(item, "Renamed controller").customerFacingLabel, "Controller");
});

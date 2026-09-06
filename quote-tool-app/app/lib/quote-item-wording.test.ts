import assert from "node:assert/strict";
import test from "node:test";
import { applyMajorProjectToQuote, convertQuickQuoteToMajorProject, getActiveMajorProjectOption } from "./major-project";
import { getProposalAttachments } from "./proposal-attachments";
import { getCombinedOneTimeTotal, getProposalOptionCostSummary } from "./proposal-commercial-summary";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { AXIS_LOCAL_STORAGE_LABEL, cleanQuoteItemWording, normalizeQuoteItemWording } from "./quote-item-wording";
import { createBlankQuoteRecord } from "./quote-template";

function sourceQuote() {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    { id: "gateway", sourceType: "custom", itemName: "RAD Secflow-1p", quantity: 1, unitPrice: 1525.70, totalPrice: 1525.70 },
    { id: "storage", sourceType: "custom", itemName: "1 TB SD Memory Card", description: "IP 67 enclosure with poll mount", quantity: 2, unitPrice: 125, totalPrice: 250, imageUrl: "/poll mount.png", partNumber: "IP 67", specSheetLabel: "RAD Secflow-1p.pdf", sourceLabel: "Original 1 TB SD Memory Card" },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [{ id: "poll mount", sourceType: "custom", description: "poll mount installation", notes: "IP 67 enclosure", quantity: 1, unitPrice: 50, totalPrice: 50, pricingStage: "budgetary", optional: true, billing: { cadence: "annual", startsYear: 2 } }];
  return quote;
}

test("only the requested wording is corrected and already-correct text stays stable", () => {
  assert.equal(cleanQuoteItemWording("IP 67; RAD Secflow-1p; poll mount; 1 TB SD Memory Card"), `IP67; RAD SecFlow-1p; pole mount; ${AXIS_LOCAL_STORAGE_LABEL}`);
  assert.equal(cleanQuoteItemWording("(IP 67), RAD Secflow-1p / poll mount."), "(IP67), RAD SecFlow-1p / pole mount.");
  for (const text of [AXIS_LOCAL_STORAGE_LABEL, "IP67; RAD SecFlow-1p; pole mount", "IP 670", "IP 68", "2 TB SD Memory Card", "11 TB SD Memory Card", "poll results", "RAD SecFlow-2"]) assert.equal(cleanQuoteItemWording(text), text);
});

test("normalization changes copy only, leaving prices, billing, identifiers and file references intact", () => {
  const quote = sourceQuote();
  const original = structuredClone(quote);
  const result = normalizeQuoteItemWording(quote);
  const row = result.sections.sectionB.lineItems[1];
  assert.equal(row.itemName, AXIS_LOCAL_STORAGE_LABEL);
  assert.equal(row.description, "IP67 enclosure with pole mount");
  assert.deepEqual(row, { ...original.sections.sectionB.lineItems[1], itemName: AXIS_LOCAL_STORAGE_LABEL, description: "IP67 enclosure with pole mount" });
  assert.deepEqual(result.sections.sectionC.lineItems[0], { ...original.sections.sectionC.lineItems[0], description: "pole mount installation", notes: "IP67 enclosure" });
  assert.equal(getCombinedOneTimeTotal(result), getCombinedOneTimeTotal(quote));
  assert.equal(getProposalOptionCostSummary(result).annualTotal, getProposalOptionCostSummary(quote).annualTotal);
  assert.deepEqual(quote, original);
  assert.deepEqual(normalizeQuoteItemWording(result), result);
});

test("saved quotes and Quick-to-Major source snapshots retain corrected names without duplicating work", () => {
  const saved = deserializeQuoteRecord(serializeQuoteRecord(sourceQuote()))!;
  assert.equal(saved.sections.sectionB.lineItems[1].itemName, AXIS_LOCAL_STORAGE_LABEL);
  let major = convertQuickQuoteToMajorProject(saved);
  const active = getActiveMajorProjectOption(major)!;
  assert.equal(active.components!.find((row) => row.id === "storage")!.internalName, AXIS_LOCAL_STORAGE_LABEL);
  assert.equal(active.quickQuoteSource!.sections.sectionB.lineItems[1].itemName, AXIS_LOCAL_STORAGE_LABEL);
  major.metadata.workflowMode = "quick_quote";
  major = convertQuickQuoteToMajorProject(major);
  assert.equal(major.majorProject.options.length, 1);
  assert.equal(major.sections.sectionB.lineItems[1].totalPrice, 250);
});

test("Major component and appendix item labels agree without renaming the attached document", () => {
  const major = convertQuickQuoteToMajorProject(sourceQuote());
  const component = getActiveMajorProjectOption(major)!.components!.find((row) => row.id === "storage")!;
  component.internalName = "1 TB SD Memory Card";
  component.customerFacingLabel = "1 TB SD Memory Card";
  component.specSheetAttachment = { storageKey: "poll mount", fileName: "1 TB SD Memory Card.pdf", mimeType: "application/pdf", sizeBytes: 100, updatedAt: "2026-09-06T00:00:00Z" };
  const output = applyMajorProjectToQuote(major);
  assert.equal(output.sections.sectionB.lineItems[1].itemName, AXIS_LOCAL_STORAGE_LABEL);
  assert.deepEqual(getProposalAttachments(output).map((entry) => [entry.itemLabels, entry.attachment.storageKey, entry.attachment.fileName]), [[[AXIS_LOCAL_STORAGE_LABEL], "poll mount", "1 TB SD Memory Card.pdf"]]);
});

test("simple rows, bundles, quote lines, and recurring descriptions receive the same corrections", () => {
  const quote = sourceQuote();
  const option = quote.majorProject.options[0];
  option.simpleRows = [{ id: "simple", label: "1 TB SD Memory Card", description: "IP 67", bucket: "hardware", quantity: 1, customerUnitPrice: 125, customerExtendedPrice: 125, ourUnitCost: 80, ourExtendedCost: 80 }];
  option.bundles = [{ id: "bundle", internalName: "RAD Secflow-1p", customerFacingLabel: "RAD Secflow-1p", description: "poll mount", componentIds: ["unchanged-id"] }];
  option.customerQuoteLines = [{ id: "line", label: "1 TB SD Memory Card", description: "IP 67", bundleIds: ["bundle"], presentationCategory: "hardware" }];
  quote.sections.sectionA.poolRows = [{ id: "plan", rowType: "service", description: "RAD Secflow-1p support", includedText: ["IP 67 enclosure"], monthlyRate: 10 }];
  const output = normalizeQuoteItemWording(quote);
  assert.equal(output.majorProject.options[0].simpleRows![0].label, AXIS_LOCAL_STORAGE_LABEL);
  assert.equal(output.majorProject.options[0].bundles![0].customerFacingLabel, "RAD SecFlow-1p");
  assert.equal(output.majorProject.options[0].bundles![0].description, "pole mount");
  assert.equal(output.majorProject.options[0].customerQuoteLines![0].label, AXIS_LOCAL_STORAGE_LABEL);
  assert.equal(output.sections.sectionA.poolRows[0].description, "RAD SecFlow-1p support");
  assert.deepEqual(output.sections.sectionA.poolRows[0].includedText, ["IP67 enclosure"]);
});

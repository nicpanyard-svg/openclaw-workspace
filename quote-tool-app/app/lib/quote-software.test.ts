import assert from "node:assert/strict";
import test from "node:test";
import { applyMajorProjectToQuote, convertQuickQuoteToMajorProject, getActiveMajorProjectOption } from "./major-project";
import { getProposalAttachments } from "./proposal-attachments";
import { getCombinedOneTimeTotal, getOptionalServicesTotal } from "./proposal-commercial-summary";
import { getCustomerQuoteContent } from "./proposal-customer-content";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { getAnnualSubscriptionSummary } from "./quote-line-billing";
import type { MajorProjectComponent, MajorProjectCustomerQuoteLine, ServicePricingRow } from "./quote-record";
import { createBlankQuoteRecord } from "./quote-template";
import { getSoftwareServicesPresentation, IOTEDGE_KINNECT_DESCRIPTION, IOTEDGE_KINNECT_LABEL, isIoTEdgeKinnect, normalizeQuoteSoftware, normalizeSoftwareComponent } from "./quote-software";

const legacyLabel = "LoRaWAN EDGE Software: IoTEDGE Kinnect from RAD";
const attachment = { storageKey: "kinnect-architecture", fileName: "Integrated Industrial IoT solution.png", mimeType: "image/png", sizeBytes: 100, updatedAt: "2026-09-06T00:00:00.000Z" };
const software: ServicePricingRow = { id: "software", sourceType: "custom", description: legacyLabel, quantity: 1, unitPrice: 408, totalPrice: 408, unitLabel: "ea", serviceCategory: "installation", pricingStage: "budgetary" };
const installation: ServicePricingRow = { id: "install", sourceType: "custom", description: "Installation", quantity: 1, unitPrice: 3000, totalPrice: 3000, notes: "Budget Estimate ~300 miles of drive time and 8 hours of labor", serviceCategory: "installation", pricingStage: "budgetary" };

function sourceQuote() {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "gateway", sourceType: "custom", itemName: "Cellular Modem and LoRaWAN Gateway - RAD SecFlow-1p", quantity: 1, unitPrice: 1525.70, totalPrice: 1525.70 }];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [structuredClone(software), structuredClone(installation)];
  return quote;
}

function component(overrides: Partial<MajorProjectComponent> = {}): MajorProjectComponent {
  return { id: "software", internalName: legacyLabel, customerFacingLabel: legacyLabel, vendor: "RAD", category: "Installation", lineType: "installation", quantity: 1, unit: "ea", customerUnitPrice: 408, customerExtendedPrice: 408, vendorUnitCost: 300, vendorExtendedCost: 300, schedule: "one_time", costBasis: "estimate", resaleBasis: "fixed_fee", passThrough: false, specSheetAttachment: attachment, ...overrides };
}

test("known IoTEDGE labels match without classifying installation or support as software", () => {
  for (const label of [legacyLabel, IOTEDGE_KINNECT_LABEL, "RAD IoTEDGE Kinnect - LoRaWAN Edge Container Software", "IoTEDGE Kinnect", "LoRaWAN Edge Container Software \u2014 RAD IoTEDGE Kinnect"]) assert.ok(isIoTEdgeKinnect(label), label);
  for (const label of [undefined, "Installation of IoTEDGE Kinnect", "IoTEDGE Kinnect support", "RAD SecFlow-1p", "LoRaWAN gateway", "Other software"]) assert.equal(isIoTEdgeKinnect(label), false, label);
});

test("legacy output gets software copy without changing price, cadence, or estimate status", () => {
  const quote = sourceQuote();
  const before = structuredClone(quote);
  const result = normalizeQuoteSoftware(quote);
  const row = result.sections.sectionC.lineItems[0];
  assert.equal(row.description, IOTEDGE_KINNECT_LABEL);
  assert.equal(row.notes, IOTEDGE_KINNECT_DESCRIPTION);
  assert.equal(row.lineType, "software");
  assert.equal(row.serviceCategory, "custom");
  assert.equal(row.unitLabel, "license");
  assert.equal(row.unitPrice, 408);
  assert.equal(row.totalPrice, 408);
  assert.equal(row.quantity, 1);
  assert.equal(row.pricingStage, "budgetary");
  assert.equal(row.billing, undefined, "do not infer a recurring or perpetual license term");
  assert.deepEqual(result.sections.sectionB, before.sections.sectionB);
  assert.deepEqual(result.sections.sectionC.lineItems[1], installation);
  assert.equal(getCombinedOneTimeTotal(result), 4933.70);
  assert.equal(getOptionalServicesTotal(result), 3408);
  assert.deepEqual(quote, before);
  assert.deepEqual(normalizeQuoteSoftware(result), result);
});

test("component normalization retains cost, quantity, options, billing, and spec identity", () => {
  const input = component({ optional: true, quantity: 2, customerExtendedPrice: 816, vendorExtendedCost: 600, billing: { cadence: "annual", startsYear: 2 } });
  const before = structuredClone(input);
  const output = normalizeSoftwareComponent(input);
  assert.equal(output.lineType, "software");
  assert.equal(output.category, "Software");
  assert.equal(output.customerFacingLabel, IOTEDGE_KINNECT_LABEL);
  assert.equal(output.internalName, IOTEDGE_KINNECT_LABEL);
  assert.equal(output.unit, "license");
  for (const key of ["id", "quantity", "customerUnitPrice", "customerExtendedPrice", "vendorUnitCost", "vendorExtendedCost", "optional", "billing", "specSheetAttachment"] as const) assert.deepEqual(output[key], input[key], key);
  assert.deepEqual(input, before);
  assert.deepEqual(normalizeSoftwareComponent(component({ customerFacingLabel: "Installation of IoTEDGE Kinnect" })), component({ customerFacingLabel: "Installation of IoTEDGE Kinnect" }));
});

test("Major output and saved quote reload preserve software and its appendix association", () => {
  const quote = sourceQuote();
  const option = quote.majorProject.options[0];
  option.simpleRows = [];
  option.bundles = [];
  option.customerQuoteLines = [];
  option.components = [component(), component({ id: "install", internalName: "Installation", customerFacingLabel: "Installation", customerUnitPrice: 3000, customerExtendedPrice: 3000, specSheetAttachment: undefined })];
  const output = applyMajorProjectToQuote(quote);
  assert.equal(output.sections.sectionC.lineItems[0].description, IOTEDGE_KINNECT_LABEL);
  assert.equal(output.sections.sectionC.lineItems[0].lineType, "software");
  assert.equal(output.sections.sectionC.lineItems[1].lineType, "installation");
  assert.equal(getOptionalServicesTotal(output), 3408);
  assert.deepEqual(getProposalAttachments(output).map((entry) => [entry.attachment, entry.itemLabels]), [[attachment, [IOTEDGE_KINNECT_LABEL]]]);
  const saved = deserializeQuoteRecord(serializeQuoteRecord(output))!;
  assert.equal(getOptionalServicesTotal(applyMajorProjectToQuote(saved)), 3408);
  assert.deepEqual(getProposalAttachments(saved), getProposalAttachments(output));
});

test("Quick-to-Major conversion preserves the software type and authored notes", () => {
  const quote = sourceQuote();
  quote.sections.sectionC.lineItems[0].notes = "Customer-approved container license scope";
  const saved = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  const output = convertQuickQuoteToMajorProject(saved);
  assert.equal(getActiveMajorProjectOption(output)!.components!.find((row) => row.id === "software")!.lineType, "software");
  assert.equal(output.sections.sectionC.lineItems[0].notes, "Customer-approved container license scope");
  assert.equal(output.sections.sectionC.lineItems[0].totalPrice, 408);
  assert.equal(getCombinedOneTimeTotal(output), 4933.70);
});

test("mapped software bundles retain pricing and use the same label in the appendix", () => {
  const quote = sourceQuote();
  const option = quote.majorProject.options[0];
  option.simpleRows = [];
  option.components = [component()];
  option.bundles = [{ id: "bundle", internalName: legacyLabel, customerFacingLabel: legacyLabel, componentIds: ["software"], specSheetAttachment: attachment }];
  // Exercise the legacy value still present in older saved quotes.
  option.customerQuoteLines = [{ id: "software-line", label: legacyLabel, bundleIds: ["bundle"], presentationCategory: "implementation" as MajorProjectCustomerQuoteLine["presentationCategory"] }];
  const output = applyMajorProjectToQuote(quote);
  assert.equal(output.sections.sectionC.lineItems[0].description, IOTEDGE_KINNECT_LABEL);
  assert.ok(output.sections.sectionC.lineItems[0].notes!.includes(IOTEDGE_KINNECT_DESCRIPTION));
  assert.equal(output.sections.sectionC.lineItems[0].lineType, "software");
  assert.equal(getOptionalServicesTotal(output), 408);
  assert.deepEqual(getProposalAttachments(output).map((entry) => entry.itemLabels), [[IOTEDGE_KINNECT_LABEL]]);
});

test("software estimate warnings remain distinct from implementation estimates", () => {
  const quote = sourceQuote();
  quote.sections.sectionC.lineItems = [software];
  assert.ok(!getCustomerQuoteContent(quote).warnings.some((warning) => warning.startsWith("Implementation and service pricing")));
  assert.ok(getCustomerQuoteContent(quote).warnings.some((warning) => warning.startsWith("Software pricing is budgetary")));
  quote.sections.sectionC.lineItems = [software, installation];
  assert.ok(getCustomerQuoteContent(quote).warnings.some((warning) => warning.startsWith("Implementation and service pricing")));
  quote.sections.sectionC.lineItems = [{ ...software, pricingStage: "final" }];
  assert.ok(!getCustomerQuoteContent(quote).warnings.some((warning) => warning.includes("budgetary")));
});

test("service headings distinguish software-only, mixed, and field-service quotes", () => {
  assert.equal(getSoftwareServicesPresentation([software]).title, "Software licenses");
  assert.equal(getSoftwareServicesPresentation([software, installation]).title, "Software & implementation services");
  assert.equal(getSoftwareServicesPresentation([installation]).title, "Implementation & field services");
  assert.equal(getSoftwareServicesPresentation([{ ...software, description: "Another license", lineType: "software" }]).title, "Software licenses");
});

test("annual software and renewal options retain their existing billing choices", () => {
  const quote = sourceQuote();
  quote.sections.sectionC.lineItems = [{ ...software, billing: { cadence: "annual", startsYear: 2, unitLabel: "gateway" }, optional: true }];
  const result = normalizeQuoteSoftware(quote);
  assert.deepEqual(getAnnualSubscriptionSummary(result), getAnnualSubscriptionSummary(quote));
  assert.deepEqual(result.sections.sectionC.lineItems[0].billing, quote.sections.sectionC.lineItems[0].billing);
  assert.equal(result.sections.sectionC.lineItems[0].optional, true);
  assert.equal(getOptionalServicesTotal(result), 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { applyMajorProjectToQuote, ensureMajorProjectState, resolveMajorProjectOutputSpecAttachments } from "./major-project";
import { getProposalAttachments } from "./proposal-attachments";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import type { MajorProjectComponent, MajorProjectSpecAttachment } from "./quote-record";
import { createBlankQuoteRecord } from "./quote-template";

function file(storageKey: string, fileName = `${storageKey}.pdf`): MajorProjectSpecAttachment {
  return { storageKey, fileName, mimeType: "application/pdf", sizeBytes: 100, updatedAt: "2026-09-05T00:00:00.000Z" };
}

function component(id: string, attachment?: MajorProjectSpecAttachment, overrides: Partial<MajorProjectComponent> = {}): MajorProjectComponent {
  return {
    id, internalName: id, customerFacingLabel: id, vendor: "Vendor", category: "Hardware", lineType: "hardware",
    quantity: 1, unit: "ea", customerUnitPrice: 100, customerExtendedPrice: 100, vendorUnitCost: 25,
    vendorExtendedCost: 25, schedule: "one_time", costBasis: "estimate", resaleBasis: "fixed_fee", passThrough: false,
    specSheetAttachment: attachment, ...overrides,
  };
}

function directQuote(components: MajorProjectComponent[]) {
  const quote = createBlankQuoteRecord();
  const option = quote.majorProject.options[0];
  quote.majorProject.options = [{ ...option, simpleRows: [], components, bundles: [], customerQuoteLines: [] }];
  return applyMajorProjectToQuote(quote);
}

test("legacy/blank quotes have no fabricated attachments and are not mutated", () => {
  const quote = createBlankQuoteRecord();
  const before = structuredClone(quote);
  assert.deepEqual(getProposalAttachments(quote), []);
  assert.deepEqual(quote, before);
});

test("specs follow actual section and line order, aggregate shared labels, and retain optional specs", () => {
  const shared = file("shared");
  const quote = directQuote([
    component("First internal", file("first")),
    component("Optional second", shared, { optional: true }),
    component("Third", shared),
    component("Data plan", file("plan"), { schedule: "recurring", lineType: "subscription" }),
    component("Installation", file("install"), { lineType: "installation" }),
  ]);
  quote.sections.sectionB.lineItems.reverse();
  quote.majorProject.summary.systemDrawings = [file("drawing"), shared, file("drawing"), file("different-key", "shared.pdf")];
  const before = structuredClone(quote);
  assert.deepEqual(getProposalAttachments(quote).map(({ id, kind, attachment, itemLabels, label }) => ({
    id, kind, key: attachment.storageKey, itemLabels, label,
  })), [
    { id: "A1", kind: "spec", key: "plan", itemLabels: ["Data plan"], label: "plan.pdf" },
    { id: "A2", kind: "spec", key: "shared", itemLabels: ["Third", "Optional second"], label: "shared.pdf" },
    { id: "A3", kind: "spec", key: "first", itemLabels: ["First internal"], label: "first.pdf" },
    { id: "A4", kind: "spec", key: "install", itemLabels: ["Installation"], label: "install.pdf" },
    { id: "A5", kind: "drawing", key: "drawing", itemLabels: [], label: "drawing.pdf" },
    { id: "A6", kind: "drawing", key: "different-key", itemLabels: [], label: "shared.pdf" },
  ]);
  assert.deepEqual(quote, before);
});

test("disabled sections cannot capture a shared file before an enabled output item", () => {
  const quote = directQuote([
    component("Disabled plan", file("shared"), { schedule: "recurring" }),
    component("Enabled equipment", file("shared")),
    component("Disabled service", file("service"), { lineType: "service" }),
  ]);
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionC.enabled = false;
  assert.deepEqual(getProposalAttachments(quote).map((entry) => [entry.id, entry.itemLabels]), [["A1", ["Enabled equipment"]]]);
  quote.sections.sectionB.enabled = false;
  assert.deepEqual(getProposalAttachments(quote), []);
  quote.majorProject.summary.systemDrawings = [file("drawing")];
  assert.deepEqual(getProposalAttachments(quote).map((entry) => [entry.id, entry.kind]), [["A1", "drawing"]]);
});

test("available option attachments follow all included scope, matching the printed Option Costs position", () => {
  const quote = directQuote([
    component("Optional hardware", file("option"), { optional: true }),
    component("Included hardware", file("hardware")),
    component("Included installation", file("installation"), { lineType: "installation" }),
  ]);
  assert.deepEqual(getProposalAttachments(quote).map((entry) => entry.attachment.storageKey), ["hardware", "installation", "option"]);
});

test("mapped output retains line and shared-bundle associations without promoting hidden component specs", () => {
  const quote = directQuote([
    component("Hardware", file("hidden-component")),
    component("Recurring", undefined, { schedule: "recurring" }),
  ]);
  const option = quote.majorProject.options[0];
  option.bundles = [
    { id: "bundle", internalName: "Internal name", customerFacingLabel: "Pack", componentIds: ["Hardware", "Recurring"], specSheetAttachment: file("bundle-spec") },
  ];
  option.customerQuoteLines = [
    { id: "line-b", label: "Customer B", bundleIds: ["bundle"], presentationCategory: "hardware", specSheetAttachment: file("line-spec") },
    { id: "line-a", label: "Customer A", bundleIds: ["bundle"], presentationCategory: "hardware", optional: true },
    { id: "plan", label: "Plan", bundleIds: ["bundle"], presentationCategory: "recurring" },
    { id: "second-plan", label: "Not an output plan", bundleIds: ["bundle"], presentationCategory: "recurring", specSheetAttachment: file("second-plan-spec") },
  ];
  const output = applyMajorProjectToQuote(quote);
  assert.deepEqual(getProposalAttachments(output).map((entry) => [entry.attachment.storageKey, entry.itemLabels]), [
    ["bundle-spec", ["Plan", "Customer B", "Customer A"]],
    ["line-spec", ["Customer B"]],
  ]);
  output.sections.sectionA.enabled = false;
  assert.deepEqual(getProposalAttachments(output).map((entry) => [entry.attachment.storageKey, entry.itemLabels]), [
    ["line-spec", ["Customer B"]],
    ["bundle-spec", ["Customer B", "Customer A"]],
  ]);
});

test("quick-builder normalization and saved quote round trips keep attachment identities and labels", () => {
  const quote = createBlankQuoteRecord();
  const option = quote.majorProject.options[0];
  option.components = [];
  option.bundles = [];
  option.customerQuoteLines = [];
  option.simpleRows = ["Second in alphabet", "A later item"].map((label, index) => ({
    id: `quick-${index}`, label, bucket: "hardware", quantity: 1, customerUnitPrice: 100,
    customerExtendedPrice: 100, ourUnitCost: 25, ourExtendedCost: 25, specSheetAttachment: file("shared"),
  }));
  const output = applyMajorProjectToQuote(quote);
  const expected = [{ id: "A1", kind: "spec", attachment: file("shared"), itemLabels: ["Second in alphabet", "A later item"], label: "shared.pdf" }];
  assert.deepEqual(getProposalAttachments(output), expected);
  const reloaded = deserializeQuoteRecord(serializeQuoteRecord(output));
  assert.ok(reloaded);
  assert.deepEqual(getProposalAttachments(reloaded), expected);
  assert.deepEqual(getProposalAttachments(ensureMajorProjectState(output)), expected);
});

test("active option and source resolver eligibility are respected, including unnamed component labels", () => {
  const quote = directQuote([
    component("not-priced", file("zero"), { customerUnitPrice: 0, customerExtendedPrice: 0 }),
    component("unnamed", file("unnamed"), { internalName: "", customerFacingLabel: "" }),
  ]);
  quote.majorProject.options.push({ ...quote.majorProject.options[0], id: "inactive", components: [component("Inactive", file("inactive"))] });
  assert.deepEqual(getProposalAttachments(quote).map((entry) => [entry.attachment.storageKey, entry.itemLabels]),
    resolveMajorProjectOutputSpecAttachments(quote).map((entry) => [entry.attachment.storageKey, [entry.outputItemLabel]]));
  assert.deepEqual(getProposalAttachments(quote).map((entry) => entry.attachment.storageKey), ["unnamed"]);
});

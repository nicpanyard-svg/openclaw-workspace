import assert from "node:assert/strict";
import test from "node:test";

import { applyMajorProjectToQuote } from "./major-project";
import {
  buildOrderProcessingText,
  getOrderProcessing,
  getOrderProcessingSummary,
  normalizeOrderProcessing,
} from "./order-processing";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { createProposalFromQuote, deserializeProposalStore, serializeProposalStore } from "./proposal-store";
import type { PoolPricingRow, QuoteOrderProcessing, QuoteRecord } from "./quote-record";
import { createBlankQuoteRecord } from "./quote-template";

const defaults: QuoteOrderProcessing = {
  terminals: [],
  terminalsStatus: "pending",
  shippingRequired: "pending",
  shippingContactPhone: "",
  overageOptIn: "pending",
  dataPlanDetails: "",
  monitoringSupportDetails: "",
  terminalAccessFeeDetails: "",
  miscellaneousChargesNotes: "",
  notes: "",
};

function createOrderQuote(): QuoteRecord {
  const quote = createBlankQuoteRecord();
  quote.metadata.proposalNumber = "ORDER-123";
  quote.metadata.accountId = "ACCOUNT-456";
  quote.metadata.quoteType = "purchase";
  quote.metadata.currencyCode = "USD";
  quote.metadata.leaseTermMonths = 12;
  quote.metadata.leaseMarginPercent = 35;
  quote.metadata.hasActiveDataAgreement = true;
  quote.internal.savedProposalId = quote.internal.quoteId;
  quote.internal.savedCustomerProfileId = "CUSTOMER-789";
  quote.customer.name = "Order customer";
  quote.customer.contactName = "Customer contact";
  quote.customer.contactPhone = "555-0100";
  quote.customer.contactEmail = "orders@example.test";
  quote.customer.addressLines = [" Service site ", "", "Austin, TX"];
  quote.billTo = { companyName: "Billing company", attention: "Bill recipient", lines: ["Billing address"] };
  quote.shipTo = { companyName: "Receiving company", attention: "Ship recipient", lines: ["Shipping address"] };
  quote.shippingSameAsBillTo = false;
  quote.orderProcessing = {
    ...defaults,
    terminals: ["Terminal A", "KIT-123"],
    terminalsStatus: "listed",
    shippingRequired: "yes",
    shippingContactPhone: "555-0123",
    overageOptIn: "no",
    dataPlanDetails: "Shared 1 TB pool; GB/TB details confirmed by sales",
    miscellaneousChargesNotes: "Permit charge included in field services",
    notes: "Call before activation",
  };
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    { id: "data", rowType: "service", description: "Plan named Support 9 TB", quantity: 2, unitLabel: "pool", monthlyRate: 50, unitPrice: 999, totalMonthlyRate: 100 },
    { id: "support", rowType: "support", description: "Managed monitoring", quantity: 1, unitPrice: 10, totalMonthlyRate: 10 },
    { id: "taf", rowType: "terminal_fee", description: "Fleet access", quantity: 2, monthlyRate: 5, totalMonthlyRate: 10 },
    { id: "overage", rowType: "overage", description: "Usage beyond allowance", quantity: null, unitLabel: "GB", unitPrice: 0.5, totalMonthlyRate: 0 },
    { id: "optional-data", rowType: "service", description: "Optional extra data", optional: true, quantity: 1, monthlyRate: 25, totalMonthlyRate: 25 },
  ];
  quote.sections.sectionA.perKitRows = [
    { id: "inactive", rowType: "service", description: "Inactive plan", monthlyRate: 999, totalMonthlyRate: 999 },
  ];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    { id: "hardware", sourceType: "custom", itemName: "Terminal kit", quantity: 2, unitPrice: 325, totalPrice: 650 },
    { id: "optional-hardware", sourceType: "custom", itemName: "Optional spare", optional: true, quantity: 1, unitPrice: 65, totalPrice: 65 },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    { id: "install", sourceType: "custom", description: "Install and permit", quantity: 2, unitPrice: 25, totalPrice: 50, notes: "Schedule with site manager" },
    { id: "optional-install", sourceType: "custom", description: "Optional site visit", optional: true, quantity: 1, unitPrice: 20, totalPrice: 20 },
  ];
  return quote;
}

test("legacy order details default to explicit pending decisions without mutating the quote", () => {
  const quote = createBlankQuoteRecord();
  delete quote.orderProcessing;
  const before = serializeQuoteRecord(quote);
  const details = getOrderProcessing(quote);
  assert.deepEqual(details, defaults);
  assert.equal(serializeQuoteRecord(quote), before);
  details.terminals.push("Changed copy");
  assert.deepEqual(getOrderProcessing(quote), defaults);
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Service address", "Terminal decision", "Shipping decision"]);
  const restored = deserializeQuoteRecord(before);
  assert.ok(restored);
  assert.deepEqual(restored.orderProcessing, defaults);
});

test("raw normalization trims strings, filters invalid terminals, and never infers decisions", () => {
  const raw = {
    terminals: ["  KIT-A  ", 42, null, "", " Site B "],
    terminalsStatus: "invented",
    shippingRequired: true,
    shippingContactPhone: " 555-0123 ",
    overageOptIn: true,
    dataPlanDetails: " 1 TB pool ",
    monitoringSupportDetails: " Included ",
    terminalAccessFeeDetails: " Not applicable ",
    miscellaneousChargesNotes: " freight ",
    notes: " call first ",
    shippingAddress: ["Must not be duplicated"],
    shippingContactName: "Must not be duplicated",
  };
  const expected = {
    ...defaults,
    terminals: ["KIT-A", "Site B"],
    shippingContactPhone: "555-0123",
    dataPlanDetails: "1 TB pool",
    monitoringSupportDetails: "Included",
    terminalAccessFeeDetails: "Not applicable",
    miscellaneousChargesNotes: "freight",
    notes: "call first",
  };
  assert.deepEqual(normalizeOrderProcessing(raw), expected);
  const restored = deserializeQuoteRecord(JSON.stringify({ ...createOrderQuote(), orderProcessing: raw }));
  assert.ok(restored);
  assert.deepEqual(restored.orderProcessing, expected);
  for (const malformed of [undefined, null, [], "yes", 1]) {
    assert.deepEqual(normalizeOrderProcessing(malformed), defaults);
  }
});

test("subscription classification uses rowType and explicit rates without reading GB/TB from prose", () => {
  const quote = createOrderQuote();
  const summary = getOrderProcessingSummary(quote);
  assert.deepEqual(summary.subscriptionRows, [
    { id: "data", description: "Plan named Support 9 TB", kind: "Data plan", quantity: 2, unitPrice: 50, total: 100, billingLabel: "Monthly per pool" },
    { id: "support", description: "Managed monitoring", kind: "Monitoring & support", quantity: 1, unitPrice: 10, total: 10, billingLabel: "Monthly" },
    { id: "taf", description: "Fleet access", kind: "Terminal access fee", quantity: 2, unitPrice: 5, total: 10, billingLabel: "Monthly" },
    { id: "overage", description: "Usage beyond allowance", kind: "Overage", quantity: null, unitPrice: 0.5, total: 0, billingLabel: "Usage-based per GB" },
  ]);
  assert.equal(summary.details.dataPlanDetails, quote.orderProcessing?.dataPlanDetails);
  assert.deepEqual(summary.missingFields, []);
  quote.sections.sectionA.poolRows[0].rowType = "unrecognized" as PoolPricingRow["rowType"];
  assert.equal(getOrderProcessingSummary(quote).subscriptionRows[0].kind, "Other");
});

test("per-kit output excludes inactive pool rows and optional rows", () => {
  const quote = createOrderQuote();
  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.perKitRows.push({ id: "optional-kit", rowType: "service", description: "Optional kit plan", optional: true, totalMonthlyRate: 1000 });
  const summary = getOrderProcessingSummary(quote);
  assert.deepEqual(summary.subscriptionRows.map((row) => row.id), ["inactive"]);
  assert.ok(summary.missingFields.includes("Monitoring / support fee definition"));
  assert.ok(summary.missingFields.includes("Terminal access fee definition"));
  assert.match(buildOrderProcessingText(quote), /Quoted recurring total: \$999\.00\/month/);
});

test("pending overage is never inferred from overage rows, terminal names, or existing agreements", () => {
  const quote = createOrderQuote();
  quote.metadata.hasActiveDataAgreement = true;
  quote.orderProcessing = { ...getOrderProcessing(quote), terminalsStatus: "pending", overageOptIn: "pending", shippingRequired: "pending" };
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Terminal decision", "Shipping decision", "Overage opt-in decision"]);
  const output = buildOrderProcessingText(quote);
  assert.ok(output.startsWith("DRAFT - missing details (3)\n"));
  assert.match(output, /Missing details: Terminal decision; Shipping decision; Overage opt-in decision/);
  assert.match(output, /Overage opt-in: Pending \(not authorized\)/);
  assert.doesNotMatch(output, /Overage opt-in: Yes/);
});

test("explicit opt-in choices survive normalization without automatic authorization", () => {
  for (const overageOptIn of ["yes", "no", "not_applicable", "pending"] as const) {
    const quote = createOrderQuote();
    quote.orderProcessing = { ...getOrderProcessing(quote), overageOptIn };
    const restored = deserializeQuoteRecord(serializeQuoteRecord(quote));
    assert.ok(restored);
    assert.equal(getOrderProcessing(restored).overageOptIn, overageOptIn);
    assert.equal(getOrderProcessingSummary(restored).missingFields.includes("Overage opt-in decision"), overageOptIn === "pending");
  }
});

test("recurring service needs explicit data allocation even when its prose mentions TB", () => {
  const quote = createOrderQuote();
  quote.orderProcessing = { ...getOrderProcessing(quote), dataPlanDetails: " " };
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Data plan / allocation details"]);
  const output = buildOrderProcessingText(quote);
  assert.ok(output.startsWith("DRAFT - missing details (1)\n"));
  assert.match(output, /Missing details: Data plan \/ allocation details/);
  assert.match(output, /Data plan details \(explicit annotation\): Not provided/);
  quote.sections.sectionA.enabled = false;
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, []);
});

test("overage opt-in yes requires an included enabled overage pricing row", () => {
  const quote = createOrderQuote();
  quote.orderProcessing = { ...getOrderProcessing(quote), overageOptIn: "yes" };
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, []);
  quote.sections.sectionA.poolRows[3].optional = true;
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Overage pricing"]);
  quote.sections.sectionA.enabled = false;
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Overage pricing"]);
  assert.ok(buildOrderProcessingText(quote).startsWith("DRAFT - missing details (1)\n"));
});

test("lease without an active data agreement remains a draft with explicit pending status", () => {
  const quote = createOrderQuote();
  quote.metadata.quoteType = "lease";
  for (const hasActiveDataAgreement of [false, undefined]) {
    quote.metadata.hasActiveDataAgreement = hasActiveDataAgreement;
    assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Active data agreement confirmation"]);
    const output = buildOrderProcessingText(quote);
    assert.ok(output.startsWith("DRAFT - missing details (1)\n"));
    assert.match(output, /Lease data agreement: Pending \(not confirmed\)/);
    assert.doesNotMatch(output, /Lease data agreement: Confirmed/);
  }
  quote.metadata.hasActiveDataAgreement = true;
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, []);
  assert.match(buildOrderProcessingText(quote), /Lease data agreement: Confirmed/);
});

test("listed terminals require names and shipping yes requires address, contact, and explicit phone", () => {
  const quote = createOrderQuote();
  quote.customer.addressLines = [" "];
  quote.customer.contactName = "";
  quote.shipTo = { lines: [" "] };
  quote.orderProcessing = { ...getOrderProcessing(quote), terminals: [" "], shippingContactPhone: "" };
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, [
    "Service address", "Terminal identifiers / names", "Shipping address", "Shipping contact name", "Shipping contact phone",
  ]);
  quote.orderProcessing.terminalsStatus = "not_applicable";
  quote.orderProcessing.shippingRequired = "no";
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Service address"]);
});

test("shippingSameAsBillTo uses only the selected attention, never the customer contact or company", () => {
  const quote = createOrderQuote();
  quote.shippingSameAsBillTo = true;
  let summary = getOrderProcessingSummary(quote);
  assert.deepEqual(summary.serviceAddress, ["Service site", "Austin, TX"]);
  assert.deepEqual(summary.shippingAddress, ["Billing address"]);
  assert.equal(summary.shippingContactName, "Bill recipient");
  quote.shippingSameAsBillTo = false;
  summary = getOrderProcessingSummary(quote);
  assert.deepEqual(summary.shippingAddress, ["Shipping address"]);
  assert.equal(summary.shippingContactName, "Ship recipient");
  quote.shipTo.attention = " ";
  assert.equal(getOrderProcessingSummary(quote).shippingContactName, "");
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Shipping contact name"]);
  assert.match(buildOrderProcessingText(quote), /Shipping contact: Not provided/);
  quote.shippingSameAsBillTo = true;
  quote.billTo.attention = "";
  assert.equal(getOrderProcessingSummary(quote).shippingContactName, "");
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Shipping contact name"]);
  quote.orderProcessing = { ...getOrderProcessing(quote), shippingContactPhone: "" };
  assert.ok(getOrderProcessingSummary(quote).missingFields.includes("Shipping contact phone"));
});

test("fee annotations complete missing definitions and descriptions remain authoritative", () => {
  const quote = createOrderQuote();
  quote.orderProcessing = { ...getOrderProcessing(quote), monitoringSupportDetails: "Included", terminalAccessFeeDetails: "Not applicable" };
  assert.match(buildOrderProcessingText(quote), /Monitoring & support definition: Managed monitoring/);
  quote.sections.sectionA.poolRows[1].description = "";
  assert.equal(getOrderProcessingSummary(quote).subscriptionRows[1].description, "Included");
  quote.sections.sectionA.poolRows = quote.sections.sectionA.poolRows.filter((row) => !["support", "terminal_fee"].includes(row.rowType));
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, []);
  assert.match(buildOrderProcessingText(quote), /Monitoring & support definition: Included/);
  assert.match(buildOrderProcessingText(quote), /Terminal access fee definition: Not applicable/);
  quote.orderProcessing.monitoringSupportDetails = "";
  quote.orderProcessing.terminalAccessFeeDetails = "";
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Monitoring / support fee definition", "Terminal access fee definition"]);
});

test("included rows and totals exclude options while the optional list retains separate totals", () => {
  const quote = createOrderQuote();
  const summary = getOrderProcessingSummary(quote);
  assert.deepEqual(summary.equipmentRows.map((row) => row.id), ["hardware"]);
  assert.deepEqual(summary.serviceRows.map((row) => row.id), ["install"]);
  const output = buildOrderProcessingText(quote);
  const [included, optional] = output.split("Optional items (excluded from order totals; require separate selection):");
  assert.doesNotMatch(included, /Optional extra data|Optional spare|Optional site visit/);
  assert.match(included, /Quoted recurring total: \$120\.00\/month/);
  assert.match(included, /Customer one-time total: \$700\.00/);
  assert.match(optional, /Optional extra data: \$25\.00 \(monthly\)/);
  assert.match(optional, /Excluded optional monthly total: \$25\.00/);
  assert.match(optional, /Excluded optional one-time total: \$85\.00/);
});

test("disabled sections suppress their rows, totals, optional items, and recurring missing fields", () => {
  const quote = createOrderQuote();
  quote.metadata.quoteType = "lease";
  quote.commercial.costs.oneTimeEquipmentCost = 1300;
  quote.orderProcessing = { ...getOrderProcessing(quote), overageOptIn: "pending" };
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionB.enabled = false;
  quote.sections.sectionC.enabled = false;
  const summary = getOrderProcessingSummary(quote);
  assert.deepEqual(summary.subscriptionRows, []);
  assert.deepEqual(summary.equipmentRows, []);
  assert.deepEqual(summary.serviceRows, []);
  assert.deepEqual(summary.missingFields, []);
  const output = buildOrderProcessingText(quote);
  assert.match(output, /Quoted recurring total: \$0\.00\/month/);
  assert.match(output, /Lease monthly total: \$0\.00\/month/);
  assert.match(output, /Customer one-time total: \$0\.00/);
  assert.match(output, /Excluded optional monthly total: \$0\.00/);
  assert.match(output, /Excluded optional one-time total: \$0\.00/);
  assert.doesNotMatch(output, /Managed monitoring|Fleet access|Optional spare|Install and permit/);
});

test("optional-only recurring rows do not satisfy fee definitions or trigger recurring requirements", () => {
  const quote = createOrderQuote();
  quote.orderProcessing = { ...getOrderProcessing(quote), overageOptIn: "pending" };
  quote.sections.sectionA.poolRows.forEach((row) => { row.optional = true; });
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, []);
  quote.sections.sectionA.poolRows[0].optional = false;
  assert.deepEqual(getOrderProcessingSummary(quote).missingFields, ["Overage opt-in decision", "Monitoring / support fee definition", "Terminal access fee definition"]);
});

test("text includes required handoff fields and lease equipment is pricing basis, not upfront", () => {
  const quote = createOrderQuote();
  quote.metadata.quoteType = "lease";
  const output = buildOrderProcessingText(quote);
  assert.ok(output.startsWith("Internal order-processing handoff\n"));
  for (const value of ["ORDER-123", quote.internal.quoteId, "ACCOUNT-456", "CUSTOMER-789", "Order customer", "Service site", "Terminal A; KIT-123", "Shipping address", "Ship recipient", "555-0123", "Shared 1 TB pool", "Call before activation", "Permit charge included"]) {
    assert.ok(output.includes(value), `Missing handoff field: ${value}`);
  }
  assert.match(output, /Rate: \$50\.00 \(Monthly per pool\) \| Quoted line total: \$100\.00/);
  assert.match(output, /Rate: \$0\.50 \(Usage-based per GB\)/);
  assert.match(output, /Terminal kit \| Qty: 2 \| Unit price: \$325\.00 \| Pricing basis: \$650\.00/);
  assert.match(output, /Included equipment \(pricing basis, not an upfront purchase\)/);
  assert.match(output, /Customer upfront equipment: \$0\.00/);
  assert.match(output, /Lease monthly total: \$203\.33\/month/);
  assert.match(output, /Field \/ miscellaneous charges total: \$50\.00/);
  assert.match(output, /Customer one-time total: \$50\.00/);
  assert.match(output, /Excluded optional monthly total: \$33\.33/);
  assert.match(output, /Missing fields: None/);
});

test("export excludes internal economics, source metadata, and generated support cost text", () => {
  const quote = createOrderQuote();
  quote.commercial.costs.oneTimeEquipmentCost = 987654;
  quote.commercial.meta.notes = "Gross profit 444444; margin 555555";
  quote.internal.internalNotes = "Internal cost 666666";
  quote.sections.sectionA.poolRows[1].includedText = ["Internal monthly cost 777777", "Margin rollups"];
  quote.sections.sectionA.poolRows[1].sourceLabel = "Vendor cost 888888";
  const output = buildOrderProcessingText(quote);
  assert.doesNotMatch(output, /cost|profit|margin|987654|444444|555555|666666|777777|888888/i);
  assert.equal(getOrderProcessingSummary(quote).subscriptionRows[1].description, "Managed monitoring");
});

test("Major Project saved output supplies categories without exporting generated internal costs", () => {
  const quote = createOrderQuote();
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.enabled = true;
  quote.majorProject.builderMode = "simple";
  quote.majorProject.commercial.serviceMix = "starlink-pool";
  quote.majorProject.commercial.terminalFeePerSite = 5;
  quote.majorProject.commercial.overageRatePerGb = 0.5;
  const option = quote.majorProject.options[0];
  option.siteCount = 2;
  option.components = [];
  option.bundles = [];
  option.customerQuoteLines = [];
  option.simpleRows = [
    { id: "major-data", label: "Program pool", quantity: 2, customerUnitPrice: 50, customerExtendedPrice: 100, ourUnitCost: 17, ourExtendedCost: 34, bucket: "mrr" },
    { id: "major-monitoring", label: "Program monitoring", quantity: 1, customerUnitPrice: 10, customerExtendedPrice: 10, ourUnitCost: 765432, ourExtendedCost: 765432, bucket: "support_recurring" },
  ];
  const savedOutput = applyMajorProjectToQuote(quote);
  assert.equal(savedOutput.sections.sectionA.mode, "pool");
  assert.equal(savedOutput.majorProject.builderMode, "advanced");
  const summary = getOrderProcessingSummary(savedOutput);
  assert.deepEqual(summary.subscriptionRows.map(({ id, kind }) => ({ id, kind })), [
    { id: "major_recurring", kind: "Data plan" },
    { id: "major_terminal_fee", kind: "Terminal access fee" },
    { id: "major_overage", kind: "Overage" },
    { id: "major_support", kind: "Monitoring & support" },
  ]);
  assert.deepEqual(summary.subscriptionRows.map(({ unitPrice, total }) => ({ unitPrice, total })), [
    { unitPrice: 55, total: 110 },
    { unitPrice: 5, total: 10 },
    { unitPrice: 0.5, total: 0.5 },
    { unitPrice: 0, total: 0 },
  ]);
  assert.match(buildOrderProcessingText(savedOutput), /Quoted recurring total: \$120\.50\/month/);
  assert.doesNotMatch(buildOrderProcessingText(savedOutput), /cost|profit|margin|765432/i);
  assert.deepEqual(getOrderProcessing(savedOutput), getOrderProcessing(quote));
});

test("order details survive raw quote and saved proposal normalization without changing pricing", () => {
  const quote = createOrderQuote();
  const before = serializeQuoteRecord(quote);
  const expected = getOrderProcessingSummary(quote);
  const draft = deserializeQuoteRecord(before);
  assert.ok(draft);
  const proposal = createProposalFromQuote({ quote });
  const store = deserializeProposalStore(serializeProposalStore({ currentUser: proposal.createdBy, users: [proposal.owner], proposals: [proposal] }));
  assert.ok(store);
  assert.equal(store.proposals.length, 1);
  for (const restored of [draft, store.proposals[0].quote]) {
    assert.deepEqual(restored.orderProcessing, quote.orderProcessing);
    assert.deepEqual(restored.sections, quote.sections);
    assert.deepEqual(getOrderProcessingSummary(restored), expected);
    assert.equal(buildOrderProcessingText(restored), buildOrderProcessingText(quote));
  }
  assert.equal(serializeQuoteRecord(quote), before);
});

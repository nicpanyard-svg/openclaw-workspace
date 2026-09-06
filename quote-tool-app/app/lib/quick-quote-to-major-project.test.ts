import assert from "node:assert/strict";
import test from "node:test";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, convertQuickQuoteToMajorProject, getActiveMajorProjectOption } from "./major-project";
import { getEquipmentTotal, getLeasePricingSummary, getOptionalServicesTotal, getProposalOptionCostSummary, getRecurringMonthlyTotal } from "./proposal-commercial-summary";
import { getCustomerQuoteContent } from "./proposal-customer-content";
import { getProposalAttachments } from "./proposal-attachments";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { getAnnualSubscriptionSummary } from "./quote-line-billing";
import { createBlankQuoteRecord } from "./quote-template";
import type { QuoteRecord } from "./quote-record";

function quickQuote(mode: "pool" | "per_kit" = "pool") {
  const quote = createBlankQuoteRecord();
  Object.assign(quote.metadata, { workflowMode: "quick_quote", documentTitle: "River Authority Starlink", documentSubtitle: "Connectivity rollout", salesTaxAmount: 35 });
  Object.assign(quote.customer, { name: "River Authority", contactName: "Casey", contactPhone: "555-0100", contactEmail: "casey@example.test", addressLines: ["10 River Road"] });
  quote.billTo = { companyName: "River Authority", lines: ["Billing address"] };
  quote.shipTo = { companyName: "River Authority", attention: "Sam", lines: ["Shipping address"] };
  quote.shippingSameAsBillTo = false;
  quote.orderProcessing = { ...quote.orderProcessing!, terminals: ["SITE-1", "SITE-2"], shippingContactPhone: "555-0101", overageOptIn: "yes", dataPlanDetails: "500 GB shared pool", monitoringSupportDetails: "Weekday support", terminalAccessFeeDetails: "$10 per terminal", miscellaneousChargesNotes: "Permit included", notes: "Call before dispatch" };
  quote.executiveSummary.body = "Two remote monitoring sites.";
  quote.internal.internalNotes = "Private vendor negotiations";
  quote.customerOutput = { ...quote.customerOutput!, billingStart: "On activation", deliveryLeadTime: "Two weeks", leaseEndTerms: "Return equipment", postLeaseTerms: "Service continues" };
  quote.customFields = [{ id: "site", label: "Service address", value: "River Station 4", visibility: "customer" }];
  quote.terms.pricingTerms = ["Net 45. Hardware is prepaid."];
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = mode;
  quote.sections.sectionA.termMonths = 12;
  quote.sections.sectionA.introText = "500 GB is shared across the named terminals.";
  quote.sections.sectionA.explanatoryParagraphs = ["Overages require opt-in."];
  const rows = [
    { id: "data", rowType: "service" as const, description: "Starlink 500 GB", quantity: 1, unitLabel: "pool", unitPrice: 250, monthlyRate: 250, totalMonthlyRate: 250, includedText: ["500 GB shared", "Business data"], sourceLabel: "Starlink catalog", specSheetLabel: "Starlink plan" },
    { id: "taf", rowType: "terminal_fee" as const, description: "TAF", quantity: 2, unitLabel: "terminal", monthlyRate: 10, totalMonthlyRate: 20 },
    { id: "support", rowType: "support" as const, description: "Monitoring", quantity: null, monthlyRate: 40, totalMonthlyRate: 40, includedText: ["Business hours", "Remote monitoring"] },
    { id: "included", rowType: "support" as const, description: "Portal access", includedText: ["Included"] },
    { id: "optional-data", rowType: "service" as const, description: "Extra data", quantity: 1, monthlyRate: 25, totalMonthlyRate: 25, optional: true },
  ];
  quote.sections.sectionA.poolRows = [...rows, { id: "overage", rowType: "overage", description: "Overage", quantity: null, unitLabel: "GB", monthlyRate: 0.75, totalMonthlyRate: 0.75 }];
  quote.sections.sectionA.perKitRows = rows;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.introText = "Mounts and routers included.";
  quote.sections.sectionB.lineItems = [
    { id: "kit", sourceType: "standard", itemName: "Starlink kit", quantity: 2, unitPrice: 600, totalPrice: 1200, description: "Outdoor kit", partNumber: "KIT-001", terminalType: "Standard", itemCategory: "Terminal", imageUrl: "/test-kit.png", specSheetLabel: "Kit datasheet", sourceLabel: "Catalog" },
    { id: "spare", sourceType: "custom", itemName: "Spare router", quantity: 1, unitPrice: 100, totalPrice: 100, optional: true },
    { id: "cloud", sourceType: "custom", itemName: "Cloud storage", quantity: 2, unitPrice: 125, totalPrice: 250, billing: { cadence: "annual", startsYear: 1, unitLabel: "camera" } },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.introText = "No civil works.";
  quote.sections.sectionC.lineItems = [
    { id: "install", sourceType: "standard", description: "Installation", quantity: 2, unitPrice: 200, totalPrice: 400, unitLabel: "site", notes: "Weekday work", serviceCategory: "installation", pricingStage: "final", serviceAgreementCategoryKey: "static_site_new_install", serviceAgreementRateBasis: "standard", mileageRate: 1.25 },
    { id: "renewal", sourceType: "custom", description: "Serenity", quantity: 2, unitPrice: 375, totalPrice: 750, optional: true, billing: { cadence: "annual", startsYear: 2, unitLabel: "application" } },
  ];
  quote.commercial.meta = { optionLabel: "Starlink base", comparisonGroup: "River Authority", notes: "Internal sales context" };
  quote.commercial.costs = { oneTimeEquipmentCost: 700, oneTimeLaborCost: 200, oneTimeOtherCost: 20, recurringVendorCost: 175, recurringSupportCost: 15, recurringOtherCost: 5, annualSubscriptionCost: 100 };
  return deserializeQuoteRecord(serializeQuoteRecord(quote))!;
}

function totals(quote: QuoteRecord) {
  return { monthly: getRecurringMonthlyTotal(quote), equipment: getEquipmentTotal(quote), services: getOptionalServicesTotal(quote), annual: getAnnualSubscriptionSummary(quote), options: getProposalOptionCostSummary(quote), lease: getLeasePricingSummary(quote) };
}

for (const mode of ["pool", "per_kit"] as const) {
  test(`${mode}: conversion preserves all quote details, source rows, costs, options, and billing`, () => {
    const quote = quickQuote(mode);
    const original = structuredClone(quote);
    const converted = convertQuickQuoteToMajorProject(quote);
    assert.deepEqual(quote, original, "conversion must not mutate the Quick Quote");
    assert.equal(converted.metadata.workflowMode, "major_project");
    assert.equal(converted.majorProject.commercial.termMonths, 12);
    assert.equal(converted.majorProject.summary.projectName, quote.metadata.documentTitle);
    for (const key of Object.keys(quote) as Array<keyof QuoteRecord>) {
      if (["metadata", "majorProject", "sections"].includes(key)) continue;
      assert.deepEqual(JSON.parse(JSON.stringify(converted[key])), JSON.parse(JSON.stringify(quote[key])), key);
    }
    assert.deepEqual(converted.metadata, JSON.parse(JSON.stringify({ ...quote.metadata, workflowMode: "major_project" })));
    for (const section of ["sectionA", "sectionB", "sectionC"] as const) {
      const { computed: _before, ...before } = quote.sections[section];
      const { computed: _after, ...after } = converted.sections[section];
      assert.deepEqual(after, before, section);
    }
    assert.deepEqual(totals(converted), totals(quote));
    assert.equal(buildMajorProjectMetrics(converted).recurringRevenue, 310);
    assert.equal(buildMajorProjectMetrics(converted).validation.valid, true);
    assert.ok(!getCustomerQuoteContent(converted).warnings.some((warning) => warning.includes("budgetary")), "final installation stays final");
    const saved = deserializeQuoteRecord(serializeQuoteRecord(converted))!;
    assert.deepEqual(totals(applyMajorProjectToQuote(saved)), totals(quote));
    assert.deepEqual(JSON.parse(JSON.stringify(saved.majorProject.options)), JSON.parse(JSON.stringify(converted.majorProject.options)));
  });
}

test("lease conversion retains hardware cost basis, term, margin, agreement, and monthly totals", () => {
  const quote = quickQuote();
  Object.assign(quote.metadata, { quoteType: "lease", leaseTermMonths: 6, leaseMarginPercent: 35, hasActiveDataAgreement: true });
  const converted = convertQuickQuoteToMajorProject(quote);
  assert.deepEqual(totals(converted), totals(quote));
  assert.equal(converted.commercial.costs.oneTimeEquipmentCost, 700);
  assert.deepEqual(totals(applyMajorProjectToQuote(converted)), totals(quote));
});

test("switching modes repeatedly is idempotent and keeps edited Major components", () => {
  let converted = convertQuickQuoteToMajorProject(quickQuote());
  const option = getActiveMajorProjectOption(converted)!;
  const kit = option.components!.find((row) => row.id === "kit")!;
  kit.quantity = 3;
  kit.customerExtendedPrice = 1800;
  converted = applyMajorProjectToQuote(converted);
  const before = structuredClone(converted);
  for (let index = 0; index < 3; index += 1) {
    converted.metadata.workflowMode = "quick_quote";
    converted = convertQuickQuoteToMajorProject(deserializeQuoteRecord(serializeQuoteRecord(converted))!);
    assert.equal(converted.majorProject.options.length, 1);
    assert.deepEqual(totals(converted), totals(before));
    assert.equal(getActiveMajorProjectOption(converted)!.components!.find((row) => row.id === "kit")!.quantity, 3);
  }
  assert.deepEqual(convertQuickQuoteToMajorProject(converted), converted);
});

test("Quick Quote edits are imported into a new option without overwriting existing Major work", () => {
  const quote = convertQuickQuoteToMajorProject(quickQuote());
  const originalOption = structuredClone(getActiveMajorProjectOption(quote));
  quote.metadata.workflowMode = "quick_quote";
  quote.sections.sectionB.lineItems[0].unitPrice = 650;
  quote.sections.sectionB.lineItems[0].totalPrice = 1300;
  const converted = convertQuickQuoteToMajorProject(quote);
  assert.equal(converted.majorProject.options.length, 2);
  assert.deepEqual(converted.majorProject.options[0], originalOption);
  assert.equal(getEquipmentTotal(converted), 1300);
  assert.equal(getActiveMajorProjectOption(converted)!.components!.filter((row) => row.id === "kit").length, 1);
});

test("disabled sections and inactive pricing rows stay stored without becoming charges", () => {
  const quote = quickQuote();
  quote.sections.sectionB.enabled = false;
  quote.sections.sectionC.enabled = false;
  const converted = convertQuickQuoteToMajorProject(quote);
  assert.deepEqual(converted.sections.sectionB, quote.sections.sectionB);
  assert.deepEqual(converted.sections.sectionC, quote.sections.sectionC);
  assert.deepEqual(converted.sections.sectionA.perKitRows, quote.sections.sectionA.perKitRows);
  assert.equal(getEquipmentTotal(converted), 0);
  assert.equal(getOptionalServicesTotal(converted), 0);
  assert.ok(!getActiveMajorProjectOption(converted)!.components!.some((row) => row.quickQuoteSource?.section === "sectionB"));
});

test("zero-priced, zero-quantity, and credit items are not dropped or repriced", () => {
  const quote = quickQuote();
  quote.sections.sectionB.lineItems.push(
    { id: "included-hardware", sourceType: "custom", itemName: "Included mount", quantity: 1, unitPrice: 0, totalPrice: 0 },
    { id: "zero-qty", sourceType: "custom", itemName: "Pending site", quantity: 0, unitPrice: 100, totalPrice: 0 },
    { id: "credit", sourceType: "custom", itemName: "Equipment credit", quantity: 1, unitPrice: -50, totalPrice: -50 },
  );
  const converted = convertQuickQuoteToMajorProject(quote);
  assert.deepEqual(converted.sections.sectionB.lineItems, quote.sections.sectionB.lineItems);
  assert.deepEqual(totals(converted), totals(quote));
  assert.equal(getActiveMajorProjectOption(converted)!.components!.find((row) => row.id === "zero-qty")!.quantity, 0);
});

test("annual subscriptions originally in Section A remain annual and are never duplicated", () => {
  const quote = quickQuote();
  quote.sections.sectionA.poolRows.push({ id: "annual-data", rowType: "service", description: "Annual plan", quantity: 1, monthlyRate: 600, totalMonthlyRate: 600, billing: { cadence: "annual" } });
  const converted = convertQuickQuoteToMajorProject(quote);
  assert.deepEqual(totals(converted), totals(quote));
  assert.ok(!converted.sections.sectionC.lineItems.some((row) => row.id === "annual-data"));
  assert.equal(converted.sections.sectionA.computed.monthlyRecurringTotal, 310);
});

test("Major edits retain usage-based overages, original row details, and final service status", () => {
  const converted = convertQuickQuoteToMajorProject(quickQuote());
  const components = getActiveMajorProjectOption(converted)!.components!;
  const overage = components.find((row) => row.id === "overage")!;
  overage.customerUnitPrice = 0.9;
  overage.customerExtendedPrice = 0.9;
  const kit = components.find((row) => row.id === "kit")!;
  kit.customerFacingLabel = "Updated kit";
  kit.notes = "Revised hardware description";
  kit.quantity = 3;
  kit.customerExtendedPrice = 1800;
  const updated = applyMajorProjectToQuote(converted);
  assert.equal(buildMajorProjectMetrics(updated).recurringRevenue, 310);
  assert.equal(getRecurringMonthlyTotal(updated), 310);
  assert.equal(updated.sections.sectionA.poolRows.find((row) => row.id === "overage")!.monthlyRate, 0.9);
  assert.equal(updated.sections.sectionB.lineItems[0].partNumber, "KIT-001");
  assert.equal(updated.sections.sectionB.lineItems[0].description, "Revised hardware description");
  assert.equal(updated.sections.sectionB.lineItems[0].itemName, "Updated kit");
  assert.equal(updated.sections.sectionB.lineItems[0].quantity, 3);
  assert.equal(updated.sections.sectionC.lineItems[0].pricingStage, "final");
});

test("new Major items can be added and imported items removed without restoring old charges", () => {
  let converted = convertQuickQuoteToMajorProject(quickQuote());
  const option = getActiveMajorProjectOption(converted)!;
  const kit = option.components!.find((row) => row.id === "kit")!;
  option.components!.push({ ...kit, id: "new-camera", quickQuoteSource: undefined, internalName: "New camera", quantity: 1, customerUnitPrice: 350, customerExtendedPrice: 350 });
  converted = applyMajorProjectToQuote(converted);
  assert.equal(getEquipmentTotal(converted), 1550);
  assert.equal(getRecurringMonthlyTotal(converted), 310);
  const active = getActiveMajorProjectOption(converted)!;
  active.components = active.components!.filter((row) => row.id !== "kit");
  converted = applyMajorProjectToQuote(deserializeQuoteRecord(serializeQuoteRecord(converted))!);
  assert.equal(getEquipmentTotal(converted), 350);
  assert.ok(!converted.sections.sectionB.lineItems.some((row) => row.id === "kit"));
});

test("renaming an imported component updates its customer label and attachments stay associated", () => {
  const quote = quickQuote();
  quote.sections.sectionA.poolRows.push({ id: "annual-data", rowType: "service", description: "Annual plan", monthlyRate: 600, totalMonthlyRate: 600, billing: { cadence: "annual" } });
  const converted = convertQuickQuoteToMajorProject(quote);
  const components = getActiveMajorProjectOption(converted)!.components!;
  const kit = components.find((row) => row.id === "kit")!;
  kit.internalName = "Updated Starlink kit";
  for (const id of ["kit", "included", "annual-data"]) {
    components.find((row) => row.id === id)!.specSheetAttachment = { storageKey: `qa-${id}`, fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 100, updatedAt: new Date().toISOString() };
  }
  const updated = applyMajorProjectToQuote(converted);
  assert.equal(updated.sections.sectionB.lineItems[0].itemName, "Updated Starlink kit");
  assert.deepEqual(getProposalAttachments(updated).map((entry) => entry.itemLabels), [["Portal access"], ["Updated Starlink kit"], ["Annual plan"]]);
});

test("empty quotes convert without adding default prices or losing empty and disabled data", () => {
  const quote = createBlankQuoteRecord();
  const converted = convertQuickQuoteToMajorProject(quote);
  assert.deepEqual(totals(converted), totals(quote));
  assert.equal(getActiveMajorProjectOption(converted)!.components!.length, 0);
  assert.equal(converted.metadata.workflowMode, "major_project");
});

test("renaming a legacy annual subscription cannot silently turn it into a one-time charge", () => {
  const quote = quickQuote();
  quote.sections.sectionB.lineItems.push({ id: "legacy-board", sourceType: "custom", itemName: "OS-Board", quantity: 1, unitPrice: 1350, totalPrice: 1350 });
  const converted = convertQuickQuoteToMajorProject(quote);
  getActiveMajorProjectOption(converted)!.components!.find((row) => row.id === "legacy-board")!.internalName = "Annual dashboard subscription";
  const updated = applyMajorProjectToQuote(converted);
  assert.equal(getAnnualSubscriptionSummary(updated).firstYearTotal, 1600);
  assert.equal(getEquipmentTotal(updated), 1200);
  assert.equal(updated.sections.sectionB.lineItems.find((row) => row.id === "legacy-board")!.billing?.cadence, "annual");
});

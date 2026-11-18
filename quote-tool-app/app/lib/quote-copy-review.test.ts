import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord } from "./quote-template";
import { applyQuoteCopyReview, getQuoteCopyScopeItems, getQuoteCopySupportingAttachments, getQuoteCopyTerms, type QuoteCopyReviewOptions } from "./quote-copy-review";
import { createProposalCopy, createProposalFromQuote, PROPOSAL_STORE_KEY, serializeProposalStore } from "./proposal-store";
import { assertProposalRevision, getProposalRevision, markProposalDeleted, readWorkspaceStore, saveProposalToWorkspace } from "./proposal-saving";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, convertQuickQuoteToMajorProject, ensureMajorProjectState } from "./major-project";
import { deserializeQuoteRecord } from "./proposal-state";
import type { MajorProjectComponent, MajorProjectOption, MajorProjectSpecAttachment, QuoteRecord } from "./quote-record";

function attachment(name: string): MajorProjectSpecAttachment {
  return { fileName: name, storageKey: `spec:${name}`, mimeType: "application/pdf", sizeBytes: 123, updatedAt: "2026-11-17T00:00:00Z" };
}
function sourceQuote() {
  const quote = createBlankQuoteRecord();
  quote.metadata.documentTitle = "Original Customer network";
  quote.metadata.documentSubtitle = "Customer-specific subtitle";
  quote.metadata.customerShortName = "OriginalCo";
  quote.metadata.accountId = "account-old";
  quote.metadata.accountName = "Original Customer";
  quote.metadata.opportunityId = "deal-old";
  quote.metadata.opportunityName = "Original opportunity";
  quote.metadata.hasActiveDataAgreement = true;
  quote.metadata.salesTaxAmount = 80;
  quote.metadata.status = "approved";
  quote.metadata.expirationDate = "2000-01-01";
  quote.customer = { name: "Original Customer", logoText: "OriginalCo", logoDataUrl: "data:image/png;base64,old", contactName: "Original Contact", contactPhone: "555-1234", contactEmail: "original@example.test", addressLines: ["100 Old Road"] };
  quote.billTo = { companyName: quote.customer.name, attention: quote.customer.contactName, lines: ["Billing address"] };
  quote.shipTo = { companyName: quote.customer.name, attention: "Old shipping contact", lines: ["Shipping address"] };
  quote.internal.savedCustomerProfileId = "customer-profile-old";
  quote.internal.internalNotes = "Customer-specific internal note";
  quote.serviceAgreement.sourceCustomerProfileId = "customer-profile-old";
  quote.serviceAgreement.sourceCustomerProfileName = quote.customer.name;
  quote.serviceAgreement.profile.agreementLabel = "Original Customer SLA";
  quote.serviceAgreement.profile.sourceDocument = { fileName: "Signed agreement.pdf", fileUrl: "https://example.test/agreement", note: "Signed" };
  quote.serviceAgreement.profile.signedDate = "2026-09-01";
  quote.serviceAgreement.profile.acceptedDate = "2026-09-01";
  quote.serviceAgreement.profile.categories[0].laborRate = 95;
  quote.serviceAgreement.profile.notes = "Special customer SLA notes";
  quote.customerOutput = { paymentTerms: "Original Customer Net 60", shipsActivated: "yes", commercialConfirmation: "confirmed-old", fieldServiceConfirmation: "field-old", leaseEndTerms: "Customer lease end", postLeaseTerms: "Customer post lease", deliveryLeadTime: "Customer-specific lead time", billingStart: "Customer start date" };
  quote.orderProcessing = { terminals: ["Original Station"], terminalsStatus: "listed", shippingRequired: "yes", shippingContactPhone: "555-9090", overageOptIn: "yes", dataPlanDetails: "Old data", monitoringSupportDetails: "Old support", terminalAccessFeeDetails: "Old TAF", miscellaneousChargesNotes: "Old misc", notes: "Original customer order" };
  quote.executiveSummary = { enabled: true, heading: "Old heading", customerContext: "Old context", body: "Old body", paragraphs: ["Old prose"], blocks: [{ id: "old", type: "paragraph", text: "Old text" }] };
  quote.customFields = [{ id: "old", label: "Opportunity", value: "Old value", visibility: "customer" }];
  quote.terms = { selectedPackageKey: "starlink_plus_integration", generalStarlinkServiceTermsTitle: "Starlink terms", generalStarlinkServiceTerms: ["Satellite terms must be reviewed.", "Original Customer special agreement."], pricingTermsTitle: "Commercial terms", pricingTerms: ["Generic payment terms.", "OriginalCo special pricing."] };
  quote.approval.approvalNote = "Old approval note";
  quote.warranty.enabled = true;
  quote.warranty.coverageNote = "Old customer warranty";
  quote.majorProject.summary.paymentTerms = "Old payment terms";
  quote.majorProject.summary.assumptions = "Old assumptions";
  quote.majorProject.summary.billingStart = "Old billing start";
  quote.majorProject.summary.systemDrawings = [attachment("Site drawing.pdf")];
  quote.majorProject.bomImport = { fileName: "Original BOM.xlsx", sizeBytes: 100, capturedAt: "old", source: "picker", status: "loaded", reviewState: "pending" };
  quote.integrations.quoteReferences = { account: { provider: "salesforce", entityType: "account", externalId: "old-account" }, quote: { provider: "salesforce", entityType: "quote", externalId: "old-quote" } };
  quote.proForma = { reference: "old-invoice", issueDate: "2026-01-01", customerPo: "Old PO", billingPeriod: "Old", notes: "Old invoice notes" };
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [{ id: "monthly", rowType: "service", description: "Cellular", quantity: 1, totalMonthlyRate: 20, unitPrice: 20, billing: { cadence: "monthly" }, specSheetLabel: "Service spec" }];
  quote.sections.sectionA.perKitRows = [{ id: "inactive", rowType: "service", description: "Inactive satellite", quantity: 1, totalMonthlyRate: 50 }];
  quote.sections.sectionA.introText = "Old service intro";
  quote.sections.sectionA.explanatoryParagraphs = ["Old satellite paragraph"];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.introText = "Old equipment intro";
  quote.sections.sectionB.lineItems = [{ id: "hardware", sourceType: "custom", itemName: "Radar", quantity: 2, unitPrice: 100, totalPrice: 200, description: "Technical scope", specSheetLabel: "Radar spec" }];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.introText = "Old implementation intro";
  quote.sections.sectionC.lineItems = [{ id: "annual", sourceType: "custom", description: "Annual cloud", quantity: 1, unitPrice: 120, totalPrice: 120, billing: { cadence: "annual", startsYear: 2 }, specSheetLabel: "Cloud spec" }];
  return quote;
}

function review(quote: QuoteRecord, overrides: Partial<QuoteCopyReviewOptions> = {}): QuoteCopyReviewOptions {
  return { customerMode: "same", keptScopeKeys: getQuoteCopyScopeItems(quote).map((item) => item.key), terms: "keep", attachments: "keep", supportingAttachments: "keep", ...overrides };
}
function component(id: string, cadence: "one_time" | "monthly" | "annual" = "one_time"): MajorProjectComponent {
  return { id, internalName: id, customerFacingLabel: id, vendor: "OEM", category: "Equipment", lineType: cadence === "one_time" ? "hardware" : "subscription", quantity: 2, unit: "ea", customerUnitPrice: 100, customerExtendedPrice: 200, vendorUnitCost: 50, vendorExtendedCost: 100, schedule: cadence === "monthly" ? "recurring" : "one_time", billing: { cadence, ...(cadence === "annual" ? { startsYear: 2 } : {}) }, costBasis: "vendor_quote", resaleBasis: "fixed_fee", passThrough: false, specSheetAttachment: attachment(`${id}.pdf`), specSheetLocation: `https://example.test/${id}`, specSheetLabel: `${id} spec` };
}
function majorQuote() {
  const quote = sourceQuote();
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.enabled = true;
  const option = (id: string): MajorProjectOption => ({
    ...quote.majorProject.options[0], id, label: `Option ${id}`, description: "Old site scope",
    components: [component("radar"), component("cellular", "monthly"), component("cloud", "annual")].map((item) => ({ ...item, bundleAssignmentId: `bundle-${item.id}`, importSource: { type: "vendor_quote", importId: `vendor-${item.id}`, fileName: `${item.id}-vendor.pdf` } })),
    bundles: ["radar", "cellular", "cloud"].map((id) => ({ id: `bundle-${id}`, internalName: id, customerFacingLabel: id, componentIds: [id], includedCostComponentIds: [id], includedRevenueComponentIds: [id], specSheetAttachment: attachment(`${id}-bundle.pdf`) })),
    customerQuoteLines: ["radar", "cellular", "cloud"].map((id) => ({ id: `line-${id}`, label: id, bundleIds: [`bundle-${id}`], includedCostComponentIds: [id], includedRevenueComponentIds: [id], specSheetAttachment: attachment(`${id}-line.pdf`) })),
    vendorQuotes: ["radar", "cellular", "cloud"].map((id) => ({ id: `vendor-${id}`, fileName: `${id}-vendor.pdf`, sizeBytes: 1, capturedAt: "old", source: "picker", status: "loaded", importedComponentIds: [id] })),
  });
  quote.majorProject.options = [option("one"), option("two")];
  quote.majorProject.activeOptionId = "one";
  return quote;
}

test("same-customer review keeps selected scope and profiles without mutating the source", () => {
  const quote = sourceQuote();
  const original = structuredClone(quote);
  const copy = applyQuoteCopyReview(quote, review(quote));
  assert.deepEqual(copy.customer, quote.customer);
  assert.equal(copy.internal.savedCustomerProfileId, "customer-profile-old");
  assert.equal(copy.serviceAgreement.sourceCustomerProfileId, "customer-profile-old");
  assert.equal(copy.sections.sectionB.lineItems[0].totalPrice, 200);
  assert.deepEqual(copy.sections.sectionC.lineItems[0].billing, { cadence: "annual", startsYear: 2 });
  copy.customer.addressLines.push("New address");
  copy.sections.sectionB.lineItems[0].unitPrice = 999;
  assert.deepEqual(quote, original);
});

test("different-customer copies clear identity, SLA, confirmations and stale prose without changing selected economics", () => {
  const source = majorQuote();
  const saved = createProposalFromQuote({ quote: source });
  const before = structuredClone(saved);
  const copied = createProposalCopy({ proposal: saved, review: review(source, { customerMode: "different" }) });
  const quote = copied.quote;
  assert.deepEqual(quote.customer, { name: "", contactName: "", contactPhone: "", contactEmail: "", addressLines: [] });
  assert.deepEqual(quote.billTo, { lines: [] });
  assert.deepEqual(quote.shipTo, { lines: [] });
  assert.equal(quote.internal.savedCustomerProfileId, undefined);
  assert.equal(quote.serviceAgreement.sourceCustomerProfileId, undefined);
  assert.equal(quote.serviceAgreement.useCustomerDefaults, false);
  assert.equal(quote.serviceAgreement.profile.categories[0].laborRate, null);
  assert.equal(quote.serviceAgreement.profile.signedDate, "");
  assert.equal(quote.serviceAgreement.profile.sourceDocument, undefined);
  assert.equal(quote.metadata.hasActiveDataAgreement, false);
  assert.equal(quote.metadata.salesTaxAmount, 0);
  assert.equal(quote.metadata.customerShortName, "");
  assert.equal(quote.metadata.accountId, undefined);
  assert.equal(quote.metadata.opportunityName, undefined);
  assert.equal(quote.orderProcessing?.overageOptIn, "pending");
  assert.equal(quote.orderProcessing?.requirements?.corporatePricing, "pending");
  assert.deepEqual(quote.orderProcessing?.terminals, []);
  assert.equal(quote.customerOutput?.commercialConfirmation, undefined);
  assert.equal(quote.customerOutput?.fieldServiceConfirmation, undefined);
  assert.equal(quote.customerOutput?.paymentTerms, undefined);
  assert.equal(quote.executiveSummary.body, "");
  assert.deepEqual(quote.customFields, []);
  assert.equal(quote.majorProject.summary.assumptions, "");
  assert.equal(quote.majorProject.bomImport, undefined);
  assert.equal(quote.majorProject.options[0].description, "");
  assert.deepEqual(quote.majorProject.options[0].vendorQuotes, []);
  assert.equal(quote.majorProject.options[0].components?.[0].importSource, undefined);
  assert.equal(quote.majorProject.options[0].components?.[0].vendorExtendedCost, 100);
  assert.equal(quote.majorProject.options[1].components?.[2].billing?.startsYear, 2);
  assert.deepEqual(quote.integrations.quoteReferences, {});
  assert.equal(quote.governance?.sourceMode, "standalone_first");
  assert.equal(quote.governance?.accountKey, undefined);
  assert.equal(quote.governance?.opportunityKey, undefined);
  assert.equal(quote.metadata.documentTitle, "New customer quote");
  assert.deepEqual(quote.terms.generalStarlinkServiceTerms, ["Satellite terms must be reviewed."]);
  assert.deepEqual(quote.terms.pricingTerms, ["Generic payment terms."]);
  assert.notEqual(copied.id, saved.id);
  assert.notEqual(quote.metadata.proposalNumber, source.metadata.proposalNumber);
  assert.equal(quote.metadata.status, "draft");
  assert.equal(copied.status, "draft");
  assert.equal(copied.recordVersion, 1);
  assert.equal(quote.revisionHistory.length, 1);
  assert.equal(quote.proForma, undefined);
  assert.equal(quote.metadata.expirationDate, undefined);
  assert.deepEqual(saved, before);
});

test("terms and attachments require explicit valid decisions", () => {
  const quote = sourceQuote();
  for (const field of ["terms", "attachments", "supportingAttachments"] as const) {
    assert.throws(() => applyQuoteCopyReview(quote, { ...review(quote), [field]: "" } as QuoteCopyReviewOptions), /Choose/);
  }
  assert.throws(() => applyQuoteCopyReview(quote, review(quote, { keptScopeKeys: ["stale"] })), /source scope changed/);
  assert.ok(getQuoteCopyTerms(quote).includes("Old satellite paragraph"));
  assert.ok(getQuoteCopySupportingAttachments(quote).includes("Original BOM.xlsx"));
});

for (const terms of ["keep", "remove"] as const) for (const attachments of ["keep", "remove"] as const) for (const supportingAttachments of ["keep", "remove"] as const) {
  test(`explicit retention choices: terms=${terms}, specs=${attachments}, supporting=${supportingAttachments}`, () => {
    const source = majorQuote();
    const quote = applyQuoteCopyReview(source, review(source, { terms, attachments, supportingAttachments }));
    assert.equal(quote.terms.generalStarlinkServiceTerms.length > 0, terms === "keep");
    assert.equal(quote.majorProject.summary.assumptions.length > 0, terms === "keep");
    assert.equal(Boolean(quote.warranty.enabled), terms === "keep");
    assert.equal(Boolean(quote.approval.approvalNote), terms === "keep");
    assert.equal(Boolean(quote.serviceAgreement.profile.agreementLabel), terms === "keep");
    assert.equal(Boolean(quote.serviceAgreement.profile.sourceDocument), terms === "keep" && supportingAttachments === "keep");
    for (const option of quote.majorProject.options) for (const items of [option.components, option.bundles, option.customerQuoteLines]) for (const item of items ?? []) {
      assert.equal(Boolean(item.specSheetAttachment), attachments === "keep");
      if (attachments === "remove") { assert.equal(Boolean(item.specSheetLabel), false); assert.equal(Boolean(item.specSheetLocation), false); }
    }
    assert.equal(Boolean(quote.majorProject.summary.systemDrawings?.length), supportingAttachments === "keep");
    assert.equal(Boolean(quote.majorProject.bomImport), supportingAttachments === "keep");
    assert.equal(Boolean(quote.majorProject.options[0].vendorQuotes?.length), supportingAttachments === "keep");
    if (terms === "remove") {
      assert.equal(quote.terms.selectedPackageKey, undefined);
      assert.equal(quote.customerOutput?.paymentTerms, undefined);
      assert.equal(quote.sections.sectionA.introText, "");
      assert.deepEqual(quote.sections.sectionA.explanatoryParagraphs, []);
    }
  });
}

test("removing components prunes bundles, customer lines and supplier references in every project option", () => {
  const source = majorQuote();
  const keys = getQuoteCopyScopeItems(source).filter((item) => item.label === "cloud").map((item) => item.key);
  const quote = applyQuoteCopyReview(source, review(source, { keptScopeKeys: keys }));
  for (const option of quote.majorProject.options) {
    assert.deepEqual(option.components?.map((item) => item.id), ["cloud"]);
    assert.deepEqual(option.bundles?.map((item) => item.id), ["bundle-cloud"]);
    assert.deepEqual(option.customerQuoteLines?.map((item) => item.id), ["line-cloud"]);
    assert.deepEqual(option.vendorQuotes?.map((item) => item.id), ["vendor-cloud"]);
    assert.equal(option.components?.[0].billing?.startsYear, 2);
    const projected = applyMajorProjectToQuote({ ...quote, majorProject: { ...quote.majorProject, activeOptionId: option.id } });
    assert.equal(buildMajorProjectMetrics(projected).recurringRevenue, 0);
    assert.equal(buildMajorProjectMetrics(projected).annualRenewalRevenue, 200);
    assert.equal(projected.sections.sectionB.lineItems.length, 0);
  }
});

test("partial package cleanup keeps surviving references but removes shared package specs", () => {
  const source = majorQuote();
  const option = source.majorProject.options[0];
  option.bundles = [{ id: "mixed", internalName: "package", customerFacingLabel: "package", componentIds: ["radar", "cellular"], includedCostComponentIds: ["radar", "cellular"], includedRevenueComponentIds: ["radar", "cellular"], specSheetAttachment: attachment("Full package.pdf") }];
  option.components!.forEach((item) => { item.bundleAssignmentId = item.id === "cloud" ? undefined : "mixed"; });
  option.customerQuoteLines = [{ id: "mixed-line", label: "Package", bundleIds: ["mixed"], specSheetAttachment: attachment("Package line.pdf") }];
  const keys = getQuoteCopyScopeItems(source).filter((item) => item.label !== "radar").map((item) => item.key);
  const quote = applyQuoteCopyReview(source, review(source, { keptScopeKeys: keys }));
  assert.deepEqual(quote.majorProject.options[0].bundles?.[0].componentIds, ["cellular"]);
  assert.equal(quote.majorProject.options[0].bundles?.[0].specSheetAttachment, undefined);
  assert.deepEqual(quote.majorProject.options[0].customerQuoteLines?.[0].includedRevenueComponentIds, ["cellular"]);
  assert.equal(quote.majorProject.options[0].customerQuoteLines?.[0].specSheetAttachment, undefined);
});

test("empty explicit subsets cannot broaden to unrelated bundle economics", () => {
  const source = majorQuote();
  source.majorProject.options[0].bundles![0].componentIds = ["radar", "cellular"];
  const quote = applyQuoteCopyReview(source, review(source, { keptScopeKeys: getQuoteCopyScopeItems(source).filter((item) => item.label !== "radar").map((item) => item.key) }));
  assert.ok(!quote.majorProject.options[0].bundles?.some((item) => item.id === "bundle-radar"));
  assert.ok(!quote.majorProject.options[0].customerQuoteLines?.some((item) => item.id === "line-radar"));
});

test("simple-row mirrors and their uploaded specs are removed together", () => {
  const source = majorQuote();
  source.majorProject.options = [{ ...source.majorProject.options[0], components: [], bundles: [], customerQuoteLines: [], simpleRows: ["keep", "remove"].map((id) => ({ id, label: id, bucket: "hardware", quantity: 1, customerUnitPrice: 50, customerExtendedPrice: 50, ourUnitCost: 20, ourExtendedCost: 20, specSheetAttachment: attachment(`${id}.pdf`) })) }];
  const quote = applyQuoteCopyReview(source, review(source, { keptScopeKeys: getQuoteCopyScopeItems(source).filter((item) => item.label === "keep").map((item) => item.key) }));
  assert.deepEqual(quote.majorProject.options[0].simpleRows?.map((item) => item.id), ["keep"]);
  assert.deepEqual(quote.majorProject.options[0].components?.map((item) => item.id), ["quick-builder-component-keep"]);
  assert.equal(quote.majorProject.options[0].customerQuoteLines?.length, 1);
});

test("Quick Quote snapshots do not restore removed equipment, inactive services or source terms", () => {
  const source = convertQuickQuoteToMajorProject(sourceQuote());
  const keep = getQuoteCopyScopeItems(source).filter((item) => item.label === "Annual cloud").map((item) => item.key);
  const quote = applyQuoteCopyReview(source, review(source, { keptScopeKeys: keep, terms: "remove", attachments: "remove" }));
  const option = quote.majorProject.options.find((item) => item.id === quote.majorProject.activeOptionId)!;
  assert.equal(option.components?.length, 1);
  assert.equal(option.quickQuoteSource?.sections.sectionB.lineItems.length, 0);
  assert.equal(option.quickQuoteSource?.sections.sectionA.perKitRows.length, 0);
  assert.equal(option.quickQuoteSource?.sections.sectionC.lineItems[0].specSheetLabel, undefined);
  assert.equal(option.quickQuoteSource?.sections.sectionA.introText, "");
  const restored = deserializeQuoteRecord(JSON.stringify(quote));
  assert.ok(restored);
  const projected = applyMajorProjectToQuote(restored);
  assert.equal(projected.sections.sectionB.lineItems.length, 0);
  assert.equal(projected.sections.sectionC.lineItems[0].billing?.startsYear, 2);
  assert.equal(projected.sections.sectionA.introText, "");
});

test("zero selection creates a clean draft, including hidden options and project charges", () => {
  for (const source of [sourceQuote(), majorQuote(), convertQuickQuoteToMajorProject(sourceQuote())]) {
    source.majorProject.commercial.terminalFeePerSite = 15;
    source.majorProject.commercial.overageRatePerGb = 2;
    const quote = applyQuoteCopyReview(source, review(source, { keptScopeKeys: [], terms: "remove", attachments: "remove", supportingAttachments: "remove" }));
    assert.equal(quote.sections.sectionA.poolRows.length + quote.sections.sectionA.perKitRows.length + quote.sections.sectionB.lineItems.length + quote.sections.sectionC.lineItems.length, 0);
    for (const option of ensureMajorProjectState(quote).majorProject.options) {
      assert.equal(option.components?.length, 0);
      assert.equal(option.bundles?.length, 0);
      assert.equal(option.customerQuoteLines?.length, 0);
      assert.equal(option.simpleRows?.length, 0);
    }
    assert.equal(buildMajorProjectMetrics(quote).totalContractRevenue, 0);
  }
});

test("copy saving verifies disk, preserves source/customer profiles, and detects stale or deleted sources", () => {
  const source = createProposalFromQuote({ quote: sourceQuote() });
  const store = { currentUser: source.owner, users: [source.owner], proposals: [source] };
  const values = new Map([[PROPOSAL_STORE_KEY, serializeProposalStore(store)], ["customer-profiles", "original profiles"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const revision = getProposalRevision(source);
  assertProposalRevision(storage, source.id, revision);
  const copy = createProposalCopy({ proposal: source, review: review(source.quote, { customerMode: "different" }) });
  saveProposalToWorkspace(storage, store, copy, { expectedRevision: null });
  assert.equal(readWorkspaceStore(storage)?.proposals.length, 2);
  assert.equal(values.get("customer-profiles"), "original profiles");
  assert.equal(getProposalRevision(readWorkspaceStore(storage)?.proposals.find((item) => item.id === source.id)), revision);
  assert.throws(() => saveProposalToWorkspace({ ...storage, setItem: () => { throw new Error("Quota exceeded"); } }, store, createProposalCopy({ proposal: source })), /Quota exceeded/);
  assert.throws(() => saveProposalToWorkspace({ ...storage, setItem: () => {} }, store, createProposalCopy({ proposal: source })), /could not be verified/);
  const changed = readWorkspaceStore(storage)!;
  changed.proposals.find((item) => item.id === source.id)!.quote.metadata.documentTitle = "Changed elsewhere";
  storage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(changed));
  assert.throws(() => assertProposalRevision(storage, source.id, revision), /changed in another tab/);
  markProposalDeleted(storage, source.id);
  assert.throws(() => assertProposalRevision(storage, source.id, revision), /deleted in another tab/);
});

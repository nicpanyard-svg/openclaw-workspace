import assert from "node:assert/strict";
import test from "node:test";
import { buildProFormaFileName, buildProFormaInvoice } from "./pro-forma";
import { buildProFormaHtml } from "./pro-forma-html";
import { createProFormaSettings, normalizeProFormaSettings } from "./pro-forma-settings";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { createBlankQuoteRecord } from "./quote-template";
import { createProposalCopy, createProposalFromQuote } from "./proposal-store";
import { finalReviewKey } from "./final-quote-review";
import { getIncludedEquipmentRows } from "./proposal-commercial-summary";
import { applyMajorProjectToQuote } from "./major-project";
import { proFormaFixture, prepareProFormaFixture } from "../../scripts/pro-forma-fixtures";
import { fixtureComponent, fixtureQuote } from "../../scripts/quote-master-fixtures";

test("purchase invoice bills included one-time, first month, Year 1 annual, credit and quoted tax once", () => {
  const quote = proFormaFixture(), original = structuredClone(quote);
  const invoice = buildProFormaInvoice(quote);
  assert.deepEqual(invoice.errors, []);
  assert.equal(invoice.subtotal, 2610);
  assert.equal(invoice.total, 2692.25);
  assert.equal(invoice.monthly, 85);
  assert.equal(invoice.annualRenewal, 1725);
  assert.equal(invoice.lines.find(row => row.id === "annual-sectionB-renewal")?.amount, 0);
  assert.equal(invoice.billTo.address[0], "200 Billing Lane");
  assert.equal(invoice.billTo.contact, "Accounts Payable");
  assert.ok(invoice.optionalExcluded && invoice.usageExcluded);
  assert.doesNotMatch(JSON.stringify(invoice.lines), /optional|Usage-based|INTERNAL_COST_SECRET/i);
  assert.deepEqual(quote, original);
});

for (const term of [3, 6, 9, 12, 24, 36] as const) test(`lease ${term} months does not charge purchased hardware`, () => {
  const quote = proFormaFixture();
  Object.assign(quote.metadata, { quoteType: "lease", hasActiveDataAgreement: true, leaseTermMonths: term, leaseMarginPercent: 25 });
  quote.commercial.costs.oneTimeEquipmentCost = 600;
  quote.customerOutput!.commercialConfirmation = finalReviewKey(quote);
  const invoice = buildProFormaInvoice(quote);
  assert.deepEqual(invoice.errors, []);
  assert.equal(invoice.lines.some(row => row.id === "equipment-camera"), false);
  const lease = Number((800 / term).toFixed(2));
  assert.equal(invoice.monthly, Number((85 + lease).toFixed(2)));
  assert.equal(invoice.total, Number((175 + 1350 + 85 + lease + 82.25).toFixed(2)));
  assert.deepEqual(invoice.leasedEquipment, [{ description: "Outdoor camera", quantity: 2 }]);
  assert.doesNotMatch(buildProFormaHtml(invoice).split("<body>")[1], /600\.00|margin|cost basis|gross profit|vendor/i);
});

test("disabled sections and inactive subscription modes remain excluded", () => {
  const quote = proFormaFixture();
  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.perKitRows = [{ id: "kit", rowType: "service", description: "Per-kit service", quantity: 3, unitPrice: 10, totalMonthlyRate: 30 }];
  quote.sections.sectionB.enabled = false;
  assert.equal(buildProFormaInvoice(quote).total, 287.25);
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionC.enabled = false;
  const invoice = buildProFormaInvoice(quote);
  assert.equal(invoice.total, 82.25);
  assert.ok(invoice.errors.includes("Add at least one included quote item."));
});

test("unknown monthly quantities keep their extended amount and do not invent a unit rate", () => {
  const quote = proFormaFixture();
  quote.sections.sectionA.poolRows[0].quantity = null;
  const line = buildProFormaInvoice(quote).lines.find(row => row.id === "monthly-monthly")!;
  assert.equal(line.quantity, null);
  assert.equal(line.unitPrice, null);
  assert.equal(line.amount, 75);
});

test("Major Project uses the current active option and ignores stale output sections", () => {
  const quote = prepareProFormaFixture(fixtureQuote("RQ-MAJOR-PF", "Major invoice", [fixtureComponent("Gateway", 500, 123)]));
  quote.majorProject.commercial.serviceMix = "managed-network";
  const other = structuredClone(quote.majorProject.options[0]);
  other.id = "alternate"; other.label = "Alternate";
  other.components = [fixtureComponent("Alternate camera", 900, 321)];
  quote.majorProject.options.push(other);
  quote.majorProject.activeOptionId = other.id;
  quote.sections.sectionB.lineItems = [{ id: "stale", itemName: "Stale equipment", sourceType: "custom", quantity: 1, unitPrice: 9999, totalPrice: 9999 }];
  const mapped = applyMajorProjectToQuote(quote);
  for (const row of getIncludedEquipmentRows(mapped)) quote.orderProcessing!.requirements!.equipment[row.id] = { kind: "standalone", assemblyDetails: "" };
  quote.customerOutput!.commercialConfirmation = finalReviewKey(applyMajorProjectToQuote(quote));
  const invoice = buildProFormaInvoice(quote);
  assert.deepEqual(invoice.errors, []);
  assert.equal(invoice.total, 900);
  assert.equal(invoice.lines[0].description, "Alternate camera");
  assert.doesNotMatch(buildProFormaHtml(invoice), /Stale equipment|123\.00|321\.00|QA vendor/);
});

test("invoice metadata round trips with saved quotes; new drafts and copies reset it", () => {
  const quote = proFormaFixture();
  quote.proForma!.customerPo = "PO-001";
  quote.proForma!.notes = "Customer delivery note";
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  assert.deepEqual(restored.proForma, quote.proForma);
  assert.equal(buildProFormaInvoice(restored).total, buildProFormaInvoice(quote).total);
  assert.equal(createBlankQuoteRecord(quote).proForma, undefined);
  const saved = createProposalFromQuote({ quote });
  const copy = createProposalCopy({ proposal: saved });
  assert.equal(copy.quote.proForma, undefined);
  assert.notEqual(createProFormaSettings(copy.quote).reference, quote.proForma!.reference);
});

test("legacy settings are optional and normalization bounds input", () => {
  assert.equal(normalizeProFormaSettings(undefined), undefined);
  assert.equal(normalizeProFormaSettings([]), undefined);
  assert.deepEqual(normalizeProFormaSettings({ issueDate: 12, reference: "X".repeat(1000) }), { reference: "X".repeat(100), issueDate: "", customerPo: "", billingPeriod: "", notes: "" });
});

test("invalid invoice fields, unresolved quote setup, and unconfirmed leases block export", () => {
  const quote = proFormaFixture();
  quote.proForma!.issueDate = "2026-02-30";
  quote.proForma!.reference = " ";
  quote.metadata.quoteType = "lease";
  quote.metadata.hasActiveDataAgreement = false;
  quote.orderProcessing!.shippingRequired = "pending";
  const invoice = buildProFormaInvoice(quote);
  assert.ok(invoice.errors.includes("Enter a valid invoice date."));
  assert.ok(invoice.errors.includes("Enter a pro forma invoice reference."));
  assert.ok(invoice.errors.includes("Confirm the active data agreement for this lease."));
  assert.ok(invoice.errors.includes("Shipping decision"));
  assert.ok(invoice.errors.includes("Confirm the quote details on the Review tab."));
});

test("purchase and lease invoices include blank Sales and Accounting sign-off lines", () => {
  for (const quoteType of ["purchase", "lease"] as const) {
    const quote = proFormaFixture();
    quote.metadata.quoteType = quoteType;
    const html = buildProFormaHtml(buildProFormaInvoice(quote));
    const signoff = html.match(/<section class="signoff"[\s\S]*?<\/section>/)?.[0] ?? "";
    assert.match(signoff, /Internal sign-off/);
    assert.match(signoff, /<strong>Sales<\/strong>/);
    assert.match(signoff, /<strong>Accounting<\/strong>/);
    assert.equal(signoff.match(/<span>Name \/ signature<\/span>/g)?.length, 2);
    assert.equal(signoff.match(/<span>Date<\/span>/g)?.length, 2);
    assert.doesNotMatch(signoff, /Approved|Signed|2026-/);
  }
});

test("HTML escapes customer text and never copies internal calculations or authoring notes", () => {
  const quote = proFormaFixture();
  quote.proForma!.notes = '<script>alert("x")</script>';
  quote.customer.name = "Unsafe <img src=x onerror=alert(1)>";
  quote.billTo.companyName = quote.customer.name;
  quote.internal.crmOwnerLabel = "PRIVATE_OWNER_SECRET";
  const html = buildProFormaHtml(buildProFormaInvoice(quote));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<img src=x|INTERNAL_COST_SECRET|PRIVATE_OWNER_SECRET|target margin|gross profit|vendor cost/i);
  assert.match(html, /PRO FORMA ONLY/);
  assert.match(html, /Future monthly charges and annual renewals are not included/);
  assert.match(buildProFormaFileName(quote), /Camera and Monitoring - RQ-PROFORMA-TEST - Pro Forma Invoice\.pdf$/);
  assert.doesNotMatch(buildProFormaFileName(quote), /[<>:"/\\|?*]/);
});

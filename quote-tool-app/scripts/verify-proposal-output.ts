import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyMajorProjectToQuote } from "../app/lib/major-project";
import { getProposalAttachments } from "../app/lib/proposal-attachments";
import {
  getCombinedOneTimeTotal,
  getEquipmentTotal,
  getIncludedEquipmentRows,
  getIncludedSectionARows,
  getIncludedServiceRows,
  getLeasePricingSummary,
  getOptionalServicesTotal,
  getProposalOptionCostSummary,
  getRecurringMonthlyTotal,
} from "../app/lib/proposal-commercial-summary";
import { getCustomerQuoteContent } from "../app/lib/proposal-customer-content";
import { cacheProposalPdfQuote } from "../app/lib/proposal-pdf-cache";
import { assembleFinalProposalPdf } from "../app/lib/proposal-spec-pdf-assembly";
import { deserializeQuoteRecord, serializeQuoteRecord } from "../app/lib/proposal-state";
import type { MajorProjectComponent, MajorProjectSpecAttachment, QuoteRecord } from "../app/lib/quote-record";
import { createBlankQuoteRecord } from "../app/lib/quote-template";

// Run from the repository with tsx. Only synthetic QA records are posted; no store is saved.
const BASE_URL = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
const OUTPUT_DIR = process.env.PROPOSAL_QA_OUTPUT_DIR || path.resolve("output/pdf");
const QA_DATE = "September 6, 2026";

type Totals = {
  recurring: number;
  equipment: number;
  fieldServices: number;
  equipmentLeaseMonthly: number;
  monthly: number;
  upfront: number;
  optionalMonthly: number;
  optionalOneTime: number;
};
type AttachmentFixture = {
  attachment: MajorProjectSpecAttachment;
  blob: Blob;
  markers: string[];
  itemLabels: string[];
};
type Fixture = {
  quote: QuoteRecord;
  expected: Totals;
  equipmentCount: number;
  attachments: AttachmentFixture[];
};
type PdfPageText = {
  text: string;
  items: Array<{ text: string; transform: number[]; width: number; height: number }>;
};
type Check = (name: string, verify: () => void) => void;

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const amounts = (text: string) => text.match(/-?\$[\d,]+\.\d{2,4}/g) ?? [];

function normalize(quote: QuoteRecord) {
  const normalized = deserializeQuoteRecord(serializeQuoteRecord(quote));
  assert.ok(normalized, "QA quote must survive raw-state save/reload normalization");
  assert.ok(normalized.internal.quoteId.startsWith("QA-"));
  assert.equal(normalized.internal.savedProposalId, normalized.internal.quoteId);
  assert.equal(normalized.metadata.proposalNumber, normalized.internal.quoteId);
  return normalized;
}

function simpleQuote(id: string, lease = false): QuoteRecord {
  const quote = createBlankQuoteRecord();
  Object.assign(quote.metadata, {
    proposalNumber: id, proposalDate: QA_DATE, revisionVersion: "QA-1", expirationDate: "October 6, 2026",
    companyKey: "inet", outputTemplateKey: "inet_proposal", customerShortName: "QA Riverbend",
    accountId: "QA-ACCOUNT-RIVERBEND", accountName: "QA Riverbend Operations", status: "approved",
    quoteType: lease ? "lease" : "purchase", leaseTermMonths: 3, leaseMarginPercent: 35,
    hasActiveDataAgreement: true, currencyCode: "USD", salesTaxAmount: 0,
    documentTitle: lease ? "QA - Riverbend Short-Term Connectivity" : "QA - Riverbend Site Connectivity",
    documentSubtitle: "Synthetic QA fixture - not for ordering.",
  });
  Object.assign(quote.internal, {
    quoteId: id, savedProposalId: id, savedCustomerProfileId: "QA-CUSTOMER-RIVERBEND",
    quoteStatus: "approved", internalNotes: "QA-INTERNAL-NOTES-DO-NOT-PRINT",
  });
  if (quote.governance) Object.assign(quote.governance, { quoteFamilyId: id, revisionId: id + "-REV-1", revisionLabel: "QA-1" });
  quote.revisionHistory = [];
  quote.documentation.proposalNumberLabel = id;
  quote.documentation.proposalDateLabel = QA_DATE;
  quote.documentation.proposalTitle = quote.metadata.documentTitle;
  quote.customer = {
    name: "QA Riverbend Operations", contactName: "QA Site Coordinator", contactEmail: "site-coordinator@example.test",
    contactPhone: "202-555-0101", addressLines: ["100 QA Test Road", "Austin, TX 78701"],
  };
  quote.inet = {
    name: "iNet - QA Verification", contactName: "QA Proposal Team", contactEmail: "qa-proposals@example.test",
    contactPhone: "202-555-0102", addressLines: ["200 QA Service Road", "Austin, TX 78701"],
  };
  quote.billTo = { companyName: quote.customer.name, attention: "QA Accounts Payable", lines: ["100 QA Test Road", "Austin, TX 78701"] };
  quote.shipTo = { companyName: quote.customer.name, attention: "QA Receiving Coordinator", lines: ["100 QA Test Road", "Austin, TX 78701"] };
  quote.shippingSameAsBillTo = false;
  quote.terms.pricingTermsTitle = "Commercial terms";
  quote.terms.pricingTerms = [
    "Payment is due within 30 days of invoice. Available options require a revised quote before inclusion.",
    "Recurring service pricing is based on a 12-month subscription commitment.",
    "QA service activation requires the named customer contact to approve the scheduled date.",
  ];
  quote.terms.generalStarlinkServiceTermsTitle = "Connectivity service terms";
  quote.terms.generalStarlinkServiceTerms = [
    "The quoted allocation is shared across the two listed terminals. Additional usage is not authorized by this quote.",
  ];
  quote.warranty.enabled = false;
  quote.approval.approvalNote = "QA acceptance includes only the priced schedules in this document.";
  quote.customerOutput = {
    leaseEndTerms: lease ? "Return both terminals at the end of month 3 unless a separate purchase is agreed in writing." : "",
    postLeaseTerms: lease ? "Service continues at $125.00 per month for months 4-12; equipment billing ends after month 3." : "",
    deliveryLeadTime: "Five business days after acceptance.",
    billingStart: "On confirmed service activation.",
  };
  quote.orderProcessing = {
    terminals: ["QA-RIVERBEND-01", "QA-RIVERBEND-02"], terminalsStatus: "listed", shippingRequired: "yes",
    shippingContactPhone: "202-555-0103", overageOptIn: "no", dataPlanDetails: "500 GB shared pool across two terminals.",
    monitoringSupportDetails: "Remote monitoring and business-hours support at the stated monthly fee.",
    terminalAccessFeeDetails: "Included in the data plan.", miscellaneousChargesNotes: "", notes: "",
  };
  quote.customFields = [{ id: "QA-INTERNAL-FIELD", label: "Internal costing", value: "QA-INTERNAL-FIELD-DO-NOT-PRINT", visibility: "internal" }];
  quote.commercial.meta.notes = "QA-INTERNAL-COMMERCIAL-DO-NOT-PRINT";
  quote.commercial.costs = {
    oneTimeEquipmentCost: 0, oneTimeLaborCost: 8123.41, oneTimeOtherCost: 8123.42,
    recurringVendorCost: 8123.43, recurringSupportCost: 8123.44, recurringOtherCost: 8123.45,
  };
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.termMonths = 12;
  quote.sections.sectionA.introText = "QA service covers both listed terminals at the Riverbend site.";
  quote.sections.sectionA.poolRows = [
    { id: "QA-DATA", rowType: "service", description: "QA - Shared connectivity plan", quantity: 1, monthlyRate: 100, unitPrice: 100, totalMonthlyRate: 100, sourceLabel: "QA-INTERNAL-SOURCE" },
    { id: "QA-SUPPORT", rowType: "support", description: "QA - Monitoring and support", quantity: 1, monthlyRate: 25, unitPrice: 25, totalMonthlyRate: 25, sourceLabel: "QA-INTERNAL-SOURCE",
      includedText: ["Internal monthly cost 8123.44.", "Remote alarms are reviewed each business day.", "Internal monthly cost 8123.45. QA support covers device reachability."] },
    { id: "QA-OPTION-DATA", rowType: "service", description: "QA - Additional data allowance", optional: true, quantity: 2, monthlyRate: 5, unitPrice: 5, totalMonthlyRate: 10 },
  ];
  quote.sections.sectionA.perKitRows = [{ id: "QA-INACTIVE", rowType: "service", description: "QA-INTERNAL-INACTIVE-MODE", quantity: 1, monthlyRate: 8123.46, totalMonthlyRate: 8123.46 }];
  quote.sections.sectionA.explanatoryParagraphs = [
    "Internal components flow directly to proposal output.",
    "Contract math is driven by internal cost and margin.",
    "QA telemetry is verified before service activation.",
  ];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.introText = "QA equipment is supplied as matched pairs for the named deployment locations.";
  quote.sections.sectionB.lineItems = [
    { id: "QA-EQUIPMENT", sourceType: "custom", itemName: "QA - Rugged connectivity terminal", description: "Outdoor terminal with mounting hardware.", partNumber: "QA-RCT-100", quantity: 2, unitPrice: 325, totalPrice: 650, sourceLabel: "QA-INTERNAL-SOURCE" },
    { id: "QA-OPTION-EQUIPMENT", sourceType: "custom", itemName: "QA - Spare mounting assembly", optional: true, quantity: 2, unitPrice: 32.5, totalPrice: 65 },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.introText = "QA commissioning includes link verification and handover.";
  quote.sections.sectionC.lineItems = [
    ...(lease ? [{ id: "QA-COMMISSIONING", sourceType: "custom" as const, description: "QA - On-site commissioning", quantity: 2, unitPrice: 25, totalPrice: 50, pricingStage: "final" as const }] : []),
    { id: "QA-OPTION-FIELD", sourceType: "custom", description: "QA - Additional service allowance", optional: true, quantity: 2, unitPrice: 10, totalPrice: 20, pricingStage: "final" },
  ];
  return quote;
}

async function attachmentFixture(key: string, title: string, sheets: number, drawing = false): Promise<AttachmentFixture> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const markers: string[] = [];
  for (let index = 0; index < sheets; index += 1) {
    const page = document.addPage(drawing ? [1000, 650] : [900, 1200]);
    const width = page.getWidth();
    const height = page.getHeight();
    const marker = key + "-SHEET-" + (index + 1);
    markers.push(marker);
    page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderWidth: 2, borderColor: rgb(0.14, 0.43, 0.5) });
    page.drawText(title, { x: 50, y: height - 85, font: bold, size: 25 });
    page.drawText(marker, { x: 50, y: height - 118, font, size: 15 });
    page.drawText("Synthetic QA reference - not a manufacturer specification.", { x: 50, y: height - 155, font, size: 15 });
    if (drawing) {
      const boxes = [
        { x: 70, label: "Remote terminal" }, { x: 375, label: "Managed gateway" }, { x: 680, label: "Operations LAN" },
      ];
      boxes.forEach(({ x, label }) => {
        page.drawRectangle({ x, y: 255, width: 240, height: 130, borderWidth: 2, borderColor: rgb(0.14, 0.43, 0.5), color: rgb(0.94, 0.98, 0.98) });
        page.drawText(label, { x: x + 15, y: 315, font: bold, size: 18 });
      });
      for (const x of [310, 615]) page.drawLine({ start: { x, y: 320 }, end: { x: x + 65, y: 320 }, thickness: 3, color: rgb(0.14, 0.43, 0.5) });
      page.drawText(index === 0 ? "Primary service path" : "Resilience and commissioning reference", { x: 70, y: 185, font, size: 18 });
    } else {
      const rows = index === 0
        ? ["Application: remote site connectivity", "Interfaces: WAN uplink and managed Ethernet", "Deployment: protected outdoor enclosure", "Power: site power with monitored backup"]
        : ["Mounting: secured to approved support", "Commissioning: verify link and LAN reachability", "Monitoring: confirm telemetry before activation", "Handover: record terminal identifiers"];
      rows.forEach((row, rowIndex) => {
        const y = height - 255 - rowIndex * 105;
        page.drawRectangle({ x: 50, y: y - 30, width: width - 100, height: 75, color: rowIndex % 2 ? rgb(1, 1, 1) : rgb(0.94, 0.98, 0.98) });
        page.drawText(row, { x: 70, y, font, size: 18 });
      });
    }
    page.drawText(marker + "-END", { x: 50, y: 55, font, size: 12 });
  }
  const blob = new Blob([new Uint8Array(await document.save())], { type: "application/pdf" });
  return {
    attachment: { storageKey: key, fileName: key + ".pdf", mimeType: "application/pdf", sizeBytes: blob.size, updatedAt: "2026-09-06T00:00:00.000Z" },
    blob, markers, itemLabels: [],
  };
}

async function buildFixtures(): Promise<Fixture[]> {
  const purchase: Fixture = {
    quote: normalize(simpleQuote("QA-PURCHASE-OUTPUT")), equipmentCount: 1, attachments: [],
    expected: { recurring: 125, equipment: 650, fieldServices: 0, equipmentLeaseMonthly: 0, monthly: 125, upfront: 650, optionalMonthly: 10, optionalOneTime: 85 },
  };
  const lease: Fixture = {
    quote: normalize(simpleQuote("QA-LEASE3-OUTPUT", true)), equipmentCount: 1, attachments: [],
    expected: { recurring: 125, equipment: 650, fieldServices: 50, equipmentLeaseMonthly: 333.33, monthly: 458.33, upfront: 50, optionalMonthly: 43.33, optionalOneTime: 20 },
  };
  const shared = await attachmentFixture("QA-SPEC-SHARED", "QA - Rugged Gateway Reference", 2);
  const switching = await attachmentFixture("QA-SPEC-SWITCH", "QA - Managed Switch Reference", 1);
  const drawing = await attachmentFixture("QA-DRAWING-SYSTEM", "QA - Riverbend Network Layout", 2, true);
  const source = simpleQuote("QA-LONG-OUTPUT", true);
  source.metadata.quoteType = "purchase";
  source.metadata.documentTitle = "QA - Riverbend Multi-Site Network";
  source.customerOutput!.leaseEndTerms = "";
  source.customerOutput!.postLeaseTerms = "";
  const components: MajorProjectComponent[] = Array.from({ length: 35 }, (_, index) => {
    const id = "QA-LONG-EQ-" + String(index + 1).padStart(2, "0");
    const label = id + " - " + (index === 19 ? "Managed switch" : "Rugged gateway");
    const spec = [0, 1, 34].includes(index) ? shared : index === 19 ? switching : undefined;
    spec?.itemLabels.push(label);
    return {
      id, internalName: "QA-INTERNAL-COMPONENT-" + index, customerFacingLabel: label,
      vendor: "QA-INTERNAL-VENDOR", category: "Network equipment", lineType: "hardware", schedule: "one_time",
      quantity: 2, unit: "ea", customerUnitPrice: 100 + index * 10, customerExtendedPrice: 200 + index * 20,
      vendorUnitCost: 12.34, vendorExtendedCost: 24.68, costBasis: "estimate", resaleBasis: "fixed_fee", passThrough: false,
      notes: "Configured equipment pair for deployment zone " + (index + 1) + ".",
      specSheetAttachment: spec?.attachment,
    };
  });
  const option = source.majorProject.options[0];
  source.majorProject.options = [{ ...option, id: "QA-LONG-OPTION", simpleRows: [], components, bundles: [], customerQuoteLines: [] }];
  source.majorProject.activeOptionId = "QA-LONG-OPTION";
  source.majorProject.summary.projectName = "QA Riverbend Multi-Site Network";
  source.majorProject.summary.projectDescription = "Connectivity equipment for 35 deployment zones with shared technical references.";
  source.majorProject.summary.systemDrawings = [drawing.attachment, shared.attachment, drawing.attachment];
  const longQuote = applyMajorProjectToQuote(source);
  // This fixture uses real component-to-equipment/spec mapping and the same explicit subscription/field schedules.
  longQuote.sections.sectionA = structuredClone(source.sections.sectionA);
  longQuote.sections.sectionC = structuredClone(source.sections.sectionC);
  longQuote.sections.sectionB.introText += "\n" + source.sections.sectionB.introText;
  longQuote.sections.sectionB.lineItems.push(structuredClone(source.sections.sectionB.lineItems[1]));
  const long: Fixture = {
    quote: normalize(longQuote), equipmentCount: 35, attachments: [shared, switching, drawing],
    expected: { recurring: 125, equipment: 18900, fieldServices: 50, equipmentLeaseMonthly: 0, monthly: 125, upfront: 18950, optionalMonthly: 10, optionalOneTime: 85 },
  };
  return [purchase, lease, long];
}

async function extractText(blob: Blob): Promise<PdfPageText[]> {
  const document = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true }).promise;
  try {
    const pages: PdfPageText[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => "str" in item).map((item) => ({
        text: item.str, transform: item.transform, width: item.width, height: item.height,
      }));
      pages.push({ text: compact(items.map((item) => item.text).join(" ")), items });
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

function scopedText(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, "Missing section: " + start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.ok(endIndex > startIndex, "Missing section end: " + end);
  return text.slice(startIndex, endIndex);
}

function checkRows(check: Check, scope: string, rows: Array<{ label: string; quantity: number | null | undefined; prices: number[]; billing?: string }>) {
  rows.forEach((row, index) => check("priced row: " + row.label, () => {
    const start = scope.indexOf(row.label);
    assert.ok(start >= 0, "Missing priced row " + row.label);
    const end = index + 1 < rows.length ? scope.indexOf(rows[index + 1].label, start + row.label.length) : scope.length;
    assert.ok(end > start, "Rows are missing or out of order after " + row.label);
    const rowText = scope.slice(start + row.label.length, end);
    assert.deepEqual(amounts(rowText), row.prices.map(money), "Wrong unit/extended prices for " + row.label);
    if (row.quantity != null) assert.ok(rowText.split(/\s+/).includes(String(row.quantity)), "Missing quantity for " + row.label);
    if (row.billing) assert.ok(rowText.includes(row.billing), "Missing billing label for " + row.label);
  }));
}

function validateCommercial(fixture: Fixture, text: string, check: Check) {
  const { quote, expected } = fixture;
  const isLease = quote.metadata.quoteType === "lease";
  const lease = getLeasePricingSummary(quote);
  const options = getProposalOptionCostSummary(quote);
  const actual: Totals = {
    recurring: getRecurringMonthlyTotal(quote), equipment: getEquipmentTotal(quote),
    fieldServices: getOptionalServicesTotal(quote), equipmentLeaseMonthly: isLease ? lease.hardwareMonthly : 0,
    monthly: isLease ? lease.leaseMonthly : getRecurringMonthlyTotal(quote), upfront: getCombinedOneTimeTotal(quote),
    optionalMonthly: options.monthlyTotal, optionalOneTime: options.oneTimeTotal,
  };
  check("exact commercial helper totals", () => assert.deepEqual(actual, expected));
  check("readiness and explicit QA identity", () => {
    assert.deepEqual(getCustomerQuoteContent(quote).warnings, []);
    assert.ok(text.includes(quote.metadata.proposalNumber));
    assert.ok(text.includes(quote.metadata.documentTitle));
    assert.ok(text.includes("Synthetic QA fixture - not for ordering."));
    assert.ok(text.includes("Quote acceptance"));
    assert.doesNotMatch(text, /Draft proposal|Pending agreement|Commercial details to confirm/i);
  });
  for (const [label, value] of [
    ["Total monthly payment", expected.monthly], ["One-time charges", expected.upfront],
    ["Included monthly payment", expected.monthly], ["Included one-time charges", expected.upfront],
    ["Recurring services per month", expected.recurring],
    ["Available monthly options", expected.optionalMonthly], ["Available one-time options", expected.optionalOneTime],
  ] as const) {
    check("printed total: " + label, () => {
      const start = text.indexOf(label);
      assert.ok(start >= 0, "Missing total label " + label);
      assert.equal(amounts(text.slice(start + label.length))[0], money(value), label);
    });
  }
  check("included equipment count", () => assert.equal(getIncludedEquipmentRows(quote).length, fixture.equipmentCount));
  check("subscription allocation and independent commitment", () => {
    assert.match(text, /Subscription commitment 12 months/);
    assert.ok(text.includes("500 GB shared pool across two terminals."));
    assert.match(text, /Opted out/);
    if (isLease) {
      assert.match(text, /Equipment lease term 3 months/);
      assert.ok(text.includes(quote.customerOutput!.leaseEndTerms));
      assert.ok(text.includes(quote.customerOutput!.postLeaseTerms));
      assert.match(text, /Equipment lease \$333\.33\s*\/month \+ recurring services \$125\.00\s*\/month\./);
      assert.ok(text.includes("No separate upfront equipment purchase is charged."));
    }
  });
  check("authored introductions, terms, and support details survive boilerplate filtering", () => {
    for (const copy of [
      "QA service covers both listed terminals at the Riverbend site.",
      "QA telemetry is verified before service activation.",
      "QA equipment is supplied as matched pairs for the named deployment locations.",
      "Remote alarms are reviewed each business day.",
      "QA support covers device reachability.",
      quote.approval.approvalNote,
      ...quote.terms.pricingTerms,
      ...quote.terms.generalStarlinkServiceTerms,
    ]) assert.ok(copy && text.includes(copy), "Missing authored copy: " + copy);
    if (getIncludedServiceRows(quote).length) assert.ok(text.includes("QA commissioning includes link verification and handover."));
  });
  check("subscription rows", () => checkRows(check,
    scopedText(text, "Subscriptions & service pricing", "Recurring services per month"),
    getIncludedSectionARows(quote).map((row) => ({ label: row.description, quantity: row.quantity, prices: [row.monthlyRate ?? row.unitPrice ?? 0, row.totalMonthlyRate ?? 0] })),
  ));
  check("equipment rows", () => checkRows(check,
    scopedText(text, isLease ? "Equipment included in lease" : "Equipment & materials", isLease ? "No separate upfront equipment purchase" : "One-time equipment total"),
    getIncludedEquipmentRows(quote).map((row) => ({ label: row.itemName, quantity: row.quantity, prices: isLease ? [] : [row.unitPrice, row.totalPrice], billing: isLease ? "Included in lease" : undefined })),
  ));
  if (getIncludedServiceRows(quote).length) check("field service rows", () => checkRows(check,
    scopedText(text, "Implementation & field services", "One-time services total"),
    getIncludedServiceRows(quote).map((row) => ({ label: row.description, quantity: row.quantity, prices: [row.unitPrice, row.totalPrice] })),
  ));
  check("optional rows and excluded base totals", () => {
    const optionText = scopedText(text, "Option Costs", "Available monthly options");
    assert.match(text, /Excluded from the included scope and all base totals/);
    checkRows(check, optionText, options.items.map((row) => ({
      label: row.label, quantity: row.quantity, prices: [row.unitPrice!, row.amount], billing: row.cadence === "monthly" ? "Monthly" : "One-time",
    })));
  });
  return actual;
}

async function verifyFixture(fixture: Fixture) {
  const id = fixture.quote.metadata.proposalNumber;
  const failures: string[] = [];
  let checks = 0;
  const check: Check = (name, verify) => {
    checks += 1;
    try { verify(); } catch (error) { failures.push(name + ": " + (error instanceof Error ? error.message : String(error))); }
  };
  const report: {
    id: string; outputPath?: string; bytes?: number; commercialPages?: number; attachmentPages?: number;
    totalPages?: number; pricedRows?: number; totals?: Totals; attachmentOrder?: string[]; failures: string[]; checks: number;
  } = { id, failures, checks: 0 };
  console.log("Rendering " + id + " through POST " + new URL("/api/proposal-pdf", BASE_URL));
  try {
    const response = await fetch(new URL("/api/proposal-pdf", BASE_URL), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote: fixture.quote, proposalId: id }), signal: AbortSignal.timeout(180_000),
    });
    assert.ok(response.ok, "Renderer returned HTTP " + response.status + ": " + (response.ok ? "" : (await response.text()).slice(0, 2000)));
    assert.match(response.headers.get("content-type") ?? "", /application\/pdf/i);
    const basePdf = await response.blob();
    const loadedKeys: string[] = [];
    const finalPdf = await assembleFinalProposalPdf(basePdf, fixture.quote, {
      proposalId: id,
      loadAttachment: async (key) => {
        loadedKeys.push(key);
        return fixture.attachments.find((entry) => entry.attachment.storageKey === key)?.blob;
      },
    });
    const outputPath = path.join(OUTPUT_DIR, id + ".pdf");
    await writeFile(outputPath, new Uint8Array(await finalPdf.arrayBuffer()));
    report.outputPath = outputPath;
    report.bytes = finalPdf.size;
    const basePages = await extractText(basePdf);
    const finalPages = await extractText(finalPdf);
    report.commercialPages = basePages.length;
    report.attachmentPages = fixture.attachments.reduce((sum, entry) => sum + entry.markers.length, 0);
    report.totalPages = finalPages.length;
    report.pricedRows = getIncludedSectionARows(fixture.quote).length + getIncludedEquipmentRows(fixture.quote).length
      + getIncludedServiceRows(fixture.quote).length + getProposalOptionCostSummary(fixture.quote).items.length;
    const allText = finalPages.map((page) => page.text).join(" ");
    const commercialText = basePages.map((page) => page.text).join(" ");
    report.totals = validateCommercial(fixture, commercialText, check);
    check("no costs, margin, profit, or internal authoring leakage", () => {
      const withoutAllowedOptionHeading = allText.replace(/Option Costs/gi, "");
      assert.doesNotMatch(withoutAllowedOptionHeading, /\b(?:costs?|margin|profit|internal|placeholder)\b|QA-INACTIVE|manual row|base deployment structure|row builder|component list|commercial source of truth|live margin rollups|must be reviewed before customer release/i);
      assert.doesNotMatch(allText, /8,?123\.4[1-6]/);
    });
    check("physical page count equals commercial pages plus every source sheet", () => assert.equal(finalPages.length, basePages.length + report.attachmentPages!));
    check("base renderer has no legacy page-number stamps", () => basePages.forEach((page) => assert.doesNotMatch(page.text, /\bPage\s*\d+\s*(?:of|\/)\s*\d+/i)));
    finalPages.forEach((page, index) => check("one final footer on physical page " + (index + 1), () => {
      assert.deepEqual(page.text.match(/\bPage\s*\d+\s*of\s*\d+\b/g), ["Page " + (index + 1) + " of " + finalPages.length]);
      const footer = page.items.find((item) => item.text === "Page " + (index + 1) + " of " + finalPages.length);
      assert.ok(footer && footer.transform[5] === 18, "Page number must occupy the reserved bottom margin");
      assert.equal(page.items.filter((item) => item.text === id && item.transform[5] === 18).length, 1, "Missing or repeated proposal ID footer");
    }));
    basePages.forEach((page, index) => check("commercial content preserved on physical page " + (index + 1), () => {
      assert.deepEqual(finalPages[index].items.filter((item) => item.text.trim() && !(item.transform[5] === 18 && (item.text === id || /^Page \d+ of \d+$/.test(item.text)))),
        page.items.filter((item) => item.text.trim()));
    }));
    const entries = getProposalAttachments(fixture.quote);
    report.attachmentOrder = entries.map((entry) => entry.id + ": " + entry.attachment.fileName);
    check("actual append order, storage deduplication, and shared labels", () => {
      assert.deepEqual(loadedKeys, fixture.attachments.map((entry) => entry.attachment.storageKey));
      assert.deepEqual(entries.map((entry) => entry.itemLabels), fixture.attachments.map((entry) => entry.itemLabels));
      assert.deepEqual(entries.map((entry) => entry.id), fixture.attachments.map((_, index) => "A" + (index + 1)));
    });
    if (entries.length) check("one commercial appendix index with no spec placeholders", () => {
      assert.equal(basePages.filter((page) => page.text.includes("Technical appendix")).length, 1);
      entries.forEach((entry) => assert.ok(commercialText.includes(entry.attachment.fileName)));
      fixture.attachments.flatMap((entry) => entry.markers).forEach((marker) => assert.ok(!commercialText.includes(marker)));
    });
    let physicalIndex = basePages.length;
    fixture.attachments.forEach((attachment, attachmentIndex) => {
      attachment.markers.forEach((marker, sheetIndex) => {
        const pageIndex = physicalIndex++;
        check("real appended source sheet " + marker, () => {
          const text = finalPages[pageIndex].text;
          assert.ok(text.includes(marker) && text.includes(marker + "-END"), "Source sheet artwork/text is missing");
          const header = "A" + (attachmentIndex + 1) + " - " + (attachmentIndex === 2 ? "System drawing" : "Specification") + " - " + attachment.attachment.fileName;
          assert.ok(text.includes(header), "Wrong appendix reference on appended page");
          assert.ok(text.includes((sheetIndex + 1) + "/" + attachment.markers.length));
        });
      });
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  report.checks = checks;
  console.log(JSON.stringify({ result: failures.length ? "FAIL" : "PASS", ...report }, null, 2));
  return report;
}

async function main() {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(BASE_URL.hostname), "QA may only POST synthetic fixtures to a loopback renderer");
  assert.ok(["http:", "https:"].includes(BASE_URL.protocol));
  await mkdir(OUTPUT_DIR, { recursive: true });
  const fixtures = await buildFixtures();
  const reports = [];
  for (const fixture of fixtures) reports.push(await verifyFixture(fixture));
  const failures = reports.flatMap((report) => report.failures.map((failure) => report.id + ": " + failure));
  console.log(JSON.stringify({ fixtures: reports.length, checks: reports.reduce((sum, report) => sum + report.checks, 0), failures: failures.length, outputDirectory: OUTPUT_DIR }, null, 2));

  // Leave only this synthetic lease cached for the parent's read-only desktop/mobile review.
  const lease = fixtures.find((fixture) => fixture.quote.metadata.proposalNumber === "QA-LEASE3-OUTPUT")!.quote;
  const cachedAt = new Date();
  const token = await cacheProposalPdfQuote(lease, lease.internal.quoteId);
  const previewUrl = new URL("/proposal/print", BASE_URL);
  previewUrl.searchParams.set("autoprint", "0");
  previewUrl.searchParams.set("token", token);
  previewUrl.searchParams.set("proposalId", lease.internal.quoteId);
  const preview = await fetch(previewUrl, { signal: AbortSignal.timeout(30_000) });
  assert.ok(preview.ok, "Synthetic cached preview returned HTTP " + preview.status);
  assert.ok((await preview.text()).includes("QA-LEASE3-OUTPUT"), "Cached preview did not render the synthetic lease");
  console.log(JSON.stringify({ syntheticLeasePreviewUrl: previewUrl.href, cachedAt: cachedAt.toISOString(), expiresAt: new Date(cachedAt.getTime() + 600_000).toISOString() }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

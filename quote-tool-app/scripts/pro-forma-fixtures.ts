import { createBlankQuoteRecord } from "../app/lib/quote-template";
import { normalizeOrderProcessing } from "../app/lib/order-processing";
import { finalReviewKey } from "../app/lib/final-quote-review";
import { createProFormaSettings } from "../app/lib/pro-forma-settings";
import type { QuoteRecord } from "../app/lib/quote-record";

export function prepareProFormaFixture(quote: QuoteRecord) {
  quote.customer = { name: "River Valley Utilities", contactName: "Taylor Test", contactEmail: "taylor@example.test", contactPhone: "555-0100", addressLines: ["100 Example Road", "Austin, TX 78701"] };
  quote.billTo = { companyName: quote.customer.name, attention: "Accounts Payable", lines: ["200 Billing Lane", "Austin, TX 78702"] };
  quote.orderProcessing = normalizeOrderProcessing({ shippingRequired: "no", overageOptIn: "no", dataPlanDetails: "500 GB monthly", notes: "None", requirements: { subAccountStatus: "no", equipmentRequired: "no", corporatePricing: "yes", corporatePricingReference: "QA contract", publicIp: "no" } });
  quote.customerOutput = { ...quote.customerOutput!, paymentTerms: "Net 30", billingStart: "On service activation", shipsActivated: "no" };
  quote.sections.sectionA.termMonths = 12;
  quote.customerOutput.commercialConfirmation = finalReviewKey(quote);
  quote.proForma = createProFormaSettings(quote, new Date(2026, 10, 2));
  return quote;
}

export function proFormaFixture() {
  const quote = createBlankQuoteRecord();
  quote.metadata.proposalNumber = "RQ-PROFORMA-TEST";
  quote.metadata.documentTitle = "Camera and Monitoring";
  quote.metadata.salesTaxAmount = 82.25;
  quote.internal.quoteId = "qa-pro-forma";
  quote.internal.savedProposalId = "qa-pro-forma";
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    { id: "monthly", rowType: "service", description: "Monitoring and data", quantity: 1, monthlyRate: 75, totalMonthlyRate: 75, includedText: ["INTERNAL_COST_SECRET 37.25"] },
    { id: "taf", rowType: "terminal_fee", description: "Terminal access", quantity: 2, monthlyRate: 5, totalMonthlyRate: 10 },
    { id: "usage", rowType: "overage", description: "Usage-based data", quantity: 1, monthlyRate: 2, totalMonthlyRate: 9999 },
    { id: "optional-monthly", rowType: "service", description: "Optional premium monitoring", quantity: 1, totalMonthlyRate: 100, optional: true },
  ];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    { id: "camera", sourceType: "custom", itemName: "Outdoor camera", quantity: 2, unitPrice: 500, totalPrice: 1000 },
    { id: "annual", sourceType: "custom", itemName: "Annual analytics subscription", quantity: 1, unitPrice: 1350, totalPrice: 1350, billing: { cadence: "annual" } },
    { id: "renewal", sourceType: "custom", itemName: "Annual support renewal", quantity: 1, unitPrice: 375, totalPrice: 375, billing: { cadence: "annual", startsYear: 2 } },
    { id: "optional-hardware", sourceType: "custom", itemName: "Optional mounting kit", quantity: 1, unitPrice: 99, totalPrice: 99, optional: true },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    { id: "setup", sourceType: "custom", description: "Setup", quantity: 1, unitPrice: 200, totalPrice: 200 },
    { id: "credit", sourceType: "custom", description: "Quoted credit", quantity: 1, unitPrice: -25, totalPrice: -25 },
  ];
  return prepareProFormaFixture(quote);
}

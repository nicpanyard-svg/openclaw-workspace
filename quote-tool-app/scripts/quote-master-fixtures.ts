import { createBlankQuoteRecord } from "../app/lib/quote-template";
import type { MajorProjectComponent, QuoteRecord } from "../app/lib/quote-record";
import type { QuoteMasterSelection } from "../app/lib/quote-master-model";

export function fixtureComponent(id: string, price: number, cost: number, changes: Partial<MajorProjectComponent> = {}): MajorProjectComponent {
  return { id, internalName: id, customerFacingLabel: id, vendor: "QA vendor", category: "Other", lineType: "hardware", quantity: 1, unit: "ea", customerUnitPrice: price, customerExtendedPrice: price, vendorUnitCost: cost, vendorExtendedCost: cost, schedule: "one_time", costBasis: "estimate", resaleBasis: "fixed_fee", passThrough: false, ...changes };
}

export function fixtureQuote(id: string, title: string, components: MajorProjectComponent[]): QuoteRecord {
  const quote = createBlankQuoteRecord();
  quote.customer.name = "QA SARA Workbook";
  Object.assign(quote.metadata, { workflowMode: "major_project", proposalNumber: id, documentTitle: title, ownerName: "QA Account Manager", proposalDate: "2026-09-06" });
  Object.assign(quote.internal, { quoteId: id, savedProposalId: id });
  quote.majorProject.enabled = true;
  quote.majorProject.builderMode = "advanced";
  quote.majorProject.summary.projectName = title;
  quote.majorProject.commercial.termMonths = 12;
  quote.majorProject.options[0].label = title;
  quote.majorProject.options[0].siteCount = 1;
  quote.majorProject.options[0].components = components;
  quote.majorProject.options[0].bundles = [];
  quote.majorProject.options[0].customerQuoteLines = [];
  return quote;
}

// Synthetic internal costs, never a substitute for the user's saved SARA cost records.
export function quoteMasterFixtures(): QuoteMasterSelection[] {
  const quotes = [
    fixtureQuote("RCT-1788621320967", "QA Radar hardware", [fixtureComponent("Radar hardware package", 8944.46, 6000), fixtureComponent("Radar installation", 3000, 1800, { lineType: "installation" })]),
    fixtureQuote("RCT-1788628213855", "QA Camera hardware", [fixtureComponent("Camera hardware package", 6660.76, 4400), fixtureComponent("Camera installation", 3000, 1800, { lineType: "installation" })]),
    fixtureQuote("RCT-1788644603859", "QA AI and cloud", [fixtureComponent("AI software and calibration", 10200, 7000, { lineType: "software" }), fixtureComponent("OS Board", 1350, 900, { lineType: "subscription", schedule: "recurring", billing: { cadence: "annual" } }), fixtureComponent("AXIS Camera Station Cloud Storage", 250, 160, { quantity: 2, customerUnitPrice: 125, vendorUnitCost: 80, lineType: "subscription", schedule: "recurring", billing: { cadence: "annual" } }), fixtureComponent("Serenity renewal options", 750, 500, { optional: true, lineType: "subscription", schedule: "recurring", billing: { cadence: "annual", startsYear: 2 } })]),
    fixtureQuote("RCT-1788656996974", "QA Connectivity services", [fixtureComponent("Unlimited 5G T-Mobile Plan", 65, 45, { schedule: "recurring", lineType: "subscription" }), fixtureComponent("SecureLynk -Starlink Private Network Solution", 27.5, 20, { schedule: "recurring", lineType: "managed_service" }), fixtureComponent("650 GB pooled data allowance", 213, 150, { optional: true, schedule: "recurring", lineType: "subscription" }), fixtureComponent("Terminal Access Fee", 45, 30, { optional: true, schedule: "recurring", lineType: "subscription" })]),
  ];
  return quotes.map((quote, i) => ({ quote, optionId: quote.majorProject.activeOptionId, splitConnectivity: i === 3 }));
}

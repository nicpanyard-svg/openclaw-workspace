import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProposalCommercialSummary,
  getCombinedOneTimeTotal,
  getCustomerFacingEquipmentTotal,
  getCustomerFacingOneTimeTotal,
  getEquipmentTotal,
  getIncludedEquipmentRows,
  getIncludedSectionARows,
  getIncludedServiceRows,
  getLeaseMonthlyTotal,
  getLeasePricingSummary,
  getOptionalServicesTotal,
  getProposalOptionCostSummary,
  getRecurringMonthlyTotal,
} from "./proposal-commercial-summary";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import {
  createProposalFromQuote,
  deserializeProposalStore,
  serializeProposalStore,
} from "./proposal-store";
import type { LeaseTermMonths, PerKitPricingRow, QuoteRecord, QuoteType, SectionAMode } from "./quote-record";
import { createBlankQuoteRecord } from "./quote-template";

type PricingCase = {
  quoteType: QuoteType;
  termMonths: LeaseTermMonths;
  hardwareMonthly: number;
  monthlyTotal: number;
  optionalHardwareAmount: number;
  optionalMonthlyTotal: number;
};

// Expected amounts are fixed independently of the production margin/rounding helpers.
const pricingCases: PricingCase[] = [
  { quoteType: "lease", termMonths: 3, hardwareMonthly: 333.33, monthlyTotal: 433.33, optionalHardwareAmount: 33.33, optionalMonthlyTotal: 43.33 },
  { quoteType: "lease", termMonths: 6, hardwareMonthly: 166.67, monthlyTotal: 266.67, optionalHardwareAmount: 16.67, optionalMonthlyTotal: 26.67 },
  { quoteType: "lease", termMonths: 9, hardwareMonthly: 111.11, monthlyTotal: 211.11, optionalHardwareAmount: 11.11, optionalMonthlyTotal: 21.11 },
  { quoteType: "lease", termMonths: 12, hardwareMonthly: 83.33, monthlyTotal: 183.33, optionalHardwareAmount: 8.33, optionalMonthlyTotal: 18.33 },
  { quoteType: "lease", termMonths: 24, hardwareMonthly: 41.67, monthlyTotal: 141.67, optionalHardwareAmount: 4.17, optionalMonthlyTotal: 14.17 },
  { quoteType: "lease", termMonths: 36, hardwareMonthly: 27.78, monthlyTotal: 127.78, optionalHardwareAmount: 2.78, optionalMonthlyTotal: 12.78 },
  { quoteType: "purchase", termMonths: 12, hardwareMonthly: 0, monthlyTotal: 100, optionalHardwareAmount: 65, optionalMonthlyTotal: 10 },
];

function createCommercialQuote(mode: SectionAMode, pricing: PricingCase): QuoteRecord {
  const quote = createBlankQuoteRecord();
  quote.metadata.proposalNumber = `COMMERCIAL-${mode}-${pricing.quoteType}-${pricing.termMonths}`;
  quote.metadata.quoteType = pricing.quoteType;
  quote.metadata.leaseTermMonths = pricing.termMonths;
  quote.metadata.leaseMarginPercent = 35;
  quote.metadata.hasActiveDataAgreement = true;
  quote.customer.name = "Commercial regression customer";
  quote.internal.savedProposalId = quote.internal.quoteId;
  quote.commercial.costs.oneTimeEquipmentCost = 0;

  const activeRows: PerKitPricingRow[] = [
    {
      id: `${mode}-included`,
      rowType: "service",
      description: "Included recurring service",
      optional: false,
      quantity: 2,
      unitPrice: 50,
      monthlyRate: 50,
      totalMonthlyRate: 100,
    },
    {
      id: `${mode}-optional`,
      rowType: "service",
      description: "Optional recurring service",
      optional: true,
      quantity: 2,
      unitPrice: 5,
      monthlyRate: 5,
      totalMonthlyRate: 10,
    },
  ];
  // Inactive mode rows must never contribute to included or optional pricing.
  const inactiveRows: PerKitPricingRow[] = activeRows.map((row) => ({
    ...row,
    id: `inactive-${row.id}`,
    unitPrice: 500,
    monthlyRate: 500,
    totalMonthlyRate: 1000,
  }));
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = mode;
  quote.sections.sectionA.poolRows = mode === "pool" ? activeRows : inactiveRows;
  quote.sections.sectionA.perKitRows = mode === "per_kit" ? activeRows : inactiveRows;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    {
      id: "equipment-included",
      sourceType: "custom",
      itemName: "Included hardware",
      quantity: 2,
      unitPrice: 325,
      totalPrice: 650,
    },
    {
      id: "equipment-optional",
      sourceType: "custom",
      itemName: "Optional hardware",
      optional: true,
      quantity: 2,
      unitPrice: 32.5,
      totalPrice: 65,
    },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    {
      id: "services-included",
      sourceType: "custom",
      description: "Included field services",
      optional: false,
      quantity: 2,
      unitPrice: 25,
      totalPrice: 50,
    },
    {
      id: "services-optional",
      sourceType: "custom",
      description: "Optional field services",
      optional: true,
      quantity: 2,
      unitPrice: 10,
      totalPrice: 20,
    },
  ];
  return quote;
}

function assertCommercialPricing(quote: QuoteRecord, mode: SectionAMode, pricing: PricingCase) {
  const isLease = pricing.quoteType === "lease";
  assert.deepEqual(getIncludedSectionARows(quote).map((row) => row.id), [`${mode}-included`]);
  assert.deepEqual(getIncludedEquipmentRows(quote).map((row) => row.id), ["equipment-included"]);
  assert.deepEqual(getIncludedServiceRows(quote).map((row) => row.id), ["services-included"]);
  assert.equal(getRecurringMonthlyTotal(quote), 100);
  assert.equal(getEquipmentTotal(quote), 650);
  assert.equal(getOptionalServicesTotal(quote), 50);
  assert.equal(getCustomerFacingEquipmentTotal(quote), isLease ? 0 : 650);
  assert.equal(getCustomerFacingOneTimeTotal(quote), isLease ? 50 : 700);
  assert.equal(getCombinedOneTimeTotal(quote), isLease ? 50 : 700);
  assert.equal(getLeaseMonthlyTotal(quote), isLease ? pricing.monthlyTotal : 0);

  if (isLease) {
    assert.deepEqual(getLeasePricingSummary(quote), {
      isLease: true,
      hasActiveDataAgreement: true,
      termMonths: pricing.termMonths,
      marginPercent: 35,
      recurringMonthlyTotal: 100,
      hardwareCost: 650,
      requiredHardwareRevenue: 1000,
      hardwareGrossProfit: 350,
      hardwareMonthly: pricing.hardwareMonthly,
      leaseMonthly: pricing.monthlyTotal,
    });
  }

  const options = getProposalOptionCostSummary(quote);
  assert.equal(options.monthlyTotal, pricing.optionalMonthlyTotal);
  assert.equal(options.oneTimeTotal, isLease ? 20 : 85);
  assert.deepEqual(options.items.map(({ key, cadence, amount }) => ({ key, cadence, amount })), [
    { key: `section-a-${mode}-optional`, cadence: "monthly", amount: 10 },
    { key: "section-b-equipment-optional", cadence: isLease ? "monthly" : "one_time", amount: pricing.optionalHardwareAmount },
    { key: "section-c-services-optional", cadence: "one_time", amount: 20 },
  ]);
  assert.deepEqual(
    buildProposalCommercialSummary(quote).map(({ key, value }) => ({ key, value })),
    isLease
      ? [
          { key: "field-services", value: 50 },
          { key: "one-time-total", value: 50 },
          { key: "monthly-total", value: pricing.monthlyTotal },
        ]
      : [
          { key: "recurring-monthly", value: 100 },
          { key: "one-time-equipment", value: 650 },
          { key: "field-services", value: 50 },
          { key: "one-time-total", value: 700 },
        ],
  );
}

for (const mode of ["pool", "per_kit"] as const) {
  for (const pricing of pricingCases) {
    const label = `${mode}: ${pricing.quoteType}${pricing.quoteType === "lease" ? ` ${pricing.termMonths} months` : ""}`;

    test(`${label} calculates included totals and keeps optional costs separate`, () => {
      assertCommercialPricing(createCommercialQuote(mode, pricing), mode, pricing);
    });

    test(`${label} preserves pricing, optional flags, and identity through save/reload`, () => {
      const quote = createCommercialQuote(mode, pricing);
      const restoredDraft = deserializeQuoteRecord(serializeQuoteRecord(quote));
      assert.ok(restoredDraft, "Serialized draft must survive quote normalization");

      const proposal = createProposalFromQuote({ quote });
      const restoredStore = deserializeProposalStore(serializeProposalStore({
        currentUser: proposal.createdBy,
        users: [proposal.owner],
        proposals: [proposal],
      }));
      assert.ok(restoredStore, "Saved proposal store must survive normalization");
      assert.equal(restoredStore.proposals.length, 1);
      const restoredProposal = restoredStore.proposals[0];
      assert.equal(restoredProposal.id, proposal.id);

      for (const restored of [restoredDraft, restoredProposal.quote]) {
        assert.notStrictEqual(restored, quote);
        assert.equal(restored.internal.quoteId, quote.internal.quoteId);
        assert.equal(restored.internal.savedProposalId, quote.internal.savedProposalId);
        assert.equal(restored.metadata.proposalNumber, quote.metadata.proposalNumber);
        assert.equal(restored.metadata.quoteType, pricing.quoteType);
        assert.equal(restored.metadata.leaseTermMonths, pricing.termMonths);
        assert.equal(restored.metadata.leaseMarginPercent, 35);
        assert.equal(restored.metadata.hasActiveDataAgreement, true);
        assert.equal(restored.sections.sectionA.mode, mode);
        assert.deepEqual(restored.sections, quote.sections);
        assert.deepEqual(restored.commercial, quote.commercial);
        assertCommercialPricing(restored, mode, pricing);
      }
    });
  }
}

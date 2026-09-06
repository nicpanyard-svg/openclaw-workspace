import assert from "node:assert/strict";
import test from "node:test";

import { buildEstimateTemplateModel } from "./estimate-template";
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
  getQuoteContentPresence,
  getQuotedSalesTax,
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
  optionalHardwareUnitPrice: number;
  optionalMonthlyTotal: number;
};

// Expected amounts are fixed independently of the production margin/rounding helpers.
const pricingCases: PricingCase[] = [
  { quoteType: "lease", termMonths: 3, hardwareMonthly: 333.33, monthlyTotal: 433.33, optionalHardwareAmount: 33.33, optionalHardwareUnitPrice: 16.665, optionalMonthlyTotal: 43.33 },
  { quoteType: "lease", termMonths: 6, hardwareMonthly: 166.67, monthlyTotal: 266.67, optionalHardwareAmount: 16.67, optionalHardwareUnitPrice: 8.335, optionalMonthlyTotal: 26.67 },
  { quoteType: "lease", termMonths: 9, hardwareMonthly: 111.11, monthlyTotal: 211.11, optionalHardwareAmount: 11.11, optionalHardwareUnitPrice: 5.555, optionalMonthlyTotal: 21.11 },
  { quoteType: "lease", termMonths: 12, hardwareMonthly: 83.33, monthlyTotal: 183.33, optionalHardwareAmount: 8.33, optionalHardwareUnitPrice: 4.165, optionalMonthlyTotal: 18.33 },
  { quoteType: "lease", termMonths: 24, hardwareMonthly: 41.67, monthlyTotal: 141.67, optionalHardwareAmount: 4.17, optionalHardwareUnitPrice: 2.085, optionalMonthlyTotal: 14.17 },
  { quoteType: "lease", termMonths: 36, hardwareMonthly: 27.78, monthlyTotal: 127.78, optionalHardwareAmount: 2.78, optionalHardwareUnitPrice: 1.39, optionalMonthlyTotal: 12.78 },
  { quoteType: "purchase", termMonths: 12, hardwareMonthly: 0, monthlyTotal: 100, optionalHardwareAmount: 65, optionalHardwareUnitPrice: 32.5, optionalMonthlyTotal: 10 },
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

test("free optional items and credits remain visible without increasing base pricing", () => {
  const quote = createBlankQuoteRecord();
  quote.metadata.quoteType = "purchase";
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    { id: "free-option", sourceType: "custom", itemName: "Complimentary mounting bracket", quantity: 1, unitPrice: 0, totalPrice: 0, optional: true },
    { id: "credit-option", sourceType: "custom", itemName: "Trade-in credit", quantity: 1, unitPrice: -25, totalPrice: -25, optional: true },
  ];
  const options = getProposalOptionCostSummary(quote);
  assert.equal(options.items.length, 2);
  assert.equal(options.oneTimeTotal, -25);
  assert.equal(getEquipmentTotal(quote), 0);
  quote.metadata.quoteType = "lease";
  quote.metadata.leaseTermMonths = 3;
  quote.metadata.leaseMarginPercent = 35;
  const leased = getProposalOptionCostSummary(quote);
  assert.equal(leased.items[1].amount, -12.82);
  assert.equal(leased.items[1].cadence, "monthly");
  assert.equal(leased.monthlyTotal, -12.82);
});

test("usage-based overage rates are not fixed monthly charges, including when offered as options", () => {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    { id: "plan", rowType: "service", description: "Data plan", quantity: 1, monthlyRate: 100, totalMonthlyRate: 100 },
    { id: "overage", rowType: "overage", description: "Extra data", unitLabel: "GB", monthlyRate: 0.55, totalMonthlyRate: 0.55 },
  ];
  assert.equal(getRecurringMonthlyTotal(quote), 100);
  quote.sections.sectionA.poolRows[1].optional = true;
  const options = getProposalOptionCostSummary(quote);
  assert.equal(options.monthlyTotal, 0);
  assert.equal(options.items[0].unitPrice, 0.55);
  assert.equal(options.items[0].usageBased, true);
  assert.equal(options.items[0].unitLabel, "GB");
});

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
  assert.deepEqual(options.items.map(({ key, cadence, amount, unitPrice }) => ({ key, cadence, amount, unitPrice })), [
    { key: `section-a-${mode}-optional`, cadence: "monthly", amount: 10, unitPrice: 5 },
    { key: "section-b-equipment-optional", cadence: isLease ? "monthly" : "one_time", amount: pricing.optionalHardwareAmount, unitPrice: pricing.optionalHardwareUnitPrice },
    { key: "section-c-services-optional", cadence: "one_time", amount: 20, unitPrice: 10 },
  ]);
  for (const item of options.items) {
    assert.ok(item.unitPrice != null && item.quantity != null);
    assert.equal(Number((item.unitPrice * item.quantity).toFixed(2)), item.amount);
  }
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

function savedQuoteVariants(quote: QuoteRecord): QuoteRecord[] {
  const restoredDraft = deserializeQuoteRecord(serializeQuoteRecord(quote));
  assert.ok(restoredDraft);
  const proposal = createProposalFromQuote({ quote });
  const restoredStore = deserializeProposalStore(serializeProposalStore({
    currentUser: proposal.createdBy,
    users: [proposal.owner],
    proposals: [proposal],
  }));
  assert.ok(restoredStore);
  return [quote, restoredDraft, restoredStore.proposals[0].quote];
}

const sectionKeys = ["sectionA", "sectionB", "sectionC"] as const;

for (const mode of ["pool", "per_kit"] as const) {
  for (const pricing of pricingCases) {
    const label = `${mode}: ${pricing.quoteType} ${pricing.termMonths}`;

    for (const disabled of [...sectionKeys, "all"] as const) {
      test(`${label} excludes disabled ${disabled} from rows, totals, costs, and presence after reload`, () => {
        const quote = createCommercialQuote(mode, pricing);
        // A saved cost must not resurrect excluded hardware as a lease charge.
        quote.commercial.costs.oneTimeEquipmentCost = 650;
        for (const key of sectionKeys) quote.sections[key].enabled = disabled !== "all" && disabled !== key;

        for (const variant of savedQuoteVariants(quote)) {
          const a = variant.sections.sectionA.enabled;
          const b = variant.sections.sectionB.enabled;
          const c = variant.sections.sectionC.enabled;
          const isLease = pricing.quoteType === "lease";
          const upfront = (b && !isLease ? 650 : 0) + (c ? 50 : 0);
          const leaseMonthly = isLease ? (a && b ? pricing.monthlyTotal : a ? 100 : b ? pricing.hardwareMonthly : 0) : 0;
          assert.equal(getIncludedSectionARows(variant).length, a ? 1 : 0);
          assert.equal(getIncludedEquipmentRows(variant).length, b ? 1 : 0);
          assert.equal(getIncludedServiceRows(variant).length, c ? 1 : 0);
          assert.equal(getRecurringMonthlyTotal(variant), a ? 100 : 0);
          assert.equal(getEquipmentTotal(variant), b ? 650 : 0);
          assert.equal(getOptionalServicesTotal(variant), c ? 50 : 0);
          assert.equal(getCustomerFacingEquipmentTotal(variant), b && !isLease ? 650 : 0);
          assert.equal(getCustomerFacingEquipmentTotal(variant, 650), b && !isLease ? 650 : 0);
          assert.equal(getCustomerFacingOneTimeTotal(variant), upfront);
          assert.equal(getCustomerFacingOneTimeTotal(variant, 650, 50), upfront);
          assert.equal(getCombinedOneTimeTotal(variant, 650, 50), upfront);
          assert.equal(getLeaseMonthlyTotal(variant), leaseMonthly);
          assert.equal(getLeaseMonthlyTotal(variant, 100, 650), leaseMonthly);
          const lease = getLeasePricingSummary(variant);
          assert.equal(lease.hardwareCost, b ? 650 : 0);
          assert.equal(lease.requiredHardwareRevenue, b ? 1000 : 0);
          assert.equal(lease.hardwareGrossProfit, b ? 350 : 0);
          assert.equal(lease.recurringMonthlyTotal, a ? 100 : 0);
          assert.deepEqual(getLeasePricingSummary(variant, 100, 650), lease);
          const options = getProposalOptionCostSummary(variant);
          assert.deepEqual(options.items.map((item) => item.sourceSection), sectionKeys.filter((key) => variant.sections[key].enabled));
          assert.equal(options.monthlyTotal, Number(((a ? 10 : 0) + (b && isLease ? pricing.optionalHardwareAmount : 0)).toFixed(2)));
          assert.equal(options.oneTimeTotal, (b && !isLease ? 65 : 0) + (c ? 20 : 0));
          const presence = getQuoteContentPresence(variant);
          assert.equal(presence.hasSectionAContent, a);
          assert.equal(presence.hasSectionBContent, b);
          assert.equal(presence.hasSectionCContent, c);
          assert.equal(presence.hasOptionCostsContent, a || b || c);
          assert.deepEqual(buildProposalCommercialSummary(variant).map(({ key, value }) => ({ key, value })), [
            ...(a && !isLease ? [{ key: "recurring-monthly", value: 100 }] : []),
            ...(b && !isLease ? [{ key: "one-time-equipment", value: 650 }] : []),
            ...(c ? [{ key: "field-services", value: 50 }, { key: "one-time-total", value: upfront }] : []),
            ...(isLease ? [{ key: "monthly-total", value: leaseMonthly }] : []),
          ]);
        }

        for (const key of sectionKeys) quote.sections[key].enabled = true;
        assertCommercialPricing(quote, mode, pricing);
      });
    }

    test(`${label} keeps optional-only quotes out of base pricing even with a saved hardware cost`, () => {
      const quote = createCommercialQuote(mode, pricing);
      quote.sections.sectionA.poolRows = quote.sections.sectionA.poolRows.filter((row) => row.optional);
      quote.sections.sectionA.perKitRows = quote.sections.sectionA.perKitRows.filter((row) => row.optional);
      quote.sections.sectionB.lineItems = quote.sections.sectionB.lineItems.filter((row) => row.optional);
      quote.sections.sectionC.lineItems = quote.sections.sectionC.lineItems.filter((row) => row.optional);
      quote.commercial.costs.oneTimeEquipmentCost = 650;
      const expectedOptions = getProposalOptionCostSummary(quote);

      for (const variant of savedQuoteVariants(quote)) {
        assert.deepEqual(getIncludedSectionARows(variant), []);
        assert.deepEqual(getIncludedEquipmentRows(variant), []);
        assert.deepEqual(getIncludedServiceRows(variant), []);
        assert.equal(getRecurringMonthlyTotal(variant), 0);
        assert.equal(getEquipmentTotal(variant), 0);
        assert.equal(getOptionalServicesTotal(variant), 0);
        assert.equal(getCustomerFacingOneTimeTotal(variant), 0);
        assert.equal(getLeaseMonthlyTotal(variant), 0);
        assert.equal(getLeasePricingSummary(variant).hardwareCost, 0);
        assert.equal(getLeasePricingSummary(variant).requiredHardwareRevenue, 0);
        assert.deepEqual(getProposalOptionCostSummary(variant), expectedOptions);
        const presence = getQuoteContentPresence(variant);
        assert.equal(presence.hasSectionAContent, false);
        assert.equal(presence.hasSectionBContent, false);
        assert.equal(presence.hasSectionCContent, false);
        assert.equal(presence.hasOptionCostsContent, true);
      }
    });
  }

  test(`${mode} preserves separately paid, optional paid, and included support on reload`, () => {
    const quote = createCommercialQuote(mode, pricingCases[6]);
    const rows: PerKitPricingRow[] = [
      { id: "paid-support", rowType: "support", description: "Paid support", quantity: 2, unitPrice: 17.5, monthlyRate: 17.5, totalMonthlyRate: 35, includedText: ["24-hour response"] },
      { id: "included-support", rowType: "support", description: "Included support", quantity: null, unitPrice: 0, monthlyRate: 0, totalMonthlyRate: 0 },
      { id: "optional-support", rowType: "support", description: "Optional support", optional: true, quantity: 3, unitPrice: 2.5, monthlyRate: 2.5, totalMonthlyRate: 7.5 },
    ];
    if (mode === "pool") quote.sections.sectionA.poolRows = rows;
    else quote.sections.sectionA.perKitRows = rows;
    quote.sections.sectionB.enabled = false;
    quote.sections.sectionC.enabled = false;

    for (const variant of savedQuoteVariants(quote)) {
      assert.deepEqual(getIncludedSectionARows(variant), rows.slice(0, 2));
      assert.equal(getRecurringMonthlyTotal(variant), 35);
      assert.equal(getQuoteContentPresence(variant).hasSectionAContent, true);
      const options = getProposalOptionCostSummary(variant);
      assert.equal(options.monthlyTotal, 7.5);
      assert.deepEqual(options.items.map(({ amount, unitPrice }) => ({ amount, unitPrice })), [{ amount: 7.5, unitPrice: 2.5 }]);
      assert.deepEqual(buildProposalCommercialSummary(variant), [{ key: "recurring-monthly", label: "Monthly recurring", value: 35 }]);
    }
  });
}

test("zero captured cost does not make quoted hardware free; a positive captured cost keeps precedence", () => {
  const quote = createCommercialQuote("pool", pricingCases[0]);
  for (const variant of savedQuoteVariants(quote)) {
    assert.equal(variant.commercial.costs.oneTimeEquipmentCost, 0);
    assert.equal(getLeasePricingSummary(variant).hardwareCost, 650);
    assert.equal(getLeasePricingSummary(variant).hardwareMonthly, 333.33);
  }
  quote.commercial.costs.oneTimeEquipmentCost = 130;
  for (const variant of savedQuoteVariants(quote)) {
    assert.equal(getLeasePricingSummary(variant).hardwareCost, 130);
    assert.equal(getLeasePricingSummary(variant).requiredHardwareRevenue, 200);
    assert.equal(getLeasePricingSummary(variant).hardwareMonthly, 66.67);
  }
});

test("zero-price included items remain visible without creating charges", () => {
  const quote = createCommercialQuote("pool", pricingCases[6]);
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionC.enabled = false;
  quote.sections.sectionB.lineItems = [{ id: "included-equipment", sourceType: "custom", itemName: "Included equipment", quantity: 1, unitPrice: 0, totalPrice: 0 }];
  for (const variant of savedQuoteVariants(quote)) {
    assert.equal(getIncludedEquipmentRows(variant).length, 1);
    assert.equal(getQuoteContentPresence(variant).hasSectionBContent, true);
    assert.equal(getEquipmentTotal(variant), 0);
    assert.equal(getLeasePricingSummary(variant).hardwareCost, 0);
    assert.equal(getCustomerFacingOneTimeTotal(variant), 0);
  }
});

test("optional unit prices use actual extended amounts, including fractional quantities and small charges", () => {
  const quote = createCommercialQuote("pool", pricingCases[6]);
  const recurring = quote.sections.sectionA.poolRows[1];
  recurring.quantity = 3;
  recurring.unitPrice = 999;
  recurring.monthlyRate = 999;
  recurring.totalMonthlyRate = 10;
  const equipment = quote.sections.sectionB.lineItems[1];
  equipment.quantity = 2.5;
  equipment.unitPrice = 999;
  equipment.totalPrice = 10;
  const service = quote.sections.sectionC.lineItems[1];
  service.quantity = 3;
  service.unitPrice = 999;
  service.totalPrice = 0.01;

  for (const variant of savedQuoteVariants(quote)) {
    const options = getProposalOptionCostSummary(variant);
    assert.deepEqual(options.items.map(({ amount, unitPrice }) => ({ amount, unitPrice })), [
      { amount: 10, unitPrice: 3.3333 },
      { amount: 10, unitPrice: 4 },
      { amount: 0.01, unitPrice: 0.0033 },
    ]);
    assert.equal(options.monthlyTotal, 10);
    assert.equal(options.oneTimeTotal, 10.01);
  }
});

for (const quantity of [0.5, 1, 2, 2.5, 3, 7, 12, 25, 50, 99, 100]) {
  test(`four-decimal optional unit rates reconcile to line amounts for quantity ${quantity}`, () => {
    for (const amount of [0, 0.01, 10, 33.33, 65, -0.01, -10, -33.33]) {
      const quote = createCommercialQuote("pool", pricingCases[6]);
      quote.sections.sectionA.poolRows[1].quantity = quantity;
      quote.sections.sectionA.poolRows[1].totalMonthlyRate = amount;
      quote.sections.sectionB.lineItems[1].quantity = quantity;
      quote.sections.sectionB.lineItems[1].totalPrice = amount;
      quote.sections.sectionC.lineItems[1].quantity = quantity;
      quote.sections.sectionC.lineItems[1].totalPrice = amount;
      const options = getProposalOptionCostSummary(quote);
      assert.equal(options.items.length, 3);
      for (const item of options.items) {
        assert.equal(item.amount, amount);
        assert.ok(item.unitPrice != null && item.quantity != null);
        assert.equal(item.unitPrice, Number(item.unitPrice.toFixed(4)));
        assert.equal(Number((item.unitPrice * item.quantity).toFixed(2)), item.amount);
      }
    }
  });
}

for (const quantity of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`unknown or invalid optional quantity (${String(quantity)}) preserves amount without inventing a unit price`, () => {
    const quote = createCommercialQuote("pool", pricingCases[6]);
    quote.sections.sectionA.poolRows[1].quantity = quantity;
    const option = getProposalOptionCostSummary(quote).items.find((item) => item.sourceSection === "sectionA");
    assert.ok(option);
    assert.equal(option.amount, 10);
    assert.equal(option.unitPrice, undefined);
  });
}

for (const mode of ["pool", "per_kit"] as const) {
  for (const pricing of pricingCases) {
    test(`${mode}: ${pricing.quoteType} ${pricing.termMonths} includes quoted tax once after save/reload`, () => {
      const quote = createCommercialQuote(mode, pricing);
      quote.metadata.salesTaxAmount = 52.5;
      const isLease = pricing.quoteType === "lease";
      for (const variant of savedQuoteVariants(quote)) {
        assert.equal(getQuotedSalesTax(variant), 52.5);
        assert.equal(getEquipmentTotal(variant), 650);
        assert.equal(getOptionalServicesTotal(variant), 50);
        assert.equal(getCustomerFacingEquipmentTotal(variant), isLease ? 0 : 650);
        assert.equal(getCustomerFacingOneTimeTotal(variant), isLease ? 102.5 : 752.5);
        assert.equal(getCustomerFacingOneTimeTotal(variant, 650, 50), isLease ? 102.5 : 752.5);
        assert.equal(getCombinedOneTimeTotal(variant), isLease ? 102.5 : 752.5);
        assert.equal(getRecurringMonthlyTotal(variant), 100);
        assert.equal(getLeaseMonthlyTotal(variant), isLease ? pricing.monthlyTotal : 0);
        assert.equal(getLeasePricingSummary(variant).hardwareCost, 650);
        const options = getProposalOptionCostSummary(variant);
        assert.equal(options.monthlyTotal, pricing.optionalMonthlyTotal);
        assert.equal(options.oneTimeTotal, isLease ? 20 : 85);
        const summary = buildProposalCommercialSummary(variant);
        assert.deepEqual(summary.filter((item) => item.key === "sales-tax"), [{ key: "sales-tax", label: "Quoted sales tax", value: 52.5 }]);
        assert.equal(summary.find((item) => item.key === "one-time-total")?.value, isLease ? 102.5 : 752.5);
      }
    });
  }
}

test("quoted tax remains explicit without field services or with all sections disabled", () => {
  const quote = createCommercialQuote("pool", pricingCases[6]);
  quote.metadata.salesTaxAmount = 25.25;
  quote.sections.sectionC.enabled = false;
  assert.equal(getCustomerFacingOneTimeTotal(quote), 675.25);
  assert.equal(buildProposalCommercialSummary(quote).find((item) => item.key === "one-time-total")?.value, 675.25);
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionB.enabled = false;
  quote.commercial.costs.oneTimeEquipmentCost = 650;
  for (const variant of savedQuoteVariants(quote)) {
    assert.equal(getCustomerFacingOneTimeTotal(variant, 650, 50), 25.25);
    assert.equal(getCombinedOneTimeTotal(variant, 650, 50), 25.25);
    assert.equal(getEquipmentTotal(variant), 0);
    assert.equal(getOptionalServicesTotal(variant), 0);
    assert.deepEqual(buildProposalCommercialSummary(variant), [
      { key: "sales-tax", label: "Quoted sales tax", value: 25.25 },
      { key: "one-time-total", label: "One-time total", value: 25.25 },
    ]);
  }
});

test("quoted tax is rounded to cents and never changes pre-tax totals", () => {
  const quote = createCommercialQuote("pool", pricingCases[6]);
  quote.metadata.salesTaxAmount = 12.349;
  assert.equal(getQuotedSalesTax(quote), 12.35);
  assert.equal(getCustomerFacingOneTimeTotal(quote), 712.35);
  assert.equal(getEquipmentTotal(quote), 650);
  assert.equal(getOptionalServicesTotal(quote), 50);
});

for (const tax of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "25.25"]) {
  test(`invalid quoted tax (${String(tax)}) does not poison customer totals`, () => {
    const quote = createCommercialQuote("pool", pricingCases[6]);
    Object.assign(quote.metadata, { salesTaxAmount: tax });
    assert.equal(getQuotedSalesTax(quote), 0);
    assert.equal(getCustomerFacingOneTimeTotal(quote), 700);
    assert.equal(getCombinedOneTimeTotal(quote), 700);
    assert.equal(buildProposalCommercialSummary(quote).some((item) => item.key === "sales-tax"), false);
  });
}

test("Ilios keeps a pre-tax subtotal and adds sales tax exactly once", () => {
  const quote = createCommercialQuote("pool", pricingCases[6]);
  quote.metadata.companyKey = "ilios";
  quote.metadata.outputTemplateKey = "estimate_compact";
  quote.metadata.salesTaxAmount = 25.25;
  const model = buildEstimateTemplateModel(quote);
  assert.ok(model);
  assert.equal(model.subtotal, 800);
  assert.equal(model.salesTaxAmount, 25.25);
  assert.equal(model.total, 825.25);
  assert.equal(getCustomerFacingOneTimeTotal(quote), 725.25);

  quote.sections.sectionA.enabled = false;
  const oneTimeOnly = buildEstimateTemplateModel(quote);
  assert.ok(oneTimeOnly);
  assert.equal(oneTimeOnly.subtotal, 700);
  assert.equal(oneTimeOnly.total, getCustomerFacingOneTimeTotal(quote));
  quote.sections.sectionB.enabled = false;
  quote.sections.sectionC.enabled = false;
  const taxOnly = buildEstimateTemplateModel(quote);
  assert.ok(taxOnly);
  assert.equal(taxOnly.subtotal, 0);
  assert.equal(taxOnly.total, 25.25);
});

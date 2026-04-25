import type { MajorProjectLineItem, MajorProjectOption, QuoteRecord } from "@/app/lib/quote-record";

export type MajorProjectServiceMix = "managed-network" | "starlink-pool" | "starlink-per-site" | "hybrid";

function createDefaultMajorProjectLineItem(): MajorProjectLineItem {
  return {
    id: "major-line-1",
    vendor: "",
    manufacturer: "",
    category: "third-party hardware",
    lineType: "hardware",
    description: "",
    quantity: 1,
    unit: "ea",
    customerUnitPrice: 0,
    customerExtendedPrice: 0,
    vendorUnitCost: 0,
    vendorExtendedCost: 0,
    schedule: "one_time",
    costBasis: "estimate",
    resaleBasis: "cost_plus",
    laborBucket: "",
    serviceBucket: "",
    passThrough: false,
    notes: "",
  };
}

function normalizeLineItem(lineItem: Partial<MajorProjectLineItem> | undefined, index: number): MajorProjectLineItem {
  const defaults = createDefaultMajorProjectLineItem();
  const quantity = Math.max(Number(lineItem?.quantity ?? defaults.quantity) || defaults.quantity, 0);
  const customerUnitPrice = Number(lineItem?.customerUnitPrice ?? defaults.customerUnitPrice) || 0;
  const vendorUnitCost = Number(lineItem?.vendorUnitCost ?? defaults.vendorUnitCost) || 0;
  const customerExtendedPrice = lineItem?.customerExtendedPrice ?? Number((quantity * customerUnitPrice).toFixed(2));
  const vendorExtendedCost = lineItem?.vendorExtendedCost ?? Number((quantity * vendorUnitCost).toFixed(2));

  return {
    ...defaults,
    ...lineItem,
    id: lineItem?.id ?? `major-line-${index + 1}`,
    quantity,
    customerUnitPrice,
    customerExtendedPrice: Number(customerExtendedPrice.toFixed(2)),
    vendorUnitCost,
    vendorExtendedCost: Number(vendorExtendedCost.toFixed(2)),
  };
}

function computeOptionVendorSummary(option: MajorProjectOption) {
  const summaryMap = new Map<string, { vendor: string; manufacturer?: string; oneTimeRevenue: number; recurringRevenue: number; oneTimeCost: number; recurringCost: number }>();

  for (const lineItem of option.lineItems ?? []) {
    const key = `${lineItem.vendor || "Unassigned vendor"}::${lineItem.manufacturer || ""}`;
    const current = summaryMap.get(key) ?? {
      vendor: lineItem.vendor || "Unassigned vendor",
      manufacturer: lineItem.manufacturer || undefined,
      oneTimeRevenue: 0,
      recurringRevenue: 0,
      oneTimeCost: 0,
      recurringCost: 0,
    };

    if (lineItem.schedule === "recurring") {
      current.recurringRevenue += lineItem.customerExtendedPrice;
      current.recurringCost += lineItem.vendorExtendedCost;
    } else {
      current.oneTimeRevenue += lineItem.customerExtendedPrice;
      current.oneTimeCost += lineItem.vendorExtendedCost;
    }

    summaryMap.set(key, current);
  }

  return Array.from(summaryMap.values()).map((entry) => ({
    ...entry,
    oneTimeRevenue: Number(entry.oneTimeRevenue.toFixed(2)),
    recurringRevenue: Number(entry.recurringRevenue.toFixed(2)),
    oneTimeCost: Number(entry.oneTimeCost.toFixed(2)),
    recurringCost: Number(entry.recurringCost.toFixed(2)),
  }));
}

function normalizeOption(option: Partial<MajorProjectOption> | undefined, index: number): MajorProjectOption {
  const normalizedLineItems = (option?.lineItems ?? []).map((lineItem, lineIndex) => normalizeLineItem(lineItem, lineIndex));
  const normalizedOption: MajorProjectOption = {
    id: option?.id ?? `major-option-${index + 1}`,
    label: option?.label ?? `Option ${index + 1}`,
    description: option?.description,
    siteCount: Number(option?.siteCount ?? 1) || 1,
    monthlyRatePerSite: Number(option?.monthlyRatePerSite ?? 0) || 0,
    hardwarePerSite: Number(option?.hardwarePerSite ?? 0) || 0,
    installPerSite: Number(option?.installPerSite ?? 0) || 0,
    otherOneTimePerSite: Number(option?.otherOneTimePerSite ?? 0) || 0,
    vendorRecurringPerSite: Number(option?.vendorRecurringPerSite ?? 0) || 0,
    supportRecurringPerSite: Number(option?.supportRecurringPerSite ?? 0) || 0,
    otherRecurringPerSite: Number(option?.otherRecurringPerSite ?? 0) || 0,
    lineItems: normalizedLineItems,
    vendorSummary: [],
  };

  normalizedOption.vendorSummary = computeOptionVendorSummary(normalizedOption);
  return normalizedOption;
}

function sumLineItems(lineItems: MajorProjectLineItem[], schedule: "one_time" | "recurring", predicate?: (lineItem: MajorProjectLineItem) => boolean) {
  return lineItems.reduce((sum, lineItem) => {
    if (lineItem.schedule !== schedule) return sum;
    if (predicate && !predicate(lineItem)) return sum;
    return sum + lineItem.customerExtendedPrice;
  }, 0);
}

function sumLineCosts(lineItems: MajorProjectLineItem[], schedule: "one_time" | "recurring", predicate?: (lineItem: MajorProjectLineItem) => boolean) {
  return lineItems.reduce((sum, lineItem) => {
    if (lineItem.schedule !== schedule) return sum;
    if (predicate && !predicate(lineItem)) return sum;
    return sum + lineItem.vendorExtendedCost;
  }, 0);
}

function buildLineItemMetrics(option: MajorProjectOption | null) {
  const lineItems = option?.lineItems ?? [];
  const recurringRevenue = Number(sumLineItems(lineItems, "recurring").toFixed(2));
  const oneTimeRevenue = Number(sumLineItems(lineItems, "one_time").toFixed(2));
  const recurringCost = Number(sumLineCosts(lineItems, "recurring").toFixed(2));
  const oneTimeCost = Number(sumLineCosts(lineItems, "one_time").toFixed(2));

  return {
    hasStructuredLineItems: lineItems.length > 0,
    lineItems,
    recurringRevenue,
    oneTimeRevenue,
    recurringCost,
    oneTimeCost,
    oneTimeHardwareRevenue: Number(sumLineItems(lineItems, "one_time", (lineItem) => lineItem.lineType === "hardware").toFixed(2)),
    oneTimeInstallRevenue: Number(sumLineItems(lineItems, "one_time", (lineItem) => lineItem.lineType === "installation").toFixed(2)),
    oneTimeOtherRevenue: Number(sumLineItems(lineItems, "one_time", (lineItem) => lineItem.lineType !== "hardware" && lineItem.lineType !== "installation").toFixed(2)),
    recurringVendorCost: Number(sumLineCosts(lineItems, "recurring", (lineItem) => !lineItem.passThrough).toFixed(2)),
    recurringPassThroughRevenue: Number(sumLineItems(lineItems, "recurring", (lineItem) => lineItem.passThrough).toFixed(2)),
  };
}

export function createDefaultMajorProjectState() {
  return {
    enabled: false,
    summary: {
      projectName: "",
      projectDescription: "",
      versionLabel: "Commercial Model v1",
      paymentTerms: "Net 30",
      billingStart: "Upon delivery and activation",
      assumptions: "Internal systems-integration commercial worksheet for multi-vendor projects. Proposal output is generated downstream from this structure.",
    },
    commercial: {
      termMonths: 36,
      serviceMix: "managed-network" as MajorProjectServiceMix,
      siteCount: 1,
      activeSites: 1,
      monthlyRatePerSite: 0,
      oneTimeHardwarePerSite: 0,
      oneTimeInstallPerSite: 0,
      oneTimeOtherPerSite: 0,
      recurringVendorPerSite: 0,
      recurringSupportPerSite: 0,
      recurringOtherPerSite: 0,
      includeHardware: true,
      includeInstallation: true,
      includeOptionalServices: true,
      installationLabel: "Deployment and commissioning",
      equipmentLabel: "Project hardware package",
      recurringLabel: "Managed communications service",
      optionalServicesLabel: "Program management and site engineering",
      optionalServicesAmount: 0,
      overageRatePerGb: 0,
      terminalFeePerSite: 0,
    },
    options: [
      normalizeOption({
        id: "major-option-1",
        label: "Option 1",
        description: "Base deployment structure",
        siteCount: 1,
        monthlyRatePerSite: 0,
        hardwarePerSite: 0,
        installPerSite: 0,
        otherOneTimePerSite: 0,
        vendorRecurringPerSite: 0,
        supportRecurringPerSite: 0,
        otherRecurringPerSite: 0,
      }, 0),
    ],
    activeOptionId: "major-option-1",
  };
}

export function getActiveMajorProjectOption(quote: QuoteRecord) {
  const activeId = quote.majorProject?.activeOptionId;
  return quote.majorProject?.options.find((option) => option.id === activeId) ?? quote.majorProject?.options[0] ?? null;
}

export function ensureMajorProjectState(quote: QuoteRecord): QuoteRecord {
  const defaults = createDefaultMajorProjectState();
  const optionSource = quote.majorProject?.options?.length ? quote.majorProject.options : defaults.options;
  const options = optionSource.map((option, index) => normalizeOption(option, index));

  return {
    ...quote,
    majorProject: {
      ...defaults,
      ...quote.majorProject,
      summary: {
        ...defaults.summary,
        ...quote.majorProject?.summary,
      },
      commercial: {
        ...defaults.commercial,
        ...quote.majorProject?.commercial,
      },
      options,
      activeOptionId: quote.majorProject?.activeOptionId ?? options[0]?.id ?? defaults.activeOptionId,
    },
  };
}

export function buildMajorProjectMetrics(quote: QuoteRecord) {
  const safeQuote = ensureMajorProjectState(quote);
  const state = safeQuote.majorProject;
  const activeOption = getActiveMajorProjectOption(safeQuote);
  const lineItemMetrics = buildLineItemMetrics(activeOption);
  const siteCount = Math.max(activeOption?.siteCount ?? state.commercial.siteCount, 0);

  const fallbackRecurringRevenue = siteCount * (activeOption?.monthlyRatePerSite ?? state.commercial.monthlyRatePerSite);
  const fallbackHardwareRevenue = state.commercial.includeHardware ? siteCount * (activeOption?.hardwarePerSite ?? state.commercial.oneTimeHardwarePerSite) : 0;
  const fallbackInstallRevenue = state.commercial.includeInstallation ? siteCount * (activeOption?.installPerSite ?? state.commercial.oneTimeInstallPerSite) : 0;
  const fallbackOtherOneTimeRevenue = siteCount * (activeOption?.otherOneTimePerSite ?? state.commercial.oneTimeOtherPerSite);
  const fallbackOptionalServicesRevenue = state.commercial.includeOptionalServices ? state.commercial.optionalServicesAmount : 0;
  const fallbackOneTimeRevenue = fallbackHardwareRevenue + fallbackInstallRevenue + fallbackOtherOneTimeRevenue + fallbackOptionalServicesRevenue;
  const fallbackRecurringCost = siteCount * (
    (activeOption?.vendorRecurringPerSite ?? state.commercial.recurringVendorPerSite)
    + (activeOption?.supportRecurringPerSite ?? state.commercial.recurringSupportPerSite)
    + (activeOption?.otherRecurringPerSite ?? state.commercial.recurringOtherPerSite)
  );
  const fallbackOneTimeCost = siteCount * (
    (activeOption?.hardwarePerSite ?? state.commercial.oneTimeHardwarePerSite)
    + (activeOption?.installPerSite ?? state.commercial.oneTimeInstallPerSite)
    + (activeOption?.otherOneTimePerSite ?? state.commercial.oneTimeOtherPerSite)
  );

  const recurringRevenue = lineItemMetrics.hasStructuredLineItems ? lineItemMetrics.recurringRevenue : fallbackRecurringRevenue;
  const hardwareRevenue = lineItemMetrics.hasStructuredLineItems ? lineItemMetrics.oneTimeHardwareRevenue : fallbackHardwareRevenue;
  const installRevenue = lineItemMetrics.hasStructuredLineItems ? lineItemMetrics.oneTimeInstallRevenue : fallbackInstallRevenue;
  const otherOneTimeRevenue = lineItemMetrics.hasStructuredLineItems ? lineItemMetrics.oneTimeOtherRevenue : fallbackOtherOneTimeRevenue;
  const optionalServicesRevenue = lineItemMetrics.hasStructuredLineItems ? 0 : fallbackOptionalServicesRevenue;
  const oneTimeRevenue = lineItemMetrics.hasStructuredLineItems ? lineItemMetrics.oneTimeRevenue : fallbackOneTimeRevenue;
  const recurringCost = lineItemMetrics.hasStructuredLineItems ? lineItemMetrics.recurringCost : fallbackRecurringCost;
  const oneTimeCost = lineItemMetrics.hasStructuredLineItems ? lineItemMetrics.oneTimeCost : fallbackOneTimeCost;
  const totalRevenue = recurringRevenue + oneTimeRevenue;
  const totalCost = recurringCost + oneTimeCost;
  const totalGrossProfit = totalRevenue - totalCost;

  return {
    siteCount,
    lineItems: lineItemMetrics.lineItems,
    vendorSummary: activeOption?.vendorSummary ?? [],
    hasStructuredLineItems: lineItemMetrics.hasStructuredLineItems,
    recurringRevenue: Number(recurringRevenue.toFixed(2)),
    hardwareRevenue: Number(hardwareRevenue.toFixed(2)),
    installRevenue: Number(installRevenue.toFixed(2)),
    otherOneTimeRevenue: Number(otherOneTimeRevenue.toFixed(2)),
    optionalServicesRevenue: Number(optionalServicesRevenue.toFixed(2)),
    oneTimeRevenue: Number(oneTimeRevenue.toFixed(2)),
    recurringCost: Number(recurringCost.toFixed(2)),
    oneTimeCost: Number(oneTimeCost.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
    totalGrossMarginPercent: totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0,
  };
}

export function applyMajorProjectToQuote(quote: QuoteRecord): QuoteRecord {
  const safeQuote = ensureMajorProjectState(quote);
  const state = safeQuote.majorProject;
  const activeOption = getActiveMajorProjectOption(safeQuote);
  const metrics = buildMajorProjectMetrics(safeQuote);
  const lineItems = metrics.lineItems;
  const siteCount = metrics.siteCount;
  const recurringPerSite = activeOption?.monthlyRatePerSite ?? state.commercial.monthlyRatePerSite;
  const hardwarePerSite = activeOption?.hardwarePerSite ?? state.commercial.oneTimeHardwarePerSite;
  const installPerSite = activeOption?.installPerSite ?? state.commercial.oneTimeInstallPerSite;
  const otherOneTimePerSite = activeOption?.otherOneTimePerSite ?? state.commercial.oneTimeOtherPerSite;
  const vendorRecurringPerSite = activeOption?.vendorRecurringPerSite ?? state.commercial.recurringVendorPerSite;
  const supportRecurringPerSite = activeOption?.supportRecurringPerSite ?? state.commercial.recurringSupportPerSite;
  const otherRecurringPerSite = activeOption?.otherRecurringPerSite ?? state.commercial.recurringOtherPerSite;

  const next = JSON.parse(JSON.stringify(safeQuote)) as QuoteRecord;
  next.metadata.workflowMode = "major_project";
  next.metadata.documentSubtitle = next.metadata.documentSubtitle || "Major Project Commercial Proposal";
  next.sections.sectionA.enabled = true;
  next.sections.sectionA.builderLabel = "Major project recurring structure";
  next.sections.sectionA.title = state.summary.projectName
    ? `${state.summary.projectName} recurring commercial structure`
    : "Major project recurring commercial structure";
  next.sections.sectionA.termMonths = state.commercial.termMonths;
  next.sections.sectionA.introText = `Commercial structure based on ${siteCount} site${siteCount === 1 ? "" : "s"} over a ${state.commercial.termMonths}-month term.`;
  next.sections.sectionA.explanatoryParagraphs = compact([
    state.summary.projectDescription,
    state.summary.assumptions,
    metrics.hasStructuredLineItems ? "Internal model supports multi-vendor cost and margin analysis; proposal output is rolled up for customer presentation." : "",
  ]);
  next.sections.sectionA.mode = state.commercial.serviceMix === "starlink-pool" ? "pool" : "per_kit";

  const recurringRowDescription = `${state.commercial.recurringLabel} — ${activeOption?.label ?? state.summary.versionLabel}`;
  if (next.sections.sectionA.mode === "pool") {
    next.sections.sectionA.poolRows = [
      {
        id: "major_recurring",
        rowType: "service",
        description: recurringRowDescription,
        quantity: siteCount,
        unitLabel: "site",
        unitPrice: recurringPerSite,
        monthlyRate: recurringPerSite,
        totalMonthlyRate: Number((siteCount * recurringPerSite).toFixed(2)),
        sourceLabel: metrics.hasStructuredLineItems ? "Major Project model (rolled up from line items)" : "Major Project model",
      },
      ...(state.commercial.terminalFeePerSite > 0 ? [{
        id: "major_terminal_fee",
        rowType: "terminal_fee" as const,
        description: "Terminal access fee",
        quantity: siteCount,
        unitLabel: "site",
        unitPrice: state.commercial.terminalFeePerSite,
        monthlyRate: state.commercial.terminalFeePerSite,
        totalMonthlyRate: Number((siteCount * state.commercial.terminalFeePerSite).toFixed(2)),
        sourceLabel: "Major Project model",
      }] : []),
      ...(state.commercial.overageRatePerGb > 0 ? [{
        id: "major_overage",
        rowType: "overage" as const,
        description: "Program overage rate",
        quantity: null,
        unitLabel: "GB",
        unitPrice: state.commercial.overageRatePerGb,
        monthlyRate: state.commercial.overageRatePerGb,
        totalMonthlyRate: state.commercial.overageRatePerGb,
        sourceLabel: "Major Project model",
      }] : []),
      {
        id: "major_support",
        rowType: "support",
        description: "Program support and reporting",
        includedText: compact([
          `${siteCount} site${siteCount === 1 ? "" : "s"} under commercial management`,
          state.summary.paymentTerms ? `Payment terms: ${state.summary.paymentTerms}` : "",
          state.summary.billingStart ? `Billing start: ${state.summary.billingStart}` : "",
          metrics.hasStructuredLineItems ? `${metrics.vendorSummary.length} vendor bucket${metrics.vendorSummary.length === 1 ? "" : "s"} rolled into internal margin model` : "",
        ]),
        sourceLabel: "Major Project model",
      },
    ];
    next.sections.sectionA.perKitRows = [];
  } else {
    next.sections.sectionA.perKitRows = [
      {
        id: "major_recurring",
        rowType: "service",
        description: recurringRowDescription,
        quantity: siteCount,
        unitLabel: "site",
        unitPrice: recurringPerSite,
        monthlyRate: recurringPerSite,
        totalMonthlyRate: Number((siteCount * recurringPerSite).toFixed(2)),
        sourceLabel: metrics.hasStructuredLineItems ? "Major Project model (rolled up from line items)" : "Major Project model",
      },
      ...(state.commercial.terminalFeePerSite > 0 ? [{
        id: "major_terminal_fee",
        rowType: "terminal_fee" as const,
        description: "Terminal access fee",
        quantity: siteCount,
        unitLabel: "site",
        unitPrice: state.commercial.terminalFeePerSite,
        monthlyRate: state.commercial.terminalFeePerSite,
        totalMonthlyRate: Number((siteCount * state.commercial.terminalFeePerSite).toFixed(2)),
        sourceLabel: "Major Project model",
      }] : []),
      {
        id: "major_support",
        rowType: "support",
        description: "Program support and reporting",
        includedText: compact([
          `${siteCount} site${siteCount === 1 ? "" : "s"} under commercial management`,
          state.summary.paymentTerms ? `Payment terms: ${state.summary.paymentTerms}` : "",
          state.summary.billingStart ? `Billing start: ${state.summary.billingStart}` : "",
          metrics.hasStructuredLineItems ? `${metrics.vendorSummary.length} vendor bucket${metrics.vendorSummary.length === 1 ? "" : "s"} rolled into internal margin model` : "",
        ]),
        sourceLabel: "Major Project model",
      },
    ];
    next.sections.sectionA.poolRows = [];
  }

  const oneTimeHardwareRows = lineItems.filter((lineItem) => lineItem.schedule === "one_time" && lineItem.lineType === "hardware");
  next.sections.sectionB.enabled = metrics.hasStructuredLineItems
    ? oneTimeHardwareRows.length > 0
    : state.commercial.includeHardware && hardwarePerSite > 0;
  next.sections.sectionB.builderLabel = "Major project hardware";
  next.sections.sectionB.title = state.commercial.equipmentLabel;
  next.sections.sectionB.introText = metrics.hasStructuredLineItems
    ? "Hardware totals are rolled up from internal multi-vendor major project line items."
    : "Hardware totals are generated from the major project commercial model.";
  next.sections.sectionB.lineItems = metrics.hasStructuredLineItems
    ? oneTimeHardwareRows.map((lineItem) => ({
      id: lineItem.id,
      sourceType: "custom" as const,
      itemName: lineItem.description,
      itemCategory: lineItem.category,
      terminalType: undefined,
      partNumber: undefined,
      quantity: lineItem.quantity,
      unitPrice: lineItem.customerUnitPrice,
      totalPrice: lineItem.customerExtendedPrice,
      description: compact([lineItem.vendor, lineItem.manufacturer]).join(" • ") || activeOption?.description || state.summary.projectDescription,
      sourceLabel: lineItem.vendor || "Major Project model",
    }))
    : next.sections.sectionB.enabled ? [{
      id: "major_hardware",
      sourceType: "custom",
      itemName: state.commercial.equipmentLabel,
      itemCategory: "Major Project",
      terminalType: undefined,
      partNumber: undefined,
      quantity: siteCount,
      unitPrice: hardwarePerSite,
      totalPrice: Number((siteCount * hardwarePerSite).toFixed(2)),
      description: activeOption?.description || state.summary.projectDescription,
      sourceLabel: "Major Project model",
    }] : [];

  const serviceLineItems = lineItems.filter((lineItem) => lineItem.schedule === "one_time" && lineItem.lineType !== "hardware");
  next.sections.sectionC.enabled = metrics.hasStructuredLineItems
    ? serviceLineItems.length > 0
    : (state.commercial.includeInstallation && installPerSite > 0)
      || otherOneTimePerSite > 0
      || (state.commercial.includeOptionalServices && state.commercial.optionalServicesAmount > 0);
  next.sections.sectionC.builderLabel = "Major project services";
  next.sections.sectionC.title = "Major project field services";
  next.sections.sectionC.introText = metrics.hasStructuredLineItems
    ? "Services and allowances are rolled up from internal multi-vendor major project line items."
    : "Services and allowances are generated from the major project commercial model.";
  next.sections.sectionC.lineItems = metrics.hasStructuredLineItems
    ? serviceLineItems.map((lineItem) => ({
      id: lineItem.id,
      sourceType: "custom" as const,
      description: lineItem.description,
      quantity: lineItem.quantity,
      unitPrice: lineItem.customerUnitPrice,
      totalPrice: lineItem.customerExtendedPrice,
      unitLabel: lineItem.unit,
      notes: compact([
        lineItem.vendor ? `Vendor: ${lineItem.vendor}` : "",
        lineItem.passThrough ? "Pass-through" : "Margin-bearing",
        lineItem.laborBucket ? `Labor bucket: ${lineItem.laborBucket}` : "",
        lineItem.serviceBucket ? `Service bucket: ${lineItem.serviceBucket}` : "",
      ]).join(" • "),
      serviceCategory: lineItem.lineType === "installation" ? "installation" : "custom",
      pricingStage: "budgetary",
      sourceLabel: lineItem.vendor || "Major Project model",
    }))
    : compactItems([
      state.commercial.includeInstallation && installPerSite > 0 ? {
        id: "major_installation",
        sourceType: "custom" as const,
        description: state.commercial.installationLabel,
        quantity: siteCount,
        unitPrice: installPerSite,
        totalPrice: Number((siteCount * installPerSite).toFixed(2)),
        notes: activeOption?.description || "Generated from major project model",
        serviceCategory: "installation" as const,
        pricingStage: "budgetary" as const,
        sourceLabel: "Major Project model",
      } : null,
      otherOneTimePerSite > 0 ? {
        id: "major_other_onetime",
        sourceType: "custom" as const,
        description: "Other one-time project allowance",
        quantity: siteCount,
        unitPrice: otherOneTimePerSite,
        totalPrice: Number((siteCount * otherOneTimePerSite).toFixed(2)),
        notes: "Generated from major project model",
        serviceCategory: "custom" as const,
        pricingStage: "budgetary" as const,
        sourceLabel: "Major Project model",
      } : null,
      state.commercial.includeOptionalServices && state.commercial.optionalServicesAmount > 0 ? {
        id: "major_optional_services",
        sourceType: "custom" as const,
        description: state.commercial.optionalServicesLabel,
        quantity: 1,
        unitPrice: state.commercial.optionalServicesAmount,
        totalPrice: Number(state.commercial.optionalServicesAmount.toFixed(2)),
        notes: "Program-level engineering or management allowance",
        serviceCategory: "custom" as const,
        pricingStage: "budgetary" as const,
        sourceLabel: "Major Project model",
      } : null,
    ]);

  next.commercial.meta.optionLabel = activeOption?.label ?? state.summary.versionLabel;
  next.commercial.meta.comparisonGroup = state.summary.projectName || "Major Project";
  next.commercial.meta.notes = compact([
    state.summary.assumptions,
    metrics.hasStructuredLineItems ? "Commercial model includes multi-vendor line-level margin structure." : "",
  ]).join(" ");
  next.commercial.costs.oneTimeEquipmentCost = metrics.hasStructuredLineItems
    ? Number(metrics.lineItems.filter((lineItem) => lineItem.schedule === "one_time" && lineItem.lineType === "hardware").reduce((sum, lineItem) => sum + lineItem.vendorExtendedCost, 0).toFixed(2))
    : Number((siteCount * hardwarePerSite).toFixed(2));
  next.commercial.costs.oneTimeLaborCost = metrics.hasStructuredLineItems
    ? Number(metrics.lineItems.filter((lineItem) => lineItem.schedule === "one_time" && (lineItem.lineType === "installation" || lineItem.lineType === "service" || lineItem.lineType === "support" || lineItem.lineType === "managed_service")).reduce((sum, lineItem) => sum + lineItem.vendorExtendedCost, 0).toFixed(2))
    : Number((siteCount * installPerSite).toFixed(2));
  next.commercial.costs.oneTimeOtherCost = metrics.hasStructuredLineItems
    ? Number(metrics.lineItems.filter((lineItem) => lineItem.schedule === "one_time" && lineItem.lineType !== "hardware" && lineItem.lineType !== "installation" && lineItem.lineType !== "service" && lineItem.lineType !== "support" && lineItem.lineType !== "managed_service").reduce((sum, lineItem) => sum + lineItem.vendorExtendedCost, 0).toFixed(2))
    : Number((siteCount * otherOneTimePerSite).toFixed(2));
  next.commercial.costs.recurringVendorCost = metrics.hasStructuredLineItems
    ? Number(metrics.lineItems.filter((lineItem) => lineItem.schedule === "recurring" && (lineItem.lineType === "subscription" || lineItem.lineType === "software" || lineItem.lineType === "hardware")).reduce((sum, lineItem) => sum + lineItem.vendorExtendedCost, 0).toFixed(2))
    : Number((siteCount * vendorRecurringPerSite).toFixed(2));
  next.commercial.costs.recurringSupportCost = metrics.hasStructuredLineItems
    ? Number(metrics.lineItems.filter((lineItem) => lineItem.schedule === "recurring" && (lineItem.lineType === "support" || lineItem.lineType === "managed_service")).reduce((sum, lineItem) => sum + lineItem.vendorExtendedCost, 0).toFixed(2))
    : Number((siteCount * supportRecurringPerSite).toFixed(2));
  next.commercial.costs.recurringOtherCost = metrics.hasStructuredLineItems
    ? Number(metrics.lineItems.filter((lineItem) => lineItem.schedule === "recurring" && lineItem.lineType !== "subscription" && lineItem.lineType !== "software" && lineItem.lineType !== "hardware" && lineItem.lineType !== "support" && lineItem.lineType !== "managed_service").reduce((sum, lineItem) => sum + lineItem.vendorExtendedCost, 0).toFixed(2))
    : Number((siteCount * otherRecurringPerSite).toFixed(2));

  next.sections.sectionA.computed.monthlyRecurringTotal = next.sections.sectionA.mode === "pool"
    ? next.sections.sectionA.poolRows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0)
    : next.sections.sectionA.perKitRows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0);
  next.sections.sectionB.computed.equipmentTotal = next.sections.sectionB.lineItems.reduce((sum, row) => sum + row.totalPrice, 0);
  next.sections.sectionC.computed.serviceTotal = next.sections.sectionC.lineItems.reduce((sum, row) => sum + row.totalPrice, 0);

  return next;
}

function compact(values: Array<string | undefined | null>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function compactItems<T>(values: Array<T | null>) {
  return values.filter((value): value is T => Boolean(value));
}

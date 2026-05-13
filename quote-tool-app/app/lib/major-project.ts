import type {
  MajorProjectBundle,
  MajorProjectBuilderMode,
  MajorProjectComponent,
  MajorProjectCustomerQuoteLine,
  MajorProjectOption,
  MajorProjectSpecAttachment,
  MajorProjectSimpleBucket,
  MajorProjectSimpleRow,
  QuoteRecord,
} from "@/app/lib/quote-record";
import { normalizeMajorProjectSpecAttachment } from "@/app/lib/major-project-spec-attachments";

export type MajorProjectServiceMix = "managed-network" | "starlink-pool" | "starlink-per-site" | "hybrid";
export type MajorProjectValidationSeverity = "error" | "warning";

export type MajorProjectValidationIssue = {
  code:
    | "duplicate_component_ids"
    | "duplicate_bundle_ids"
    | "duplicate_quote_line_ids"
    | "bundle_missing_components"
    | "bundle_component_conflict"
    | "component_in_multiple_bundles"
    | "component_bundle_assignment_mismatch"
    | "quote_line_missing_bundles"
    | "quote_line_missing_components"
    | "quote_line_without_backing_economics"
    | "missing_source_components"
    | "missing_source_bundles"
    | "component_unmapped_to_bundle"
    | "component_unmapped_to_quote_line"
    | "component_duplicate_quote_line_coverage"
    | "bundle_not_presented"
    | "missing_customer_quote_lines";
  severity: MajorProjectValidationSeverity;
  message: string;
  componentIds?: string[];
  bundleIds?: string[];
  quoteLineIds?: string[];
};

export type MajorProjectValidationSummary = {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  issues: MajorProjectValidationIssue[];
  uncoveredComponentIds: string[];
  unpresentedBundleIds: string[];
  quoteLinesWithoutEconomics: string[];
};

export type MajorProjectBundleMetrics = MajorProjectBundle & {
  resolvedComponentIds: string[];
  oneTimeRevenue: number;
  recurringRevenue: number;
  oneTimeCost: number;
  recurringCost: number;
};

export type MajorProjectCustomerQuoteLineMetrics = MajorProjectCustomerQuoteLine & {
  resolvedBundleIds: string[];
  resolvedCostComponentIds: string[];
  resolvedRevenueComponentIds: string[];
  resolvedSpecSheetLabel?: string;
  resolvedSpecSheetLocation?: string;
  oneTimeRevenue: number;
  recurringRevenue: number;
  oneTimeCost: number;
  recurringCost: number;
  costComponents: MajorProjectComponent[];
  revenueComponents: MajorProjectComponent[];
};

export type MajorProjectMetrics = {
  termMonths: number;
  siteCount: number;
  components: MajorProjectComponent[];
  simpleRows: MajorProjectSimpleRow[];
  bundles: MajorProjectBundleMetrics[];
  customerQuoteLines: MajorProjectCustomerQuoteLineMetrics[];
  vendorSummary: Array<{
    vendor: string;
    manufacturer?: string;
    oneTimeRevenue: number;
    recurringRevenue: number;
    oneTimeCost: number;
    recurringCost: number;
  }>;
  validation: MajorProjectValidationSummary;
  builderMode: MajorProjectBuilderMode;
  usingSimpleBuilder: boolean;
  hasThreeLayerModel: boolean;
  recurringRevenue: number;
  recurringContractRevenue: number;
  hardwareRevenue: number;
  installRevenue: number;
  otherOneTimeRevenue: number;
  optionalServicesRevenue: number;
  oneTimeRevenue: number;
  recurringCost: number;
  recurringContractCost: number;
  oneTimeCost: number;
  recurringContractGrossProfit: number;
  recurringContractGrossMarginPercent: number;
  totalContractRevenue: number;
  totalContractCost: number;
  totalContractGrossProfit: number;
  totalContractGrossMarginPercent: number;
  totalRevenue: number;
  totalCost: number;
  totalGrossProfit: number;
  totalGrossMarginPercent: number;
};

export type MajorProjectOutputSpecAttachment = {
  attachment: MajorProjectSpecAttachment;
  sourceType: "simple_row" | "bundle" | "quote_line";
  sourceId: string;
  sourceLabel: string;
  outputSection: "sectionA" | "sectionB" | "sectionC";
  outputItemId: string;
  outputItemLabel: string;
};

export function majorProjectLineTypeLabel(lineType: MajorProjectComponent["lineType"]) {
  switch (lineType) {
    case "hardware":
      return "Hardware";
    case "software":
      return "Software";
    case "subscription":
      return "Subscription";
    case "installation":
      return "Installation";
    case "service":
      return "Service";
    case "support":
      return "Support";
    case "managed_service":
      return "Managed service";
    case "optional_service":
      return "Optional service";
    case "internal_labor":
      return "Internal labor";
    case "shipping":
      return "Shipping";
    case "tax":
      return "Tax";
    default:
      return "Other";
  }
}

const outputSpecAttachmentSectionOrder: Record<MajorProjectOutputSpecAttachment["outputSection"], number> = {
  sectionA: 0,
  sectionB: 1,
  sectionC: 2,
};

const outputSpecAttachmentSourceTypeOrder: Record<MajorProjectOutputSpecAttachment["sourceType"], number> = {
  quote_line: 0,
  bundle: 1,
  simple_row: 2,
};

function compareOutputSpecAttachmentText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

function compareMajorProjectOutputSpecAttachments(left: MajorProjectOutputSpecAttachment, right: MajorProjectOutputSpecAttachment) {
  return (
    outputSpecAttachmentSectionOrder[left.outputSection] - outputSpecAttachmentSectionOrder[right.outputSection]
    || compareOutputSpecAttachmentText(left.outputItemLabel, right.outputItemLabel)
    || compareOutputSpecAttachmentText(left.outputItemId, right.outputItemId)
    || outputSpecAttachmentSourceTypeOrder[left.sourceType] - outputSpecAttachmentSourceTypeOrder[right.sourceType]
    || compareOutputSpecAttachmentText(left.sourceLabel, right.sourceLabel)
    || compareOutputSpecAttachmentText(left.sourceId, right.sourceId)
    || compareOutputSpecAttachmentText(left.attachment.fileName, right.attachment.fileName)
    || compareOutputSpecAttachmentText(left.attachment.storageKey, right.attachment.storageKey)
  );
}

function createDefaultSimpleRow(): MajorProjectSimpleRow {
  return {
    id: "major-simple-row-1",
    label: "",
    description: "",
    specSheetLabel: "",
    specSheetLocation: "",
    specSheetAttachment: undefined,
    quantity: 1,
    unit: "ea",
    customerUnitPrice: 0,
    customerExtendedPrice: 0,
    ourUnitCost: 0,
    ourExtendedCost: 0,
    bucket: "hardware",
  };
}

function createDefaultComponent(): MajorProjectComponent {
  return {
    id: "major-component-1",
    internalName: "",
    customerFacingLabel: "",
    vendor: "",
    manufacturer: "",
    category: majorProjectLineTypeLabel("hardware"),
    lineType: "hardware",
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
    bundleAssignmentId: "",
    notes: "",
  };
}

function createDefaultBundle(): MajorProjectBundle {
  return {
    id: "major-bundle-1",
    internalName: "Base solution bundle",
    customerFacingLabel: "Integrated solution bundle",
    description: "",
    specSheetLabel: "",
    specSheetLocation: "",
    specSheetAttachment: undefined,
    componentIds: [],
    includedCostComponentIds: [],
    includedRevenueComponentIds: [],
    schedule: "mixed",
    category: "solution",
  };
}

function createDefaultCustomerQuoteLine(): MajorProjectCustomerQuoteLine {
  return {
    id: "major-quote-line-1",
    lineItemNumber: 1,
    label: "Integrated solution package",
    description: "",
    specSheetLabel: "",
    specSheetLocation: "",
    specSheetAttachment: undefined,
    bundleIds: [],
    includedCostComponentIds: [],
    includedRevenueComponentIds: [],
    schedule: "mixed",
    presentationCategory: "other",
  };
}

function normalizeLineItemNumber(value: unknown, index: number, label?: string) {
  const explicitValue = Number(value);
  if (Number.isInteger(explicitValue) && explicitValue > 0) return explicitValue;

  const trimmedLabel = label?.trim() ?? "";
  if (/^\d+$/.test(trimmedLabel)) return Number(trimmedLabel);

  return index + 1;
}

function uniqueIds(ids: Array<string | undefined | null>) {
  return Array.from(new Set(ids.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function resolveMajorProjectTermMonths(termMonths: number) {
  if (!Number.isFinite(termMonths) || termMonths <= 0) return 0;
  return Math.round(termMonths);
}

function contractValueFromMrr(monthlyValue: number, termMonths: number) {
  return roundCurrency(monthlyValue * termMonths);
}

function sumSimpleRows(
  rows: MajorProjectSimpleRow[],
  value: "revenue" | "cost",
  predicate?: (row: MajorProjectSimpleRow) => boolean,
) {
  return rows.reduce((sum, row) => {
    if (predicate && !predicate(row)) return sum;
    return sum + (value === "revenue" ? row.customerExtendedPrice : row.ourExtendedCost);
  }, 0);
}

function resolveMajorProjectBuilderMode(option: MajorProjectOption | null | undefined, quoteMode: MajorProjectBuilderMode | undefined) {
  if (quoteMode === "advanced") return "advanced" as const;
  if (quoteMode === "simple") return "simple" as const;
  if ((option?.components?.length ?? 0) > 0) return "advanced" as const;
  return "simple" as const;
}

function normalizeComponent(component: Partial<MajorProjectComponent> | undefined, index: number): MajorProjectComponent {
  const defaults = createDefaultComponent();
  const lineType = component?.lineType ?? defaults.lineType;
  const quantity = Math.max(Number(component?.quantity ?? defaults.quantity) || defaults.quantity, 0);
  const customerUnitPrice = Number(component?.customerUnitPrice ?? defaults.customerUnitPrice) || 0;
  const vendorUnitCost = Number(component?.vendorUnitCost ?? defaults.vendorUnitCost) || 0;
  const customerExtendedPrice = component?.customerExtendedPrice ?? roundCurrency(quantity * customerUnitPrice);
  const vendorExtendedCost = component?.vendorExtendedCost ?? roundCurrency(quantity * vendorUnitCost);

  return {
    ...defaults,
    ...component,
    id: component?.id ?? `major-component-${index + 1}`,
    internalName: component?.internalName ?? defaults.internalName,
    lineType,
    category: majorProjectLineTypeLabel(lineType),
    bundleAssignmentId: component?.bundleAssignmentId?.trim() ?? "",
    quantity,
    customerUnitPrice,
    customerExtendedPrice: roundCurrency(customerExtendedPrice),
    vendorUnitCost,
    vendorExtendedCost: roundCurrency(vendorExtendedCost),
  };
}

function normalizeBundle(bundle: Partial<MajorProjectBundle> | undefined, index: number): MajorProjectBundle {
  const defaults = createDefaultBundle();
  const componentIds = uniqueIds(bundle?.componentIds ?? []);

  return {
    ...defaults,
    ...bundle,
    id: bundle?.id ?? `major-bundle-${index + 1}`,
    specSheetLabel: bundle?.specSheetLabel?.trim() ?? defaults.specSheetLabel,
    specSheetLocation: bundle?.specSheetLocation?.trim() ?? defaults.specSheetLocation,
    specSheetAttachment: normalizeMajorProjectSpecAttachment(bundle?.specSheetAttachment),
    componentIds,
    includedCostComponentIds: uniqueIds(bundle?.includedCostComponentIds?.length ? bundle.includedCostComponentIds : componentIds),
    includedRevenueComponentIds: uniqueIds(bundle?.includedRevenueComponentIds?.length ? bundle.includedRevenueComponentIds : componentIds),
  };
}

function normalizeCustomerQuoteLine(line: Partial<MajorProjectCustomerQuoteLine> | undefined, index: number): MajorProjectCustomerQuoteLine {
  const defaults = createDefaultCustomerQuoteLine();
  return {
    ...defaults,
    ...line,
    id: line?.id ?? `major-quote-line-${index + 1}`,
    lineItemNumber: normalizeLineItemNumber(line?.lineItemNumber, index, line?.label),
    specSheetLabel: line?.specSheetLabel?.trim() ?? defaults.specSheetLabel,
    specSheetLocation: line?.specSheetLocation?.trim() ?? defaults.specSheetLocation,
    specSheetAttachment: normalizeMajorProjectSpecAttachment(line?.specSheetAttachment),
    bundleIds: uniqueIds(line?.bundleIds ?? []),
    includedCostComponentIds: uniqueIds(line?.includedCostComponentIds ?? []),
    includedRevenueComponentIds: uniqueIds(line?.includedRevenueComponentIds ?? []),
  };
}

function buildVendorSummary(components: MajorProjectComponent[]) {
  const summaryMap = new Map<string, { vendor: string; manufacturer?: string; oneTimeRevenue: number; recurringRevenue: number; oneTimeCost: number; recurringCost: number }>();

  for (const component of components) {
    const key = `${component.vendor || "Unassigned vendor"}::${component.manufacturer || ""}`;
    const current = summaryMap.get(key) ?? {
      vendor: component.vendor || "Unassigned vendor",
      manufacturer: component.manufacturer || undefined,
      oneTimeRevenue: 0,
      recurringRevenue: 0,
      oneTimeCost: 0,
      recurringCost: 0,
    };

    if (component.schedule === "recurring") {
      current.recurringRevenue += component.customerExtendedPrice;
      current.recurringCost += component.vendorExtendedCost;
    } else {
      current.oneTimeRevenue += component.customerExtendedPrice;
      current.oneTimeCost += component.vendorExtendedCost;
    }

    summaryMap.set(key, current);
  }

  return Array.from(summaryMap.values()).map((entry) => ({
    ...entry,
    oneTimeRevenue: roundCurrency(entry.oneTimeRevenue),
    recurringRevenue: roundCurrency(entry.recurringRevenue),
    oneTimeCost: roundCurrency(entry.oneTimeCost),
    recurringCost: roundCurrency(entry.recurringCost),
  }));
}

function normalizeSimpleRow(row: Partial<MajorProjectSimpleRow> | undefined, index: number): MajorProjectSimpleRow {
  const defaults = createDefaultSimpleRow();
  const quantity = Math.max(Number(row?.quantity ?? defaults.quantity) || defaults.quantity, 0);
  const customerUnitPrice = Number(row?.customerUnitPrice ?? defaults.customerUnitPrice) || 0;
  const ourUnitCost = Number(row?.ourUnitCost ?? defaults.ourUnitCost) || 0;
  const customerExtendedPrice = row?.customerExtendedPrice ?? roundCurrency(quantity * customerUnitPrice);
  const ourExtendedCost = row?.ourExtendedCost ?? roundCurrency(quantity * ourUnitCost);

  return {
    ...defaults,
    ...row,
    id: row?.id ?? `major-simple-row-${index + 1}`,
    label: row?.label ?? defaults.label,
    specSheetLabel: row?.specSheetLabel?.trim() ?? defaults.specSheetLabel,
    specSheetLocation: row?.specSheetLocation?.trim() ?? defaults.specSheetLocation,
    specSheetAttachment: normalizeMajorProjectSpecAttachment(row?.specSheetAttachment),
    quantity,
    customerUnitPrice,
    customerExtendedPrice: roundCurrency(customerExtendedPrice),
    ourUnitCost,
    ourExtendedCost: roundCurrency(ourExtendedCost),
    bucket: (row?.bucket ?? defaults.bucket) as MajorProjectSimpleBucket,
  };
}

function normalizeOption(option: Partial<MajorProjectOption> | undefined, index: number): MajorProjectOption {
  const simpleRows = (option?.simpleRows ?? []).map((row, rowIndex) => normalizeSimpleRow(row, rowIndex));
  const components = (option?.components ?? []).map((component, componentIndex) => normalizeComponent(component, componentIndex));
  const bundles = (option?.bundles ?? []).map((bundle, bundleIndex) => normalizeBundle(bundle, bundleIndex));
  const customerQuoteLines = (option?.customerQuoteLines ?? []).map((line, lineIndex) => normalizeCustomerQuoteLine(line, lineIndex));

  return {
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
    simpleRows,
    components,
    bundles,
    customerQuoteLines,
    vendorSummary: buildVendorSummary(components),
  };
}

function quickBuilderScheduleForRow(row: MajorProjectSimpleRow) {
  return row.bucket === "hardware" || row.bucket === "install" ? "one_time" as const : "recurring" as const;
}

function quickBuilderLineTypeForRow(row: MajorProjectSimpleRow): MajorProjectComponent["lineType"] {
  switch (row.bucket) {
    case "hardware":
      return "hardware";
    case "install":
      return "installation";
    case "support_recurring":
      return "support";
    case "mrr":
      return "managed_service";
    case "other_vendor":
      return "subscription";
    case "other_recurring":
      return "service";
    default:
      return "other";
  }
}

function quickBuilderBundleCategoryForRow(row: MajorProjectSimpleRow) {
  switch (row.bucket) {
    case "hardware":
      return "hardware";
    case "install":
      return "services";
    default:
      return "recurring";
  }
}

function quickBuilderPresentationCategoryForRow(row: MajorProjectSimpleRow): MajorProjectCustomerQuoteLine["presentationCategory"] {
  switch (row.bucket) {
    case "hardware":
      return "hardware";
    case "install":
      return "services";
    case "mrr":
    case "other_vendor":
    case "support_recurring":
    case "other_recurring":
      return "recurring";
    default:
      return "other";
  }
}

function buildMappedOptionFromQuickBuilder(option: MajorProjectOption): MajorProjectOption {
  const simpleRows = option.simpleRows ?? [];
  const existingComponents = option.components ?? [];
  const existingBundles = option.bundles ?? [];
  const existingQuoteLines = option.customerQuoteLines ?? [];

  if (!simpleRows.length) return option;
  if (existingComponents.length || existingBundles.length || existingQuoteLines.length) return option;

  const components = simpleRows.map((row, index) => {
    const label = row.label?.trim() || row.description?.trim() || `Quick Builder row ${index + 1}`;
    const bundleId = `quick-builder-bundle-${row.id}`;

    return normalizeComponent({
      id: `quick-builder-component-${row.id}`,
      internalName: label,
      customerFacingLabel: row.label?.trim() || label,
      vendor: "Quick Builder",
      category: quickBuilderBundleCategoryForRow(row),
      lineType: quickBuilderLineTypeForRow(row),
      quantity: row.quantity,
      unit: row.unit || "ea",
      customerUnitPrice: row.customerUnitPrice,
      customerExtendedPrice: row.customerExtendedPrice,
      vendorUnitCost: row.ourUnitCost,
      vendorExtendedCost: row.ourExtendedCost,
      schedule: quickBuilderScheduleForRow(row),
      costBasis: "estimate",
      resaleBasis: "cost_plus",
      bundleAssignmentId: bundleId,
      notes: row.description,
    }, index);
  });

  const bundles = simpleRows.map((row, index) => {
    const componentId = `quick-builder-component-${row.id}`;
    const label = row.label?.trim() || row.description?.trim() || `Quick Builder row ${index + 1}`;

    return normalizeBundle({
      id: `quick-builder-bundle-${row.id}`,
      internalName: label,
      customerFacingLabel: row.label?.trim() || label,
      description: row.description,
      specSheetLabel: row.specSheetLabel,
      specSheetLocation: row.specSheetLocation,
      specSheetAttachment: row.specSheetAttachment,
      componentIds: [componentId],
      includedCostComponentIds: [componentId],
      includedRevenueComponentIds: [componentId],
      schedule: quickBuilderScheduleForRow(row),
      category: quickBuilderBundleCategoryForRow(row),
    }, index);
  });

  const customerQuoteLines = simpleRows.map((row, index) => {
    const componentId = `quick-builder-component-${row.id}`;
    const bundleId = `quick-builder-bundle-${row.id}`;
    const label = row.label?.trim() || row.description?.trim() || `Quick Builder row ${index + 1}`;

    return normalizeCustomerQuoteLine({
      id: `quick-builder-quote-line-${row.id}`,
      label,
      description: row.description,
      specSheetLabel: row.specSheetLabel,
      specSheetLocation: row.specSheetLocation,
      specSheetAttachment: row.specSheetAttachment,
      bundleIds: [bundleId],
      includedCostComponentIds: [componentId],
      includedRevenueComponentIds: [componentId],
      schedule: quickBuilderScheduleForRow(row),
      presentationCategory: quickBuilderPresentationCategoryForRow(row),
    }, index);
  });

  return normalizeOption({
    ...option,
    components,
    bundles,
    customerQuoteLines,
  }, 0);
}

function sumComponents(components: MajorProjectComponent[], schedule: "one_time" | "recurring", value: "revenue" | "cost", predicate?: (component: MajorProjectComponent) => boolean) {
  return components.reduce((sum, component) => {
    if (component.schedule !== schedule) return sum;
    if (predicate && !predicate(component)) return sum;
    return sum + (value === "revenue" ? component.customerExtendedPrice : component.vendorExtendedCost);
  }, 0);
}

function componentsForIds(componentsById: Map<string, MajorProjectComponent>, ids: string[] | undefined) {
  return uniqueIds(ids ?? []).map((id) => componentsById.get(id)).filter((component): component is MajorProjectComponent => Boolean(component));
}

function dedupeComponents(components: MajorProjectComponent[]) {
  const map = new Map<string, MajorProjectComponent>();
  for (const component of components) map.set(component.id, component);
  return Array.from(map.values());
}

function normalizeLookupText(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

function lineMatchesText(line: MajorProjectCustomerQuoteLine, ...values: Array<string | undefined>) {
  const searchTerms = uniqueIds([
    normalizeLookupText(line.label),
    normalizeLookupText(line.description),
  ]).filter((value) => value.length >= 4);

  if (!searchTerms.length) return false;

  const haystack = values.map((value) => normalizeLookupText(value)).filter(Boolean).join(" ");
  return searchTerms.some((term) => haystack.includes(term) || term.includes(haystack));
}

function inferBundleIdsForQuoteLine(line: MajorProjectCustomerQuoteLine, bundles: MajorProjectBundle[]) {
  if (line.bundleIds.length > 0) return uniqueIds(line.bundleIds);

  const labelMatches = bundles.filter((bundle) => lineMatchesText(line, bundle.customerFacingLabel, bundle.internalName, bundle.description));
  if (labelMatches.length) {
    return uniqueIds(labelMatches.map((bundle) => bundle.id));
  }

  const scheduleMatches = bundles.filter((bundle) => {
    if (line.schedule !== "mixed" && bundle.schedule !== "mixed" && bundle.schedule !== line.schedule) {
      return false;
    }
    if (line.presentationCategory === "recurring") {
      return bundle.schedule === "recurring";
    }
    if (line.presentationCategory === "hardware") {
      return bundle.schedule !== "recurring";
    }
    return true;
  });

  return scheduleMatches.length === 1 ? [scheduleMatches[0].id] : [];
}

function inferComponentsForQuoteLine(line: MajorProjectCustomerQuoteLine, components: MajorProjectComponent[]) {
  const labelMatches = components.filter((component) => lineMatchesText(line, component.customerFacingLabel, component.internalName, component.notes));
  if (labelMatches.length) {
    return labelMatches;
  }

  return components.filter((component) => {
    if (line.schedule !== "mixed" && component.schedule !== line.schedule) return false;

    if (line.presentationCategory === "recurring") {
      return component.schedule === "recurring";
    }

    if (line.presentationCategory === "hardware") {
      return component.schedule !== "recurring" && ["hardware", "shipping", "tax"].includes(component.lineType);
    }

    if (line.presentationCategory === "services") {
      return component.schedule !== "recurring" && !["hardware", "shipping", "tax"].includes(component.lineType);
    }

    if (line.presentationCategory === "other") {
      return component.schedule !== "recurring";
    }

    return false;
  });
}

function costOrRevenueTotal(components: MajorProjectComponent[], schedule: "one_time" | "recurring", value: "revenue" | "cost") {
  return components.reduce((sum, component) => {
    if (component.schedule !== schedule) return sum;
    return sum + (value === "revenue" ? component.customerExtendedPrice : component.vendorExtendedCost);
  }, 0);
}

function resolveSpecSheetLabel(line: MajorProjectCustomerQuoteLine, bundlesById: Map<string, MajorProjectBundle>, bundleIds: string[]) {
  const explicitLabel = line.specSheetLabel?.trim();
  if (explicitLabel) return explicitLabel;

  const inheritedLabels = uniqueIds(bundleIds.map((bundleId) => bundlesById.get(bundleId)?.specSheetLabel ?? ""));
  return inheritedLabels.length ? inheritedLabels.join("; ") : undefined;
}

function resolveSpecSheetLocation(line: MajorProjectCustomerQuoteLine, bundlesById: Map<string, MajorProjectBundle>, bundleIds: string[]) {
  const explicitLocation = line.specSheetLocation?.trim();
  if (explicitLocation) return explicitLocation;

  const inheritedLocations = uniqueIds(bundleIds.map((bundleId) => bundlesById.get(bundleId)?.specSheetLocation ?? ""));
  return inheritedLocations.length ? inheritedLocations.join(" | ") : undefined;
}

function collectDuplicateIds(items: Array<{ id: string }>) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([id]) => id);
}

function buildResolvedBundleComponentIds(option: MajorProjectOption, bundle: MajorProjectBundle) {
  const explicitIds = uniqueIds(bundle.componentIds);
  const assignedIds = (option.components ?? [])
    .filter((component) => component.bundleAssignmentId && component.bundleAssignmentId === bundle.id)
    .map((component) => component.id);

  return uniqueIds([...explicitIds, ...assignedIds]);
}

function buildMajorProjectPresentation(option: MajorProjectOption) {
  const components = option.components ?? [];
  const bundles = option.bundles ?? [];
  const customerQuoteLines = option.customerQuoteLines ?? [];
  const componentsById = new Map<string, MajorProjectComponent>(components.map((component) => [component.id, component]));
  const bundlesById = new Map<string, MajorProjectBundle>(bundles.map((bundle) => [bundle.id, bundle]));

  const bundleResolvedComponentIds = new Map<string, string[]>();
  const bundlesWithMetrics: MajorProjectBundleMetrics[] = bundles.map((bundle) => {
    const resolvedComponentIds = buildResolvedBundleComponentIds(option, bundle);
    bundleResolvedComponentIds.set(bundle.id, resolvedComponentIds);

    const defaultComponents = componentsForIds(componentsById, resolvedComponentIds);
    const costComponents = componentsForIds(componentsById, bundle.includedCostComponentIds?.length ? bundle.includedCostComponentIds : resolvedComponentIds);
    const revenueComponents = componentsForIds(componentsById, bundle.includedRevenueComponentIds?.length ? bundle.includedRevenueComponentIds : resolvedComponentIds);

    return {
      ...bundle,
      resolvedComponentIds,
      oneTimeRevenue: roundCurrency(costOrRevenueTotal(revenueComponents.length ? revenueComponents : defaultComponents, "one_time", "revenue")),
      recurringRevenue: roundCurrency(costOrRevenueTotal(revenueComponents.length ? revenueComponents : defaultComponents, "recurring", "revenue")),
      oneTimeCost: roundCurrency(costOrRevenueTotal(costComponents.length ? costComponents : defaultComponents, "one_time", "cost")),
      recurringCost: roundCurrency(costOrRevenueTotal(costComponents.length ? costComponents : defaultComponents, "recurring", "cost")),
    };
  });

  const quoteLinesWithMetrics: MajorProjectCustomerQuoteLineMetrics[] = customerQuoteLines.map((line) => {
    const inferredBundleIds = inferBundleIdsForQuoteLine(line, bundles);
    const resolvedBundleIds = uniqueIds(inferredBundleIds.filter((bundleId) => bundlesById.has(bundleId)));
    const bundledCostComponents = resolvedBundleIds.flatMap((bundleId) => {
      const bundle = bundlesById.get(bundleId);
      const resolvedIds = bundleResolvedComponentIds.get(bundleId) ?? [];
      return componentsForIds(componentsById, bundle?.includedCostComponentIds?.length ? bundle.includedCostComponentIds : resolvedIds);
    });
    const bundledRevenueComponents = resolvedBundleIds.flatMap((bundleId) => {
      const bundle = bundlesById.get(bundleId);
      const resolvedIds = bundleResolvedComponentIds.get(bundleId) ?? [];
      return componentsForIds(componentsById, bundle?.includedRevenueComponentIds?.length ? bundle.includedRevenueComponentIds : resolvedIds);
    });
    const explicitCostComponents = componentsForIds(componentsById, line.includedCostComponentIds);
    const explicitRevenueComponents = componentsForIds(componentsById, line.includedRevenueComponentIds);
    const inferredComponents = inferComponentsForQuoteLine(line, components);
    const fallbackCostComponents = !bundledCostComponents.length && !explicitCostComponents.length ? inferredComponents : [];
    const fallbackRevenueComponents = !bundledRevenueComponents.length && !explicitRevenueComponents.length ? inferredComponents : [];
    const costComponents = dedupeComponents([...bundledCostComponents, ...explicitCostComponents, ...fallbackCostComponents]);
    const revenueComponents = dedupeComponents([...bundledRevenueComponents, ...explicitRevenueComponents, ...fallbackRevenueComponents]);

    return {
      ...line,
      bundleIds: resolvedBundleIds,
      resolvedBundleIds,
      resolvedCostComponentIds: costComponents.map((component) => component.id),
      resolvedRevenueComponentIds: revenueComponents.map((component) => component.id),
      resolvedSpecSheetLabel: resolveSpecSheetLabel(line, bundlesById, resolvedBundleIds),
      resolvedSpecSheetLocation: resolveSpecSheetLocation(line, bundlesById, resolvedBundleIds),
      oneTimeRevenue: roundCurrency(costOrRevenueTotal(revenueComponents, "one_time", "revenue")),
      recurringRevenue: roundCurrency(costOrRevenueTotal(revenueComponents, "recurring", "revenue")),
      oneTimeCost: roundCurrency(costOrRevenueTotal(costComponents, "one_time", "cost")),
      recurringCost: roundCurrency(costOrRevenueTotal(costComponents, "recurring", "cost")),
      costComponents,
      revenueComponents,
    };
  });

  return {
    bundlesWithMetrics,
    quoteLinesWithMetrics,
    bundleResolvedComponentIds,
  };
}

function buildMajorProjectValidation(option: MajorProjectOption, presentation: ReturnType<typeof buildMajorProjectPresentation>): MajorProjectValidationSummary {
  const components = option.components ?? [];
  const bundles = option.bundles ?? [];
  const quoteLines = presentation.quoteLinesWithMetrics;
  const issues: MajorProjectValidationIssue[] = [];

  const duplicateComponentIds = collectDuplicateIds(components);
  if (duplicateComponentIds.length) {
    issues.push({
      code: "duplicate_component_ids",
      severity: "error",
      message: `Duplicate component ids found: ${duplicateComponentIds.join(", ")}`,
      componentIds: duplicateComponentIds,
    });
  }

  const duplicateBundleIds = collectDuplicateIds(bundles);
  if (duplicateBundleIds.length) {
    issues.push({
      code: "duplicate_bundle_ids",
      severity: "error",
      message: `Duplicate bundle ids found: ${duplicateBundleIds.join(", ")}`,
      bundleIds: duplicateBundleIds,
    });
  }

  const duplicateQuoteLineIds = collectDuplicateIds(quoteLines);
  if (duplicateQuoteLineIds.length) {
    issues.push({
      code: "duplicate_quote_line_ids",
      severity: "error",
      message: `Duplicate quote line ids found: ${duplicateQuoteLineIds.join(", ")}`,
      quoteLineIds: duplicateQuoteLineIds,
    });
  }

  if (!components.length) {
    issues.push({
      code: "missing_source_components",
      severity: "error",
      message: "Major Project needs at least one internal component before pricing can be generated.",
    });
  }

  if (!bundles.length) {
    issues.push({
      code: "missing_source_bundles",
      severity: "error",
      message: "Major Project needs at least one internal bundle before pricing can be generated.",
    });
  }

  if (!quoteLines.length) {
    issues.push({
      code: "missing_customer_quote_lines",
      severity: "error",
      message: "Major Project needs at least one customer-facing quote line before pricing can be generated.",
    });
  }

  const componentToBundleIds = new Map<string, string[]>();

  for (const bundle of bundles) {
    const resolvedIds = presentation.bundleResolvedComponentIds.get(bundle.id) ?? [];
    if (!resolvedIds.length) {
      issues.push({
        code: "bundle_missing_components",
        severity: "warning",
        message: `Bundle \"${bundle.customerFacingLabel || bundle.internalName || bundle.id}\" has no resolved components.`,
        bundleIds: [bundle.id],
      });
    }

    for (const componentId of resolvedIds) {
      componentToBundleIds.set(componentId, [...(componentToBundleIds.get(componentId) ?? []), bundle.id]);
    }

    const orphanedIds = uniqueIds([
      ...(bundle.componentIds ?? []),
      ...(bundle.includedCostComponentIds ?? []),
      ...(bundle.includedRevenueComponentIds ?? []),
    ]).filter((componentId) => !components.some((component) => component.id === componentId));

    if (orphanedIds.length) {
      issues.push({
        code: "bundle_component_conflict",
        severity: "error",
        message: `Bundle \"${bundle.customerFacingLabel || bundle.internalName || bundle.id}\" references missing components: ${orphanedIds.join(", ")}`,
        bundleIds: [bundle.id],
        componentIds: orphanedIds,
      });
    }
  }

  for (const [componentId, bundleIds] of componentToBundleIds.entries()) {
    if (bundleIds.length > 1) {
      issues.push({
        code: "component_in_multiple_bundles",
        severity: "error",
        message: `Component ${componentId} resolves into multiple bundles: ${bundleIds.join(", ")}`,
        componentIds: [componentId],
        bundleIds,
      });
    }
  }

  for (const component of components) {
    const resolvedBundleIds = componentToBundleIds.get(component.id) ?? [];
    if (component.bundleAssignmentId && !bundles.some((bundle) => bundle.id === component.bundleAssignmentId)) {
      issues.push({
        code: "component_bundle_assignment_mismatch",
        severity: "error",
        message: `Component \"${component.internalName || component.id}\" points to missing bundle ${component.bundleAssignmentId}.`,
        componentIds: [component.id],
        bundleIds: [component.bundleAssignmentId],
      });
      continue;
    }

    if (component.bundleAssignmentId && resolvedBundleIds.length && !resolvedBundleIds.includes(component.bundleAssignmentId)) {
      issues.push({
        code: "component_bundle_assignment_mismatch",
        severity: "error",
        message: `Component \"${component.internalName || component.id}\" is assigned to bundle ${component.bundleAssignmentId} but resolves through ${resolvedBundleIds.join(", ")}.`,
        componentIds: [component.id],
        bundleIds: [component.bundleAssignmentId, ...resolvedBundleIds],
      });
    }

    if (!resolvedBundleIds.length) {
      issues.push({
        code: "component_unmapped_to_bundle",
        severity: "warning",
        message: `Component \"${component.internalName || component.id}\" is not mapped to any internal bundle.`,
        componentIds: [component.id],
      });
    }
  }

  const componentToQuoteLineIds = new Map<string, string[]>();
  for (const quoteLine of quoteLines) {
    const missingBundleIds = uniqueIds(quoteLine.bundleIds).filter((bundleId) => !bundles.some((bundle) => bundle.id === bundleId));
    if (missingBundleIds.length) {
      issues.push({
        code: "quote_line_missing_bundles",
        severity: "error",
        message: `Quote line \"${quoteLine.label || quoteLine.id}\" references missing bundles: ${missingBundleIds.join(", ")}`,
        quoteLineIds: [quoteLine.id],
        bundleIds: missingBundleIds,
      });
    }

    const explicitIds = uniqueIds([...(quoteLine.includedCostComponentIds ?? []), ...(quoteLine.includedRevenueComponentIds ?? [])]);
    const missingComponentIds = explicitIds.filter((componentId) => !components.some((component) => component.id === componentId));
    if (missingComponentIds.length) {
      issues.push({
        code: "quote_line_missing_components",
        severity: "error",
        message: `Quote line \"${quoteLine.label || quoteLine.id}\" references missing components: ${missingComponentIds.join(", ")}`,
        quoteLineIds: [quoteLine.id],
        componentIds: missingComponentIds,
      });
    }

    const coveredIds = uniqueIds([...quoteLine.resolvedCostComponentIds, ...quoteLine.resolvedRevenueComponentIds]);
    for (const componentId of coveredIds) {
      componentToQuoteLineIds.set(componentId, [...(componentToQuoteLineIds.get(componentId) ?? []), quoteLine.id]);
    }

    if (!coveredIds.length || (quoteLine.oneTimeRevenue + quoteLine.recurringRevenue + quoteLine.oneTimeCost + quoteLine.recurringCost) <= 0) {
      issues.push({
        code: "quote_line_without_backing_economics",
        severity: "error",
        message: `Quote line \"${quoteLine.label || quoteLine.id}\" has no backing economics.`,
        quoteLineIds: [quoteLine.id],
      });
    }
  }

  for (const component of components) {
    const quoteLineIds = componentToQuoteLineIds.get(component.id) ?? [];
    if (!quoteLineIds.length) {
      issues.push({
        code: "component_unmapped_to_quote_line",
        severity: "warning",
        message: `Component \"${component.internalName || component.id}\" is not surfaced through any customer-facing quote line.`,
        componentIds: [component.id],
      });
    }
    if (quoteLineIds.length > 1) {
      issues.push({
        code: "component_duplicate_quote_line_coverage",
        severity: "warning",
        message: `Component \"${component.internalName || component.id}\" rolls into multiple quote lines: ${quoteLineIds.join(", ")}`,
        componentIds: [component.id],
        quoteLineIds,
      });
    }
  }

  const unpresentedBundleIds = bundles
    .filter((bundle) => !quoteLines.some((quoteLine) => quoteLine.resolvedBundleIds.includes(bundle.id)))
    .map((bundle) => bundle.id);

  for (const bundleId of unpresentedBundleIds) {
    issues.push({
      code: "bundle_not_presented",
      severity: "warning",
      message: `Bundle ${bundleId} is internal-only and does not appear on a customer-facing quote line.`,
      bundleIds: [bundleId],
    });
  }

  const uncoveredComponentIds = components
    .filter((component) => !(componentToQuoteLineIds.get(component.id) ?? []).length)
    .map((component) => component.id);

  const quoteLinesWithoutEconomics = quoteLines
    .filter((quoteLine) => (quoteLine.oneTimeRevenue + quoteLine.recurringRevenue + quoteLine.oneTimeCost + quoteLine.recurringCost) <= 0)
    .map((quoteLine) => quoteLine.id);

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    issues,
    uncoveredComponentIds,
    unpresentedBundleIds,
    quoteLinesWithoutEconomics,
  };
}

export function createDefaultMajorProjectState() {
  return {
    enabled: false,
    builderMode: "simple" as MajorProjectBuilderMode,
    summary: {
      projectName: "",
      projectDescription: "",
      versionLabel: "",
      paymentTerms: "Net 30",
      billingStart: "",
      assumptions: "",
      systemDrawings: [],
    },
    bomImport: undefined,
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
  const resolvedBuilderMode = resolveMajorProjectBuilderMode(
    options.find((option) => option.id === quote.majorProject?.activeOptionId) ?? options[0] ?? null,
    quote.majorProject?.builderMode,
  );

  return {
    ...quote,
    majorProject: {
      ...defaults,
      ...quote.majorProject,
      summary: {
        ...defaults.summary,
        ...quote.majorProject?.summary,
        systemDrawings: (quote.majorProject?.summary?.systemDrawings ?? [])
          .map((attachment) => normalizeMajorProjectSpecAttachment(attachment))
          .filter((attachment): attachment is NonNullable<ReturnType<typeof normalizeMajorProjectSpecAttachment>> => Boolean(attachment)),
      },
      bomImport: quote.majorProject?.bomImport
        ? {
            ...quote.majorProject.bomImport,
          }
        : defaults.bomImport,
      commercial: {
        ...defaults.commercial,
        ...quote.majorProject?.commercial,
      },
      options,
      builderMode: resolvedBuilderMode,
      activeOptionId: quote.majorProject?.activeOptionId ?? options[0]?.id ?? defaults.activeOptionId,
    },
  };
}

export function convertMajorProjectQuickBuilderToMappedModel(quote: QuoteRecord): QuoteRecord {
  const safeQuote = ensureMajorProjectState(quote);

  return {
    ...safeQuote,
    majorProject: {
      ...safeQuote.majorProject,
      options: safeQuote.majorProject.options.map((option) => buildMappedOptionFromQuickBuilder(option)),
    },
  };
}

export function buildMajorProjectMetrics(quote: QuoteRecord): MajorProjectMetrics {
  const safeQuote = ensureMajorProjectState(quote);
  const state = safeQuote.majorProject;
  const activeOption = getActiveMajorProjectOption(safeQuote);
  const components = activeOption?.components ?? [];
  const simpleRows = activeOption?.simpleRows ?? [];
  const builderMode = resolveMajorProjectBuilderMode(activeOption, state.builderMode);
  const usingAdvancedBuilder = builderMode === "advanced";
  const hasThreeLayerModel = usingAdvancedBuilder && components.length > 0;
  const hasSimpleRowModel = !usingAdvancedBuilder && simpleRows.length > 0;
  const presentation = activeOption ? buildMajorProjectPresentation(activeOption) : { bundlesWithMetrics: [], quoteLinesWithMetrics: [], bundleResolvedComponentIds: new Map<string, string[]>() };
  const validation = activeOption && usingAdvancedBuilder ? buildMajorProjectValidation(activeOption, presentation) : {
    valid: true,
    errorCount: 0,
    warningCount: 0,
    issues: [],
    uncoveredComponentIds: [],
    unpresentedBundleIds: [],
    quoteLinesWithoutEconomics: [],
  };
  const termMonths = resolveMajorProjectTermMonths(state.commercial.termMonths);
  const siteCount = Math.max(activeOption?.siteCount ?? state.commercial.siteCount, 0);
  const recurringRevenue = hasThreeLayerModel
    ? roundCurrency(sumComponents(components, "recurring", "revenue"))
    : hasSimpleRowModel
      ? roundCurrency(sumSimpleRows(simpleRows, "revenue", (row) => row.bucket === "mrr" || row.bucket === "other_vendor" || row.bucket === "support_recurring" || row.bucket === "other_recurring"))
      : 0;
  const oneTimeRevenue = hasThreeLayerModel
    ? roundCurrency(sumComponents(components, "one_time", "revenue"))
    : hasSimpleRowModel
      ? roundCurrency(sumSimpleRows(simpleRows, "revenue", (row) => row.bucket === "hardware" || row.bucket === "install"))
      : 0;
  const recurringCost = hasThreeLayerModel
    ? roundCurrency(sumComponents(components, "recurring", "cost"))
    : hasSimpleRowModel
      ? roundCurrency(sumSimpleRows(simpleRows, "cost", (row) => row.bucket === "mrr" || row.bucket === "other_vendor" || row.bucket === "support_recurring" || row.bucket === "other_recurring"))
      : 0;
  const oneTimeCost = hasThreeLayerModel
    ? roundCurrency(sumComponents(components, "one_time", "cost"))
    : hasSimpleRowModel
      ? roundCurrency(sumSimpleRows(simpleRows, "cost", (row) => row.bucket === "hardware" || row.bucket === "install"))
      : 0;
  const hardwareRevenue = hasThreeLayerModel
    ? roundCurrency(sumComponents(components, "one_time", "revenue", (component) => component.lineType === "hardware"))
    : hasSimpleRowModel
      ? roundCurrency(sumSimpleRows(simpleRows, "revenue", (row) => row.bucket === "hardware"))
      : 0;
  const installRevenue = hasThreeLayerModel
    ? roundCurrency(sumComponents(components, "one_time", "revenue", (component) => component.lineType === "installation" || component.lineType === "internal_labor"))
    : hasSimpleRowModel
      ? roundCurrency(sumSimpleRows(simpleRows, "revenue", (row) => row.bucket === "install"))
      : 0;
  const otherOneTimeRevenue = hasThreeLayerModel
    ? roundCurrency(oneTimeRevenue - hardwareRevenue - installRevenue)
    : 0;
  const optionalServicesRevenue = hasThreeLayerModel
    ? roundCurrency(sumComponents(components, "one_time", "revenue", (component) => component.lineType === "optional_service"))
    : 0;
  const recurringContractRevenue = contractValueFromMrr(recurringRevenue, termMonths);
  const recurringContractCost = contractValueFromMrr(recurringCost, termMonths);
  const recurringContractGrossProfit = roundCurrency(recurringContractRevenue - recurringContractCost);
  const recurringContractGrossMarginPercent = recurringContractRevenue > 0 ? (recurringContractGrossProfit / recurringContractRevenue) * 100 : 0;
  const totalContractRevenue = roundCurrency(recurringContractRevenue + oneTimeRevenue);
  const totalContractCost = roundCurrency(recurringContractCost + oneTimeCost);
  const totalContractGrossProfit = roundCurrency(totalContractRevenue - totalContractCost);
  const totalContractGrossMarginPercent = totalContractRevenue > 0 ? (totalContractGrossProfit / totalContractRevenue) * 100 : 0;

  return {
    termMonths,
    siteCount,
    components,
    simpleRows,
    bundles: presentation.bundlesWithMetrics,
    customerQuoteLines: presentation.quoteLinesWithMetrics,
    vendorSummary: activeOption?.vendorSummary ?? [],
    validation,
    builderMode,
    usingSimpleBuilder: hasSimpleRowModel || (!usingAdvancedBuilder && components.length === 0),
    hasThreeLayerModel,
    recurringRevenue: roundCurrency(recurringRevenue),
    recurringContractRevenue,
    hardwareRevenue: roundCurrency(hardwareRevenue),
    installRevenue: roundCurrency(installRevenue),
    otherOneTimeRevenue: roundCurrency(otherOneTimeRevenue),
    optionalServicesRevenue: roundCurrency(optionalServicesRevenue),
    oneTimeRevenue: roundCurrency(oneTimeRevenue),
    recurringCost: roundCurrency(recurringCost),
    recurringContractCost,
    oneTimeCost: roundCurrency(oneTimeCost),
    recurringContractGrossProfit,
    recurringContractGrossMarginPercent,
    totalContractRevenue,
    totalContractCost,
    totalContractGrossProfit,
    totalContractGrossMarginPercent,
    totalRevenue: totalContractRevenue,
    totalCost: totalContractCost,
    totalGrossProfit: totalContractGrossProfit,
    totalGrossMarginPercent: totalContractGrossMarginPercent,
  };
}

function createOutputSpecAttachmentEntry(params: {
  attachment: MajorProjectSpecAttachment | undefined;
  sourceType: MajorProjectOutputSpecAttachment["sourceType"];
  sourceId: string;
  sourceLabel?: string;
  outputSection: MajorProjectOutputSpecAttachment["outputSection"];
  outputItemId: string;
  outputItemLabel?: string;
}): MajorProjectOutputSpecAttachment | null {
  if (!params.attachment) return null;
  return {
    attachment: params.attachment,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel?.trim() || params.sourceId,
    outputSection: params.outputSection,
    outputItemId: params.outputItemId,
    outputItemLabel: params.outputItemLabel?.trim() || params.outputItemId,
  };
}

export function resolveMajorProjectOutputSpecAttachments(quote: QuoteRecord): MajorProjectOutputSpecAttachment[] {
  const safeQuote = ensureMajorProjectState(quote);
  const state = safeQuote.majorProject;
  const activeOption = getActiveMajorProjectOption(safeQuote);
  const metrics = buildMajorProjectMetrics(safeQuote);

  if (!activeOption) return [];

  const attachments: MajorProjectOutputSpecAttachment[] = [];
  const seenAttachmentStorageKeys = new Set<string>();
  const pushAttachment = (entry: MajorProjectOutputSpecAttachment | null) => {
    if (!entry) return;
    if (seenAttachmentStorageKeys.has(entry.attachment.storageKey)) return;
    seenAttachmentStorageKeys.add(entry.attachment.storageKey);
    attachments.push(entry);
  };

  if (!metrics.hasThreeLayerModel) {
    const simpleRows = activeOption.simpleRows ?? [];
    const recurringRows = simpleRows.filter((row) => row.bucket === "mrr" || row.bucket === "other_vendor" || row.bucket === "support_recurring" || row.bucket === "other_recurring");
    const includeRecurringRows = recurringRows.length > 0 || metrics.recurringRevenue > 0;

    if (includeRecurringRows) {
      for (const row of recurringRows) {
        pushAttachment(createOutputSpecAttachmentEntry({
          attachment: row.specSheetAttachment,
          sourceType: "simple_row",
          sourceId: row.id,
          sourceLabel: row.label || row.description,
          outputSection: "sectionA",
          outputItemId: row.id,
          outputItemLabel: row.label || row.description,
        }));
      }
    }

    if (metrics.hardwareRevenue > 0) {
      for (const row of simpleRows.filter((candidate) => candidate.bucket === "hardware")) {
        pushAttachment(createOutputSpecAttachmentEntry({
          attachment: row.specSheetAttachment,
          sourceType: "simple_row",
          sourceId: row.id,
          sourceLabel: row.label || row.description,
          outputSection: "sectionB",
          outputItemId: row.id,
          outputItemLabel: row.label || row.description,
        }));
      }
    }

    if (metrics.installRevenue > 0 || metrics.otherOneTimeRevenue > 0 || metrics.optionalServicesRevenue > 0) {
      for (const row of simpleRows.filter((candidate) => candidate.bucket === "install")) {
        pushAttachment(createOutputSpecAttachmentEntry({
          attachment: row.specSheetAttachment,
          sourceType: "simple_row",
          sourceId: row.id,
          sourceLabel: row.label || row.description,
          outputSection: "sectionC",
          outputItemId: row.id,
          outputItemLabel: row.label || row.description,
        }));
      }
    }

    return attachments.sort(compareMajorProjectOutputSpecAttachments);
  }

  const bundlesById = new Map(metrics.bundles.map((bundle) => [bundle.id, bundle]));
  const recurringQuoteLine = metrics.customerQuoteLines.find((line) => line.presentationCategory === "recurring");
  if (recurringQuoteLine && recurringQuoteLine.recurringRevenue > 0) {
    pushAttachment(createOutputSpecAttachmentEntry({
      attachment: recurringQuoteLine.specSheetAttachment,
      sourceType: "quote_line",
      sourceId: recurringQuoteLine.id,
      sourceLabel: recurringQuoteLine.label,
      outputSection: "sectionA",
      outputItemId: "major_recurring",
      outputItemLabel: recurringQuoteLine.label,
    }));

    for (const bundleId of recurringQuoteLine.resolvedBundleIds) {
      const bundle = bundlesById.get(bundleId);
      pushAttachment(createOutputSpecAttachmentEntry({
        attachment: bundle?.specSheetAttachment,
        sourceType: "bundle",
        sourceId: bundleId,
        sourceLabel: bundle?.customerFacingLabel || bundle?.internalName,
        outputSection: "sectionA",
        outputItemId: "major_recurring",
        outputItemLabel: recurringQuoteLine.label,
      }));
    }
  }

  for (const line of metrics.customerQuoteLines.filter((candidate) => candidate.presentationCategory === "hardware" && candidate.oneTimeRevenue > 0)) {
    pushAttachment(createOutputSpecAttachmentEntry({
      attachment: line.specSheetAttachment,
      sourceType: "quote_line",
      sourceId: line.id,
      sourceLabel: line.label,
      outputSection: "sectionB",
      outputItemId: line.id,
      outputItemLabel: line.label,
    }));

    for (const bundleId of line.resolvedBundleIds) {
      const bundle = bundlesById.get(bundleId);
      pushAttachment(createOutputSpecAttachmentEntry({
        attachment: bundle?.specSheetAttachment,
        sourceType: "bundle",
        sourceId: bundleId,
        sourceLabel: bundle?.customerFacingLabel || bundle?.internalName,
        outputSection: "sectionB",
        outputItemId: line.id,
        outputItemLabel: line.label,
      }));
    }
  }

  for (const line of metrics.customerQuoteLines.filter((candidate) => candidate.presentationCategory !== "hardware" && candidate.presentationCategory !== "recurring" && candidate.oneTimeRevenue > 0)) {
    pushAttachment(createOutputSpecAttachmentEntry({
      attachment: line.specSheetAttachment,
      sourceType: "quote_line",
      sourceId: line.id,
      sourceLabel: line.label,
      outputSection: "sectionC",
      outputItemId: line.id,
      outputItemLabel: line.label,
    }));

    for (const bundleId of line.resolvedBundleIds) {
      const bundle = bundlesById.get(bundleId);
      pushAttachment(createOutputSpecAttachmentEntry({
        attachment: bundle?.specSheetAttachment,
        sourceType: "bundle",
        sourceId: bundleId,
        sourceLabel: bundle?.customerFacingLabel || bundle?.internalName,
        outputSection: "sectionC",
        outputItemId: line.id,
        outputItemLabel: line.label,
      }));
    }
  }

  return attachments.sort(compareMajorProjectOutputSpecAttachments);
}

export function applyMajorProjectToQuote(quote: QuoteRecord): QuoteRecord {
  const safeQuote = ensureMajorProjectState(quote);
  const state = safeQuote.majorProject;
  const activeOption = getActiveMajorProjectOption(safeQuote);
  const metrics = buildMajorProjectMetrics(safeQuote);
  const siteCount = metrics.siteCount;
  const simpleRows = activeOption?.simpleRows ?? [];
  const monthDriverLabel = formatMajorProjectMonthDriver(state.commercial.termMonths);
  const next = JSON.parse(JSON.stringify(safeQuote)) as QuoteRecord;

  next.metadata.workflowMode = "major_project";
  next.metadata.documentSubtitle = next.metadata.documentSubtitle || "Major Project Commercial Proposal";
  const hasRecurringSectionContent = metrics.recurringRevenue > 0 || state.commercial.terminalFeePerSite > 0 || state.commercial.overageRatePerGb > 0;
  next.sections.sectionA.enabled = hasRecurringSectionContent;
  next.sections.sectionA.builderLabel = "Major project MRR structure";
  next.sections.sectionA.title = state.summary.projectName
    ? `${state.summary.projectName} MRR commercial structure`
    : "Major project MRR commercial structure";
  next.sections.sectionA.termMonths = state.commercial.termMonths;
  next.sections.sectionA.introText = `MRR structure based on ${siteCount} site${siteCount === 1 ? "" : "s"} with a ${monthDriverLabel}.`;
  next.sections.sectionA.explanatoryParagraphs = compact([
    state.summary.projectDescription,
    `Contract math is driven by ${monthDriverLabel}; visible recurring pricing stays MRR-first.`,
    metrics.hasThreeLayerModel ? "Customer-facing quote lines are presentation only; internal components remain the commercial source of truth." : "",
    metrics.validation.errorCount > 0 ? `Internal validation flagged ${metrics.validation.errorCount} mapping issue${metrics.validation.errorCount === 1 ? "" : "s"}; review the commercial worksheet before sending.` : "",
  ]);
  next.sections.sectionA.mode = state.commercial.serviceMix === "starlink-pool" ? "pool" : "per_kit";

  const recurringDisplayLabel = metrics.customerQuoteLines.find((line) => line.presentationCategory === "recurring")?.label
    ?? (activeOption?.simpleRows?.find((row) => row.bucket === "mrr")?.label)
    ?? state.commercial.recurringLabel
    ?? activeOption?.label
    ?? state.summary.projectName?.trim()
    ?? "Major Project";

  const recurringDescription = `MRR - ${recurringDisplayLabel}${activeOption?.label ? ` (${activeOption.label})` : ""}`;
  const recurringSpecSheetLabel = metrics.customerQuoteLines.find((line) => line.presentationCategory === "recurring")?.resolvedSpecSheetLabel;
  const supportIncludedText = compact([
    `${siteCount} site${siteCount === 1 ? "" : "s"} under commercial management`,
    state.summary.paymentTerms ? `Payment terms: ${state.summary.paymentTerms}` : "",
    state.summary.billingStart ? `Billing start: ${state.summary.billingStart}` : "",
    metrics.hasThreeLayerModel ? `${metrics.bundles.length} bundle${metrics.bundles.length === 1 ? "" : "s"} / ${metrics.vendorSummary.length} vendor bucket${metrics.vendorSummary.length === 1 ? "" : "s"} in internal worksheet` : "Built from Major Project row buckets with live margin rollups.",
  ]);

  const supportRow = {
    id: "major_support",
    rowType: "support" as const,
    description: "Program support and reporting",
    includedText: supportIncludedText,
    sourceLabel: "Major Project model",
  };

  const simpleRecurringRows = !metrics.hasThreeLayerModel
    ? (activeOption?.simpleRows ?? [])
      .filter((row) => row.bucket === "mrr" || row.bucket === "other_vendor" || row.bucket === "support_recurring" || row.bucket === "other_recurring")
      .map((row) => ({
        id: row.id,
        rowType: row.bucket === "support_recurring" ? "support" as const : "service" as const,
        description: row.label,
        quantity: row.bucket === "support_recurring" ? null : row.quantity,
        unitLabel: row.bucket === "support_recurring" ? null : row.unit || "ea",
        unitPrice: row.customerUnitPrice,
        monthlyRate: row.customerUnitPrice,
        totalMonthlyRate: row.customerExtendedPrice,
        specSheetLabel: row.specSheetLabel?.trim() || undefined,
        includedText: row.bucket === "support_recurring"
          ? compact([row.description, `Internal monthly cost ${row.ourExtendedCost.toFixed(2)}`])
          : undefined,
        sourceLabel: "Major Project row builder",
      }))
    : [];

  const recurringRow = {
    id: "major_recurring",
    rowType: "service" as const,
    description: recurringDescription,
    quantity: siteCount,
    unitLabel: "site",
    unitPrice: siteCount > 0 ? roundCurrency(metrics.recurringRevenue / siteCount) : 0,
    monthlyRate: siteCount > 0 ? roundCurrency(metrics.recurringRevenue / siteCount) : 0,
    totalMonthlyRate: roundCurrency(metrics.recurringRevenue),
    specSheetLabel: recurringSpecSheetLabel,
    sourceLabel: metrics.hasThreeLayerModel ? "Major Project model (customer-facing recurring rollup)" : "Major Project model",
  };

  const recurringRows = metrics.hasThreeLayerModel
    ? (metrics.recurringRevenue > 0 ? [recurringRow] : [])
    : simpleRecurringRows.length
      ? simpleRecurringRows
      : (metrics.recurringRevenue > 0 ? [recurringRow] : []);

  if (next.sections.sectionA.mode === "pool") {
    next.sections.sectionA.poolRows = [
      ...recurringRows,
      ...(state.commercial.terminalFeePerSite > 0 ? [{
        id: "major_terminal_fee",
        rowType: "terminal_fee" as const,
        description: "Terminal access fee",
        quantity: siteCount,
        unitLabel: "site",
        unitPrice: state.commercial.terminalFeePerSite,
        monthlyRate: state.commercial.terminalFeePerSite,
        totalMonthlyRate: roundCurrency(siteCount * state.commercial.terminalFeePerSite),
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
      ...((recurringRows.length > 0 && !simpleRecurringRows.some((row) => row.rowType === "support")) ? [supportRow] : []),
    ];
    next.sections.sectionA.perKitRows = [];
  } else {
    next.sections.sectionA.perKitRows = [
      ...recurringRows,
      ...(state.commercial.terminalFeePerSite > 0 ? [{
        id: "major_terminal_fee",
        rowType: "terminal_fee" as const,
        description: "Terminal access fee",
        quantity: siteCount,
        unitLabel: "site",
        unitPrice: state.commercial.terminalFeePerSite,
        monthlyRate: state.commercial.terminalFeePerSite,
        totalMonthlyRate: roundCurrency(siteCount * state.commercial.terminalFeePerSite),
        sourceLabel: "Major Project model",
      }] : []),
      ...((recurringRows.length > 0 && !simpleRecurringRows.some((row) => row.rowType === "support")) ? [supportRow] : []),
    ];
    next.sections.sectionA.poolRows = [];
  }

  const hardwareQuoteLines = metrics.customerQuoteLines.filter((line) => line.presentationCategory === "hardware" && line.oneTimeRevenue > 0);
  next.sections.sectionB.enabled = hardwareQuoteLines.length > 0 || (!metrics.hasThreeLayerModel && metrics.hardwareRevenue > 0);
  next.sections.sectionB.builderLabel = "Major project hardware";
  next.sections.sectionB.title = state.commercial.equipmentLabel;
  next.sections.sectionB.introText = metrics.hasThreeLayerModel
    ? "Customer-facing hardware is rolled up from internal bundles and components."
    : "Hardware totals are generated from the major project commercial model.";
  next.sections.sectionB.lineItems = metrics.hasThreeLayerModel
    ? hardwareQuoteLines.map((line, index) => ({
      id: line.id,
      sourceType: "custom" as const,
      itemName: line.label,
      itemCategory: "Bundle",
      quantity: 1,
      unitPrice: line.oneTimeRevenue,
      totalPrice: line.oneTimeRevenue,
      description: line.description || `Bundle ${index + 1}`,
      specSheetLabel: line.resolvedSpecSheetLabel,
      sourceLabel: "Major Project customer bundle",
    }))
    : (activeOption?.simpleRows?.filter((row) => row.bucket === "hardware").map((row) => ({
      id: row.id,
      sourceType: "custom" as const,
      itemName: row.label || row.description || "Equipment item",
      itemCategory: "",
      quantity: row.quantity,
      unitPrice: row.customerUnitPrice,
      totalPrice: row.customerExtendedPrice,
      description: row.description || activeOption?.description || state.summary.projectDescription,
      specSheetLabel: row.specSheetLabel?.trim() || undefined,
      sourceLabel: "Major Project row builder",
    })) ?? (next.sections.sectionB.enabled ? [{
      id: "major_hardware",
      sourceType: "custom",
      itemName: state.commercial.equipmentLabel,
      itemCategory: "",
      quantity: siteCount,
      unitPrice: siteCount > 0 ? roundCurrency(metrics.hardwareRevenue / siteCount) : 0,
      totalPrice: metrics.hardwareRevenue,
      description: activeOption?.description || state.summary.projectDescription,
      sourceLabel: "Major Project model",
    }] : []));

  const serviceQuoteLines = metrics.customerQuoteLines.filter((line) => line.presentationCategory !== "hardware" && line.presentationCategory !== "recurring" && line.oneTimeRevenue > 0);
  const simpleServiceRows = activeOption?.simpleRows?.filter((row) => row.bucket === "install") ?? [];
  next.sections.sectionC.enabled = serviceQuoteLines.length > 0 || (!metrics.hasThreeLayerModel && (metrics.installRevenue > 0 || metrics.otherOneTimeRevenue > 0 || metrics.optionalServicesRevenue > 0));
  next.sections.sectionC.builderLabel = "Major project services";
  next.sections.sectionC.title = "Major project field services";
  next.sections.sectionC.introText = metrics.hasThreeLayerModel
    ? "Customer-facing services are rolled up from internal bundles and components."
    : "Services and allowances are generated from the major project commercial model.";
  next.sections.sectionC.lineItems = metrics.hasThreeLayerModel
    ? serviceQuoteLines.map((line) => ({
      id: line.id,
      sourceType: "custom" as const,
      description: line.label,
      quantity: 1,
      unitPrice: line.oneTimeRevenue,
      totalPrice: line.oneTimeRevenue,
      notes: line.description || "Customer-facing bundle rollup",
      specSheetLabel: line.resolvedSpecSheetLabel,
      serviceCategory: "custom" as const,
      pricingStage: "budgetary" as const,
      sourceLabel: "Major Project customer bundle",
    }))
    : simpleServiceRows.length > 0
      ? simpleServiceRows.map((row) => ({
        id: row.id,
        sourceType: "custom" as const,
        description: row.label || row.description || "Service item",
        quantity: row.quantity,
        unitPrice: row.customerUnitPrice,
        totalPrice: row.customerExtendedPrice,
        notes: row.description || "Generated from major project row builder",
        specSheetLabel: row.specSheetLabel?.trim() || undefined,
        serviceCategory: "installation" as const,
        pricingStage: "budgetary" as const,
        sourceLabel: "Major Project row builder",
      }))
      : compactItems([
        metrics.installRevenue > 0 ? {
          id: "major_installation",
          sourceType: "custom" as const,
          description: state.commercial.installationLabel,
          quantity: siteCount,
          unitPrice: siteCount > 0 ? roundCurrency(metrics.installRevenue / siteCount) : 0,
          totalPrice: metrics.installRevenue,
          notes: activeOption?.description || "Generated from major project model",
          serviceCategory: "installation" as const,
          pricingStage: "budgetary" as const,
          sourceLabel: "Major Project model",
        } : null,
        metrics.otherOneTimeRevenue > 0 ? {
          id: "major_other_onetime",
          sourceType: "custom" as const,
          description: "Other one-time project allowance",
          quantity: 1,
          unitPrice: metrics.otherOneTimeRevenue,
          totalPrice: metrics.otherOneTimeRevenue,
          notes: "Generated from major project model",
          serviceCategory: "custom" as const,
          pricingStage: "budgetary" as const,
          sourceLabel: "Major Project model",
        } : null,
      ]);

  next.commercial.meta.optionLabel = activeOption?.label ?? "Option 1";
  next.commercial.meta.comparisonGroup = state.summary.projectName || "Major Project";
  next.commercial.meta.notes = compact([
    metrics.hasThreeLayerModel ? "Internal components are economics; customer bundle labels are presentation only." : "",
  ]).join(" ");

  if (metrics.hasThreeLayerModel) {
    const components = metrics.components;
    next.commercial.costs.oneTimeEquipmentCost = roundCurrency(sumComponents(components, "one_time", "cost", (component) => component.lineType === "hardware"));
    next.commercial.costs.oneTimeLaborCost = roundCurrency(sumComponents(components, "one_time", "cost", (component) => component.lineType === "installation" || component.lineType === "internal_labor" || component.lineType === "service" || component.lineType === "support" || component.lineType === "managed_service" || component.lineType === "optional_service"));
    next.commercial.costs.oneTimeOtherCost = roundCurrency(metrics.oneTimeCost - next.commercial.costs.oneTimeEquipmentCost - next.commercial.costs.oneTimeLaborCost);
    next.commercial.costs.recurringVendorCost = roundCurrency(sumComponents(components, "recurring", "cost", (component) => component.lineType === "hardware" || component.lineType === "software" || component.lineType === "subscription"));
    next.commercial.costs.recurringSupportCost = roundCurrency(sumComponents(components, "recurring", "cost", (component) => component.lineType === "support" || component.lineType === "managed_service"));
    next.commercial.costs.recurringOtherCost = roundCurrency(metrics.recurringCost - next.commercial.costs.recurringVendorCost - next.commercial.costs.recurringSupportCost);
  } else if (metrics.usingSimpleBuilder) {
    const hardwareCost = roundCurrency(sumSimpleRows(simpleRows, "cost", (row) => row.bucket === "hardware"));
    const installCost = roundCurrency(sumSimpleRows(simpleRows, "cost", (row) => row.bucket === "install"));
    const recurringVendorCost = roundCurrency(sumSimpleRows(simpleRows, "cost", (row) => row.bucket === "mrr" || row.bucket === "other_vendor"));
    const recurringSupportCost = roundCurrency(sumSimpleRows(simpleRows, "cost", (row) => row.bucket === "support_recurring"));
    const recurringOtherCost = roundCurrency(sumSimpleRows(simpleRows, "cost", (row) => row.bucket === "other_recurring"));
    next.commercial.costs.oneTimeEquipmentCost = hardwareCost;
    next.commercial.costs.oneTimeLaborCost = installCost;
    next.commercial.costs.oneTimeOtherCost = 0;
    next.commercial.costs.recurringVendorCost = recurringVendorCost;
    next.commercial.costs.recurringSupportCost = recurringSupportCost;
    next.commercial.costs.recurringOtherCost = recurringOtherCost;
  } else {
    next.commercial.costs.oneTimeEquipmentCost = 0;
    next.commercial.costs.oneTimeLaborCost = 0;
    next.commercial.costs.oneTimeOtherCost = 0;
    next.commercial.costs.recurringVendorCost = 0;
    next.commercial.costs.recurringSupportCost = 0;
    next.commercial.costs.recurringOtherCost = 0;
  }

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

function formatMajorProjectMonthDriver(termMonths: number) {
  const safeMonths = Number.isFinite(termMonths) && termMonths > 0 ? Math.round(termMonths) : 0;
  if (safeMonths <= 0) return "month-driven contract";
  return `${safeMonths}-month contract`;
}

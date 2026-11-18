import type { MajorProjectOption, QuoteRecord } from "./quote-record";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, ensureMajorProjectState } from "./major-project";
import { normalizeOrderProcessing } from "./order-processing";
import { normalizeCustomerOutput } from "./proposal-customer-content";
import { createDefaultQuoteServiceAgreementState } from "./service-agreement";

export type QuoteCopyReviewOptions = {
  customerMode: "same" | "different";
  keptScopeKeys: string[];
  terms: "keep" | "remove";
  attachments: "keep" | "remove";
  supportingAttachments: "keep" | "remove";
};

export type QuoteCopyScopeItem = {
  key: string;
  group: string;
  label: string;
  kind: "equipment" | "services";
  detail: string;
  specs: string[];
};

type Sections = QuoteRecord["sections"];
type SpecFields = { specSheetLabel?: string; specSheetLocation?: string; specSheetAttachment?: { fileName: string } };
const key = (...parts: string[]) => JSON.stringify(parts);
const unique = (values: string[]) => [...new Set(values)];
const isMajor = (quote: QuoteRecord) => quote.metadata.workflowMode === "major_project" && quote.majorProject.enabled;
const sectionRows = (sections: Sections) => [
  { section: "sectionA", collection: "poolRows", rows: sections.sectionA.poolRows, label: "Pooled services", active: sections.sectionA.enabled && sections.sectionA.mode === "pool" },
  { section: "sectionA", collection: "perKitRows", rows: sections.sectionA.perKitRows, label: "Per-kit services", active: sections.sectionA.enabled && sections.sectionA.mode === "per_kit" },
  { section: "sectionB", collection: "lineItems", rows: sections.sectionB.lineItems, label: "Equipment", active: sections.sectionB.enabled },
  { section: "sectionC", collection: "lineItems", rows: sections.sectionC.lineItems, label: "Field services", active: sections.sectionC.enabled },
] as const;
const specNames = (item: SpecFields) => [item.specSheetAttachment?.fileName || item.specSheetLocation || item.specSheetLabel].filter((v): v is string => Boolean(v));
const scopeDetail = (item: { quantity?: number | null; optional?: boolean; billing?: { cadence: string; startsYear?: number }; schedule?: string }, fallback: string) =>
  [`Qty ${item.quantity ?? 1}`, item.billing?.cadence === "annual" ? `Annual${item.billing.startsYear === 2 ? " / starts year 2" : ""}` : item.billing?.cadence === "monthly" || item.schedule === "recurring" ? "Monthly" : fallback, item.optional ? "Optional" : ""].filter(Boolean).join(" / ");

function optionMetrics(quote: QuoteRecord, option: MajorProjectOption) {
  return buildMajorProjectMetrics({ ...quote, majorProject: { ...quote.majorProject, activeOptionId: option.id, options: [option] } });
}

export function getQuoteCopyScopeItems(source: QuoteRecord): QuoteCopyScopeItem[] {
  const quote = ensureMajorProjectState(structuredClone(source));
  const items: QuoteCopyScopeItem[] = [];
  const addSections = (sections: Sections, prefix: string[], group: string, skip?: (section: string, rowId: string) => boolean) => {
    for (const entry of sectionRows(sections)) for (const row of entry.rows) {
      if (skip?.(entry.section, row.id)) continue;
      items.push({ key: key(...prefix, entry.section, entry.collection, row.id), group,
        label: "itemName" in row ? row.itemName : row.description,
        kind: entry.section === "sectionB" ? "equipment" : "services",
        detail: `${entry.label}${entry.active ? "" : " (inactive)"} / ${scopeDetail(row, entry.section === "sectionA" ? "Monthly" : "One-time")}`,
        specs: specNames(row) });
    }
  };
  if (!isMajor(quote)) addSections(quote.sections, ["quick"], "Quick Quote");
  for (const option of quote.majorProject.options) {
    const metrics = optionMetrics(quote, option);
    const group = `${option.label}${option.id === quote.majorProject.activeOptionId ? " (active option)" : ""}`;
    for (const component of option.components ?? []) {
      const bundles = metrics.bundles.filter((bundle) => [...bundle.resolvedComponentIds, ...(bundle.includedCostComponentIds ?? []), ...(bundle.includedRevenueComponentIds ?? [])].includes(component.id));
      const lines = metrics.customerQuoteLines.filter((line) => [...line.resolvedCostComponentIds, ...line.resolvedRevenueComponentIds].includes(component.id));
      items.push({ key: key("component", option.id, component.id), group, label: component.customerFacingLabel || component.internalName,
        kind: component.lineType === "hardware" ? "equipment" : "services", detail: scopeDetail(component, "One-time"),
        specs: unique([component, ...bundles, ...lines].flatMap(specNames)) });
    }
    // Old simple rows can coexist with the mapped model. Expose unmatched rows too.
    for (const row of option.simpleRows ?? []) {
      if (option.components?.some((component) => component.id === `quick-builder-component-${row.id}`)) continue;
      items.push({ key: key("simple", option.id, row.id), group, label: row.label, kind: row.bucket === "hardware" ? "equipment" : "services",
        detail: `Stored row / ${scopeDetail(row, row.bucket === "hardware" || row.bucket === "install" ? "One-time" : "Monthly")}`, specs: specNames(row) });
    }
    if (option.quickQuoteSource) addSections(option.quickQuoteSource.sections, ["snapshot", option.id], `${group} / stored Quick Quote`,
      (section, rowId) => Boolean(option.components?.some((component) => component.quickQuoteSource?.section === section && component.quickQuoteSource.rowId === rowId)));
  }
  for (const [field, label] of [["terminalFeePerSite", "Terminal access fee per site"], ["overageRatePerGb", "Overage rate per GB"], ["optionalServicesAmount", "Optional service allowance"]] as const) {
    if (quote.majorProject.commercial[field]) items.push({ key: key("commercial", field), group: "Project charges", label, kind: "services", detail: field === "overageRatePerGb" ? "Usage-based" : field === "terminalFeePerSite" ? "Monthly" : "One-time", specs: [] });
  }
  return items;
}

export function getQuoteCopySupportingAttachments(quote: QuoteRecord): string[] {
  return unique([
    ...(quote.majorProject.summary.systemDrawings ?? []).map((file) => file.fileName),
    quote.serviceAgreement.profile.sourceDocument?.fileName,
    quote.majorProject.bomImport?.fileName,
    ...quote.majorProject.options.flatMap((option) => (option.vendorQuotes ?? []).map((file) => file.fileName)),
    ...quote.majorProject.options.flatMap((option) => [...(option.components ?? []), ...(option.simpleRows ?? [])].map((item) => item.importSource?.fileName)),
  ].filter((name): name is string => Boolean(name)));
}

export function getQuoteCopyTerms(quote: QuoteRecord): string[] {
  return unique([
    ...quote.terms.generalStarlinkServiceTerms, ...quote.terms.pricingTerms,
    ...Object.values(quote.customerOutput ?? {}).filter((value): value is string => typeof value === "string"),
    quote.approval.approvalNote,
    ...(quote.warranty.enabled ? [quote.warranty.manufacturerReference, quote.warranty.coverageNote, quote.warranty.claimNote] : []),
    quote.majorProject.summary.paymentTerms, quote.majorProject.summary.billingStart, quote.majorProject.summary.assumptions,
    quote.serviceAgreement.profile.agreementLabel, quote.serviceAgreement.profile.notes,
    ...quote.serviceAgreement.profile.categories.map((category) => category.notes),
    ...[quote.sections, ...quote.majorProject.options.flatMap((option) => option.quickQuoteSource ? [option.quickQuoteSource.sections] : [])].flatMap((sections) => [
      sections.sectionA.introText, ...(sections.sectionA.explanatoryParagraphs ?? []), sections.sectionB.introText, sections.sectionC.introText,
    ]),
  ].filter((value): value is string => Boolean(value?.trim())));
}

function filterSections(sections: Sections, keep: (section: string, collection: string, id: string) => boolean) {
  sections.sectionA.poolRows = sections.sectionA.poolRows.filter((row) => keep("sectionA", "poolRows", row.id));
  sections.sectionA.perKitRows = sections.sectionA.perKitRows.filter((row) => keep("sectionA", "perKitRows", row.id));
  sections.sectionB.lineItems = sections.sectionB.lineItems.filter((row) => keep("sectionB", "lineItems", row.id));
  sections.sectionC.lineItems = sections.sectionC.lineItems.filter((row) => keep("sectionC", "lineItems", row.id));
  const recurring = sections.sectionA.mode === "pool" ? sections.sectionA.poolRows : sections.sectionA.perKitRows;
  sections.sectionA.enabled &&= recurring.length > 0;
  sections.sectionB.enabled &&= sections.sectionB.lineItems.length > 0;
  sections.sectionC.enabled &&= sections.sectionC.lineItems.length > 0;
  sections.sectionA.computed.monthlyRecurringTotal = sections.sectionA.enabled ? recurring.filter((row) => !row.optional && row.rowType !== "overage" && row.billing?.cadence !== "annual" && row.billing?.cadence !== "one_time").reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0) : 0;
  sections.sectionB.computed.equipmentTotal = sections.sectionB.enabled ? sections.sectionB.lineItems.filter((row) => !row.optional && (!row.billing || row.billing.cadence === "one_time")).reduce((sum, row) => sum + row.totalPrice, 0) : 0;
  sections.sectionC.computed.serviceTotal = sections.sectionC.enabled ? sections.sectionC.lineItems.filter((row) => !row.optional && (!row.billing || row.billing.cadence === "one_time")).reduce((sum, row) => sum + row.totalPrice, 0) : 0;
}

function clearSpec(item: SpecFields) {
  delete item.specSheetAttachment;
  delete item.specSheetLabel;
  delete item.specSheetLocation;
}

function cleanOption(quote: QuoteRecord, option: MajorProjectOption, selected: Set<string>) {
  const original = structuredClone(option);
  const metrics = optionMetrics(quote, original);
  const matchesQuick = (section: string, rowId: string) => sectionRows(quote.sections).some((entry) => entry.section === section && entry.rows.some((row) => row.id === rowId) && selected.has(key("quick", section, entry.collection, rowId)));
  option.components = (original.components ?? []).filter((component) => selected.has(key("component", option.id, component.id)) &&
    (isMajor(quote) || !component.quickQuoteSource || matchesQuick(component.quickQuoteSource.section, component.quickQuoteSource.rowId)));
  const componentIds = new Set(option.components.map((component) => component.id));
  const keepIds = (ids: string[] | undefined) => ids?.filter((id) => componentIds.has(id));
  option.simpleRows = (original.simpleRows ?? []).filter((row) => original.components?.some((component) => component.id === `quick-builder-component-${row.id}`)
    ? componentIds.has(`quick-builder-component-${row.id}`) : selected.has(key("simple", option.id, row.id)));
  option.bundles = (original.bundles ?? []).flatMap((bundle) => {
    const resolved = metrics.bundles.find((candidate) => candidate.id === bundle.id);
    const references = unique([...(resolved?.resolvedComponentIds ?? bundle.componentIds), ...(bundle.includedCostComponentIds ?? []), ...(bundle.includedRevenueComponentIds ?? [])]);
    const kept = keepIds(references) ?? [];
    // An emptied explicit subset would trigger the legacy model's "all components" fallback.
    if (!kept.length || [bundle.includedCostComponentIds, bundle.includedRevenueComponentIds].some((ids) => ids?.length && !keepIds(ids)?.length)) return [];
    const next = { ...bundle, componentIds: keepIds(resolved?.resolvedComponentIds ?? bundle.componentIds) ?? [], includedCostComponentIds: keepIds(bundle.includedCostComponentIds), includedRevenueComponentIds: keepIds(bundle.includedRevenueComponentIds) };
    if (kept.length !== references.length) clearSpec(next);
    return [next];
  });
  const bundleIds = new Set(option.bundles.map((bundle) => bundle.id));
  option.components.forEach((component) => { if (component.bundleAssignmentId && !bundleIds.has(component.bundleAssignmentId)) delete component.bundleAssignmentId; });
  option.customerQuoteLines = (original.customerQuoteLines ?? []).flatMap((line) => {
    const resolved = metrics.customerQuoteLines.find((candidate) => candidate.id === line.id);
    const cost = resolved?.resolvedCostComponentIds ?? line.includedCostComponentIds ?? [];
    const revenue = resolved?.resolvedRevenueComponentIds ?? line.includedRevenueComponentIds ?? [];
    const references = unique([...cost, ...revenue]);
    if (!references.some((id) => componentIds.has(id)) || [cost, revenue].some((ids) => ids.length && !keepIds(ids)?.length)) return [];
    const next = { ...line, bundleIds: (resolved?.resolvedBundleIds ?? line.bundleIds).filter((id) => bundleIds.has(id)), includedCostComponentIds: keepIds(cost), includedRevenueComponentIds: keepIds(revenue) };
    if (references.some((id) => !componentIds.has(id))) clearSpec(next);
    return [next];
  });
  if (option.quickQuoteSource) {
    filterSections(option.quickQuoteSource.sections, (section, collection, rowId) => {
      const linked = (original.components ?? []).filter((component) => component.quickQuoteSource?.section === section && component.quickQuoteSource.rowId === rowId);
      return linked.length ? linked.some((component) => componentIds.has(component.id)) : selected.has(key("snapshot", option.id, section, collection, rowId));
    });
  }
  const rows = new Set(option.simpleRows.map((row) => row.id));
  option.vendorQuotes = (option.vendorQuotes ?? []).flatMap((file) => {
    const importedRowIds = file.importedRowIds?.filter((id) => rows.has(id));
    const importedComponentIds = file.importedComponentIds?.filter((id) => componentIds.has(id));
    const linked = [...(original.components ?? []), ...(original.simpleRows ?? [])].filter((item) => item.importSource?.importId === file.id);
    const hadLinks = Boolean(file.importedRowIds?.length || file.importedComponentIds?.length || linked.length);
    const stillLinked = [...option.components!, ...option.simpleRows!].some((item) => item.importSource?.importId === file.id);
    if (hadLinks && !importedRowIds?.length && !importedComponentIds?.length && !stillLinked) return [];
    const scopeChanged = option.components!.length !== original.components?.length || option.simpleRows!.length !== original.simpleRows?.length;
    return [{ ...file, importedRowIds, importedComponentIds, ...(scopeChanged ? { previewItems: [] } : {}) }];
  });
  for (const field of ["monthlyRatePerSite", "hardwarePerSite", "installPerSite", "otherOneTimePerSite", "vendorRecurringPerSite", "supportRecurringPerSite", "otherRecurringPerSite"] as const) option[field] = 0;
  option.vendorSummary = [];
}

function forAllSections(quote: QuoteRecord, change: (sections: Sections) => void) {
  change(quote.sections);
  quote.majorProject.options.forEach((option) => { if (option.quickQuoteSource) change(option.quickQuoteSource.sections); });
}

function clearSectionProse(sections: Sections) {
  sections.sectionA.introText = "";
  sections.sectionA.explanatoryParagraphs = [];
  sections.sectionB.introText = "";
  sections.sectionC.introText = "";
}

function clearTerms(quote: QuoteRecord) {
  quote.terms = { generalStarlinkServiceTermsTitle: "Service terms", generalStarlinkServiceTerms: [], pricingTermsTitle: "Pricing terms", pricingTerms: [] };
  quote.customerOutput = normalizeCustomerOutput(undefined);
  quote.approval.approvalNote = "";
  quote.warranty = { enabled: false, heading: "Warranty", manufacturerReference: "", coverageNote: "", claimNote: "" };
  quote.majorProject.summary.paymentTerms = "";
  quote.majorProject.summary.billingStart = "";
  quote.majorProject.summary.assumptions = "";
  quote.metadata.hasActiveDataAgreement = false;
  quote.serviceAgreement = { ...createDefaultQuoteServiceAgreementState(), useCustomerDefaults: false };
  forAllSections(quote, clearSectionProse);
}

function clearCustomer(quote: QuoteRecord, source: QuoteRecord) {
  const identities = unique([source.customer.name, source.customer.logoText, source.customer.contactName, source.customer.contactEmail, source.customer.contactPhone,
    source.metadata.customerShortName, source.metadata.accountName, source.metadata.accountId, source.metadata.opportunityName, source.metadata.opportunityId,
    ...source.customer.addressLines, ...source.billTo.lines, ...source.shipTo.lines].filter((value): value is string => Boolean(value?.trim())));
  const customerSpecific = (value: string) => identities.some((identity) => value.toLocaleLowerCase().includes(identity.toLocaleLowerCase()));
  const label = (value: string, fallback: string) => customerSpecific(value) ? fallback : value;
  quote.customer = { name: "", contactName: "", contactPhone: "", contactEmail: "", addressLines: [] };
  quote.billTo = { lines: [] };
  quote.shipTo = { lines: [] };
  quote.shippingSameAsBillTo = true;
  Object.assign(quote.metadata, { documentTitle: "New customer quote", documentSubtitle: "", customerShortName: "", accountId: undefined, accountName: undefined, opportunityId: undefined, opportunityName: undefined, salesTaxAmount: 0, hasActiveDataAgreement: false });
  quote.internal.savedCustomerProfileId = undefined;
  quote.internal.internalNotes = "";
  quote.serviceAgreement = { ...createDefaultQuoteServiceAgreementState(), useCustomerDefaults: false };
  quote.orderProcessing = normalizeOrderProcessing(undefined);
  quote.customerOutput = normalizeCustomerOutput(undefined);
  quote.executiveSummary = { enabled: false, heading: "", customerContext: "", body: "", paragraphs: [], blocks: [] };
  quote.customFields = [];
  quote.documentation.customerAddressHeading = "Customer";
  quote.documentation.billToHeading = "Bill to";
  quote.documentation.shipToHeading = "Ship to";
  quote.approval = { heading: "Approval", signatureLabel: "Signature", customerNameLabel: "Customer name", dateLabel: "Date", approvalNote: "" };
  quote.commercial.meta = { optionLabel: label(quote.commercial.meta.optionLabel, "Option 1"), comparisonGroup: "", notes: "" };
  Object.assign(quote.majorProject.summary, { projectName: "", projectDescription: "", paymentTerms: "", billingStart: "", assumptions: "" });
  // Only deliberately retained, non-customer-specific service/pricing terms survive.
  quote.terms.generalStarlinkServiceTerms = quote.terms.generalStarlinkServiceTerms.filter((value) => !customerSpecific(value));
  quote.terms.pricingTerms = quote.terms.pricingTerms.filter((value) => !customerSpecific(value));
  quote.terms.generalStarlinkServiceTermsTitle = "Service terms";
  quote.terms.pricingTermsTitle = "Pricing terms";
  quote.terms.selectedPackageKey = undefined;
  quote.warranty = { enabled: false, heading: "Warranty", manufacturerReference: "", coverageNote: "", claimNote: "" };
  forAllSections(quote, (sections) => {
    clearSectionProse(sections);
    sections.sectionA.title = "Recurring services";
    sections.sectionB.title = "Equipment";
    sections.sectionC.title = "Services";
    for (const entry of sectionRows(sections)) for (const row of entry.rows) {
      if ("itemName" in row) { row.itemName = label(row.itemName, "Equipment"); row.description = ""; }
      else row.description = label(row.description, "Service");
      if ("notes" in row) row.notes = "";
      if ("includedText" in row) row.includedText = [];
      row.sourceLabel = undefined;
    }
  });
  for (const option of quote.majorProject.options) {
    option.label = label(option.label, "Option");
    option.description = "";
    if (option.quickQuoteSource) option.quickQuoteSource.commercialMeta = { optionLabel: option.label, comparisonGroup: "", notes: "" };
    for (const row of option.simpleRows ?? []) { row.label = label(row.label, "Item"); row.description = ""; }
    for (const component of option.components ?? []) {
      component.internalName = label(component.internalName, "Item");
      component.customerFacingLabel = label(component.customerFacingLabel ?? "", component.internalName);
      component.notes = "";
      for (const task of component.laborTasks ?? []) task.task = label(task.task, "Labor");
    }
    for (const bundle of option.bundles ?? []) { bundle.internalName = label(bundle.internalName, "Package"); bundle.customerFacingLabel = label(bundle.customerFacingLabel, "Package"); bundle.description = ""; }
    for (const line of option.customerQuoteLines ?? []) { line.label = label(line.label, "Item"); line.description = ""; }
  }
  for (const field of ["installationLabel", "equipmentLabel", "recurringLabel", "optionalServicesLabel"] as const) quote.majorProject.commercial[field] = label(quote.majorProject.commercial[field], "Project scope");
}

export function applyQuoteCopyReview(source: QuoteRecord, review: QuoteCopyReviewOptions): QuoteRecord {
  if (!["same", "different"].includes(review.customerMode) || !Array.isArray(review.keptScopeKeys) ||
    ![review.terms, review.attachments, review.supportingAttachments].every((choice) => choice === "keep" || choice === "remove")) {
    throw new Error("Choose the customer, terms, spec sheets, and supporting attachments before copying.");
  }
  const catalog = getQuoteCopyScopeItems(source);
  const valid = new Set(catalog.map((item) => item.key));
  if (review.keptScopeKeys.some((item) => !valid.has(item))) throw new Error("The source scope changed. Close this review and open it again.");
  const selected = new Set(review.keptScopeKeys);
  let quote = ensureMajorProjectState(structuredClone(source));
  for (const option of quote.majorProject.options) cleanOption(quote, option, selected);
  if (!isMajor(quote)) filterSections(quote.sections, (section, collection, id) => selected.has(key("quick", section, collection, id)));
  for (const field of ["terminalFeePerSite", "overageRatePerGb", "optionalServicesAmount"] as const) if (!selected.has(key("commercial", field))) quote.majorProject.commercial[field] = 0;
  if (!quote.majorProject.options.some((option) => option.id === quote.majorProject.activeOptionId)) quote.majorProject.activeOptionId = quote.majorProject.options[0]?.id ?? "";
  const scopeChanged = catalog.some((item) => !selected.has(item.key));
  if (scopeChanged) {
    quote.orderProcessing = normalizeOrderProcessing(undefined);
    quote.customerOutput = normalizeCustomerOutput({ ...quote.customerOutput, commercialConfirmation: "", fieldServiceConfirmation: "" });
    // Quick Quote cost inputs are aggregate, not linked to individual rows.
    if (!isMajor(quote)) for (const field of Object.keys(quote.commercial.costs) as Array<keyof QuoteRecord["commercial"]["costs"]>) quote.commercial.costs[field] = 0;
  }
  if (review.terms === "remove") clearTerms(quote);
  if (review.customerMode === "different") clearCustomer(quote, source);
  if (review.attachments === "remove") {
    forAllSections(quote, (sections) => sectionRows(sections).forEach((entry) => entry.rows.forEach(clearSpec)));
    quote.majorProject.options.forEach((option) => [...(option.components ?? []), ...(option.simpleRows ?? []), ...(option.bundles ?? []), ...(option.customerQuoteLines ?? [])].forEach(clearSpec));
  }
  if (review.supportingAttachments === "remove" || review.customerMode === "different") {
    // Supplier imports and signed SLAs may name the original customer. Never reuse them for another customer.
    quote.majorProject.bomImport = undefined;
    quote.serviceAgreement.profile.sourceDocument = undefined;
    quote.majorProject.options.forEach((option) => {
      option.vendorQuotes = [];
      [...(option.components ?? []), ...(option.simpleRows ?? [])].forEach((item) => { item.importSource = undefined; });
    });
  }
  if (review.supportingAttachments === "remove") quote.majorProject.summary.systemDrawings = [];
  if (isMajor(quote)) quote = applyMajorProjectToQuote(quote);
  // Projection can restore section prose from a Quick Quote snapshot. Clear it on both sides.
  if (review.terms === "remove") forAllSections(quote, clearSectionProse);
  quote.proForma = undefined;
  quote.metadata.expirationDate = undefined;
  quote.customerOutput = normalizeCustomerOutput({ ...quote.customerOutput, commercialConfirmation: "", fieldServiceConfirmation: "" });
  return quote;
}

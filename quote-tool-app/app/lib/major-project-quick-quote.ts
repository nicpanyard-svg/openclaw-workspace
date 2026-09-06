import type { EquipmentPricingRow, MajorProjectComponent, MajorProjectOption, PoolPricingRow, QuoteCommercialCostInputs, QuoteRecord, ServicePricingRow } from "./quote-record";
import { getLineBilling } from "./quote-line-billing";

type Section = "sectionA" | "sectionB" | "sectionC";
type SourceRow = PoolPricingRow | EquipmentPricingRow | ServicePricingRow;

function sourceRows(sections: QuoteRecord["sections"], section: Section): SourceRow[] {
  if (section !== "sectionA") return sections[section].lineItems;
  return sections.sectionA.mode === "pool" ? sections.sectionA.poolRows : sections.sectionA.perKitRows;
}

function rowValues(row: SourceRow, section: Section) {
  const recurring = row as PoolPricingRow;
  const equipment = row as EquipmentPricingRow;
  const service = row as ServicePricingRow;
  return {
    label: section === "sectionB" ? equipment.itemName : recurring.description,
    description: section === "sectionA" ? recurring.includedText?.join("\n") ?? "" : section === "sectionB" ? equipment.description ?? "" : service.notes ?? "",
    quantity: row.quantity ?? 1,
    unit: section === "sectionB" ? "ea" : recurring.unitLabel || "ea",
    unitPrice: section === "sectionA" ? recurring.monthlyRate ?? recurring.unitPrice ?? 0 : equipment.unitPrice,
    totalPrice: section === "sectionA" ? recurring.totalMonthlyRate ?? 0 : equipment.totalPrice,
    usageBased: section === "sectionA" && recurring.rowType === "overage",
  };
}

export function buildQuickQuoteComponents(quote: QuoteRecord): MajorProjectComponent[] {
  const components: MajorProjectComponent[] = [];
  const usedIds = new Set<string>();
  const uniqueId = (preferred: string) => {
    let id = preferred;
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${preferred}-${suffix}`;
    usedIds.add(id);
    return id;
  };
  for (const section of ["sectionA", "sectionB", "sectionC"] as const) {
    if (!quote.sections[section].enabled) continue;
    for (const row of sourceRows(quote.sections, section)) {
      const values = rowValues(row, section);
      const billing = getLineBilling(row, section === "sectionA" ? "monthly" : "one_time");
      const lineType = section === "sectionA"
        ? (row as PoolPricingRow).rowType === "support" ? "support" : "subscription"
        : section === "sectionB" ? "hardware" : (row as ServicePricingRow).lineType === "software" ? "software" : (row as ServicePricingRow).serviceCategory === "installation" ? "installation" : "service";
      components.push({
        id: uniqueId(row.id), quickQuoteSource: { section, rowId: row.id, usageBased: values.usageBased },
        internalName: values.label, notes: values.description,
        optional: row.optional, imageUrl: (row as EquipmentPricingRow).imageUrl, specSheetLabel: row.specSheetLabel,
        quantity: values.quantity, unit: values.unit, customerUnitPrice: values.unitPrice,
        customerExtendedPrice: values.usageBased ? 0 : values.totalPrice,
        billing, schedule: billing.cadence === "monthly" ? "recurring" : "one_time",
        vendor: "", category: "", lineType, vendorUnitCost: 0, vendorExtendedCost: 0,
        costBasis: "other", resaleBasis: "fixed_fee", passThrough: false,
      });
    }
  }

  // Quick Quote has aggregate costs, not per-item costs. Keep them as editable
  // internal cost rows instead of inventing a cost allocation or losing margin.
  const costRows: Array<[keyof QuoteCommercialCostInputs, string, MajorProjectComponent["lineType"], "one_time" | "monthly" | "annual"]> = [
    ["oneTimeEquipmentCost", "Quick Quote hardware cost", "hardware", "one_time"],
    ["oneTimeLaborCost", "Quick Quote labor cost", "internal_labor", "one_time"],
    ["oneTimeOtherCost", "Quick Quote other one-time cost", "other", "one_time"],
    ["recurringVendorCost", "Quick Quote monthly vendor cost", "subscription", "monthly"],
    ["recurringSupportCost", "Quick Quote monthly support cost", "support", "monthly"],
    ["recurringOtherCost", "Quick Quote other monthly cost", "other", "monthly"],
    ["annualSubscriptionCost", "Quick Quote annual subscription cost", "subscription", "annual"],
  ];
  for (const [key, label, lineType, cadence] of costRows) {
    const cost = quote.commercial.costs[key] ?? 0;
    if (!cost) continue;
    components.push({
      id: uniqueId(`quick-quote-cost-${key}`), internalName: label, customerFacingLabel: "",
      vendor: "", category: "", lineType, quantity: 1, unit: "total",
      customerUnitPrice: 0, customerExtendedPrice: 0, vendorUnitCost: cost, vendorExtendedCost: cost,
      schedule: cadence === "monthly" ? "recurring" : "one_time", billing: { cadence },
      costBasis: "other", resaleBasis: "fixed_fee", passThrough: false,
    });
  }
  return components;
}

function projectSourceRow(component: MajorProjectComponent, original: SourceRow, section: Section): SourceRow {
  const baseline = rowValues(original, section);
  const row = { ...original, id: component.id };
  const label = component.customerFacingLabel?.trim() || component.internalName;
  if (section === "sectionB") {
    const equipment = row as EquipmentPricingRow;
    equipment.itemName = label;
    if (component.imageUrl !== equipment.imageUrl) equipment.imageUrl = component.imageUrl;
    if ((component.notes ?? "") !== baseline.description) equipment.description = component.notes;
  } else {
    (row as PoolPricingRow | ServicePricingRow).description = label;
    if ((component.notes ?? "") !== baseline.description) {
      if (section === "sectionA") (row as PoolPricingRow).includedText = component.notes?.split("\n");
      else (row as ServicePricingRow).notes = component.notes;
    }
    if (component.unit !== baseline.unit) (row as PoolPricingRow | ServicePricingRow).unitLabel = component.unit;
  }
  if (component.quantity !== baseline.quantity) row.quantity = component.quantity;
  if (component.customerUnitPrice !== baseline.unitPrice) {
    row.unitPrice = component.customerUnitPrice;
    if (section === "sectionA") (row as PoolPricingRow).monthlyRate = component.customerUnitPrice;
  }
  if (section === "sectionA") {
    if (!baseline.usageBased && component.customerExtendedPrice !== baseline.totalPrice) (row as PoolPricingRow).totalMonthlyRate = component.customerExtendedPrice;
    else if (component.customerUnitPrice !== baseline.unitPrice) (row as PoolPricingRow).totalMonthlyRate = component.customerUnitPrice;
  } else (row as EquipmentPricingRow | ServicePricingRow).totalPrice = component.customerExtendedPrice;
  if (Boolean(component.optional) !== Boolean(original.optional)) row.optional = component.optional;
  if (JSON.stringify(component.billing) !== JSON.stringify(getLineBilling(row, section === "sectionA" ? "monthly" : "one_time"))) row.billing = component.billing;
  if ((component.specSheetLabel ?? "") !== (original.specSheetLabel ?? "")) row.specSheetLabel = component.specSheetLabel;
  return row;
}

export function preserveQuickQuoteOutput(next: QuoteRecord, option: MajorProjectOption, directOutput: boolean) {
  const source = option.quickQuoteSource;
  if (!source) return;
  const generated = next.sections;
  const restored = structuredClone(source.sections);
  for (const section of ["sectionA", "sectionB", "sectionC"] as const) {
    const generatedRows = sourceRows(generated, section);
    const byId = new Map(generatedRows.map((row) => [row.id, row]));
    const rows = directOutput ? (option.components ?? []).flatMap((component) => {
      const reference = component.quickQuoteSource;
      const original = reference?.section === section
        ? sourceRows(source.sections, section).find((row) => row.id === reference.rowId) : undefined;
      // A deliberate cadence/category change uses the normal Major Project mapping.
      const sameSection = section === "sectionA" ? component.schedule === "recurring" || component.billing?.cadence === "annual"
        : component.schedule !== "recurring" && (section === "sectionB" ? component.lineType === "hardware" : component.lineType !== "hardware");
      if (original && sameSection) return [projectSourceRow(component, original, section)];
      if (reference?.section === "sectionA" && component.billing?.cadence === "annual") return [];
      return byId.has(component.id) ? [byId.get(component.id)!] : [];
    }) : generatedRows;

    // Disabled and inactive Quick Quote data remains stored, not silently included.
    const enabled = rows.length > 0 || (source.sections[section].enabled && generated[section].enabled);
    restored[section].enabled = enabled;
    if (section === "sectionA") {
      restored.sectionA.termMonths = next.majorProject.commercial.termMonths;
      restored.sectionA.mode = next.majorProject.commercial.serviceMix === "starlink-pool" ? "pool" : "per_kit";
      if (enabled || source.sections.sectionA.enabled) {
        if (restored.sectionA.mode === "pool") restored.sectionA.poolRows = rows as PoolPricingRow[];
        else restored.sectionA.perKitRows = rows.filter((row) => (row as PoolPricingRow).rowType !== "overage") as QuoteRecord["sections"]["sectionA"]["perKitRows"];
      }
    } else if (section === "sectionB") {
      if (enabled || source.sections.sectionB.enabled) restored.sectionB.lineItems = rows as EquipmentPricingRow[];
    } else if (enabled || source.sections.sectionC.enabled) restored.sectionC.lineItems = rows as ServicePricingRow[];
  }
  next.sections = restored;
  next.commercial.meta = { ...source.commercialMeta };
}

export function sameQuickQuoteContent(left: QuoteRecord, right: QuoteRecord) {
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
    return item;
  });
  return canonical([left.sections, left.commercial]) === canonical([right.sections, right.commercial]);
}

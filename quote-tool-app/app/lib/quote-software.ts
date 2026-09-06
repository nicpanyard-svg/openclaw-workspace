import type { MajorProjectComponent, QuoteRecord, ServicePricingRow } from "./quote-record";

export const IOTEDGE_KINNECT_LABEL = "LoRaWAN Edge Container Software - RAD IoTEDGE Kinnect";
export const IOTEDGE_KINNECT_DESCRIPTION = "Containerized edge software hosted on the RAD SecFlow-1p. Provides the LoRaWAN application/edge-services layer. Supports sensor data collection, monitoring, alerts, reporting, integrations, and APIs. One software instance/license per configured gateway, as quoted.";

// Match the named product, not installation/support work that mentions it.
export function isIoTEdgeKinnect(label?: string) {
  const value = (label ?? "").trim().replace(/[\u2013\u2014]/g, "-");
  return /^(?:(?:LoRaWAN\s+)?Edge\s+(?:Container\s+)?Software\s*[-:]\s*)?(?:RAD\s+)?IoTEDGE\s+Kinnect(?:\s+from\s+RAD)?(?:\s*[-:]\s*LoRaWAN\s+Edge\s+Container\s+Software)?$/i.test(value);
}

function softwareNotes(notes?: string) {
  return !notes?.trim() || /^Generated (?:directly from|from major project)/i.test(notes.trim())
    ? IOTEDGE_KINNECT_DESCRIPTION : notes;
}

export function normalizeSoftwareComponent(component: MajorProjectComponent): MajorProjectComponent {
  if (!isIoTEdgeKinnect(component.customerFacingLabel || component.internalName)) return component;
  return { ...component, lineType: "software", category: "Software", customerFacingLabel: IOTEDGE_KINNECT_LABEL,
    internalName: isIoTEdgeKinnect(component.internalName) ? IOTEDGE_KINNECT_LABEL : component.internalName,
    unit: !component.unit || component.unit === "ea" ? "license" : component.unit,
    notes: softwareNotes(component.notes) };
}

export function isSoftwareLine(row: Pick<ServicePricingRow, "description" | "lineType">) {
  return row.lineType === "software" || isIoTEdgeKinnect(row.description);
}

export function normalizeQuoteSoftware(quote: QuoteRecord): QuoteRecord {
  return {
    ...quote,
    sections: {
      ...quote.sections,
      sectionC: {
        ...quote.sections.sectionC,
        lineItems: quote.sections.sectionC.lineItems.map((row) => isIoTEdgeKinnect(row.description)
          ? { ...row, lineType: "software", serviceCategory: "custom", description: IOTEDGE_KINNECT_LABEL, notes: softwareNotes(row.notes), unitLabel: !row.unitLabel || row.unitLabel === "ea" ? "license" : row.unitLabel }
          : row),
      },
    },
  };
}

export function getSoftwareServicesPresentation(rows: ServicePricingRow[]) {
  const software = rows.some(isSoftwareLine);
  const services = rows.some((row) => !isSoftwareLine(row));
  return {
    title: software ? services ? "Software & implementation services" : "Software licenses" : "Implementation & field services",
    caption: software ? "Included software licenses and services" : "Included implementation and field services",
    itemHeading: software ? "Software / service" : "Service",
    totalLabel: software ? services ? "One-time software & services total" : "One-time software total" : "One-time services total",
  };
}

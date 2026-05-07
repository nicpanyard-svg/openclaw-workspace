import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import type { MajorProjectCustomerQuoteLineMetrics } from "@/app/lib/major-project";
import { buildMajorProjectMetrics } from "@/app/lib/major-project";
import type {
  MajorProjectComponent,
  MajorProjectSimpleRow,
  QuoteRecord,
} from "@/app/lib/quote-record";

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

type CellType = "string" | "number";

type WorksheetCell = {
  ref: string;
  type: CellType;
  value: string | number;
  styleId?: number;
};

type WorksheetMerge = {
  start: string;
  end: string;
};

type WorksheetDefinition = {
  name: string;
  cols: Array<{ width: number }>;
  rows: Array<{
    index: number;
    height?: number;
    cells: WorksheetCell[];
  }>;
  merges?: WorksheetMerge[];
  freezeTopRow?: boolean;
  autoFilter?: string;
};

type ApprovalWorkbookLine = {
  item: string;
  description: string;
  category: string;
  schedule: string;
  quantity: number | "";
  unit: string;
  customerPricing: number;
  ourCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  notes: string;
};

type ApprovalWorkbookModel = {
  fileNameBase: string;
  quoteDate: string;
  customerName: string;
  proposalNumber: string;
  projectName: string;
  projectDescription: string;
  preparedBy: string;
  optionLabel: string;
  statusLabel: string;
  workflowLabel: string;
  recurringRevenue: number;
  recurringCost: number;
  recurringGrossProfit: number;
  recurringGrossMarginPercent: number;
  oneTimeRevenue: number;
  oneTimeCost: number;
  oneTimeGrossProfit: number;
  oneTimeGrossMarginPercent: number;
  totalRevenue: number;
  totalCost: number;
  totalGrossProfit: number;
  totalGrossMarginPercent: number;
  lines: ApprovalWorkbookLine[];
  assumptions: string[];
  vendorNotes: string[];
  serviceReferences: string[];
  internalNotes: string[];
};

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value);
}

const crc32Table = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let shift = 0; shift < 8; shift += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }

  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11);
  const dosDate = date.getDate() | ((date.getMonth() + 1) << 5) | ((year - 1980) << 9);

  return { dosDate, dosTime };
}

function writeUint16(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function concatUint8Arrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function createStoredZip(entries: ZipEntry[]) {
  const now = dosDateTime(new Date());
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileNameBytes = encodeUtf8(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + fileNameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, now.dosTime);
    writeUint16(localHeader, 12, now.dosDate);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, entry.data.length);
    writeUint32(localHeader, 22, entry.data.length);
    writeUint16(localHeader, 26, fileNameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(fileNameBytes, 30);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, now.dosTime);
    writeUint16(centralHeader, 14, now.dosDate);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, entry.data.length);
    writeUint32(centralHeader, 24, entry.data.length);
    writeUint16(centralHeader, 28, fileNameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, localOffset);
    centralHeader.set(fileNameBytes, 46);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.data.length;
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const endRecord = new Uint8Array(22);
  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, entries.length);
  writeUint16(endRecord, 10, entries.length);
  writeUint32(endRecord, 12, centralDirectory.length);
  writeUint32(endRecord, 16, localOffset);
  writeUint16(endRecord, 20, 0);

  return concatUint8Arrays([...localParts, centralDirectory, endRecord]);
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toColumnName(index: number) {
  let value = index;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function cellRef(columnIndex: number, rowIndex: number) {
  return `${toColumnName(columnIndex)}${rowIndex}`;
}

function compact(values: Array<string | undefined | null>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function safePercent(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizeQuantity(value: number | string | null | undefined): number | "" {
  if (value === "" || value === null || value === undefined) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : "";
}

function fileSafeName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "proposal";
}

function allocateCostsByRevenue<T extends { revenue: number }>(items: T[], totalCost: number) {
  const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);
  let allocated = 0;

  return items.map((item, index) => {
    if (index === items.length - 1) {
      return roundCurrency(totalCost - allocated);
    }

    const cost = totalRevenue > 0 ? roundCurrency(totalCost * (item.revenue / totalRevenue)) : 0;
    allocated = roundCurrency(allocated + cost);
    return cost;
  });
}

function buildQuickQuoteLines(quote: QuoteRecord, model: ApprovalWorkbookModel) {
  const recurringRows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;
  const recurringPricedRows = recurringRows
    .filter((row) => (row.totalMonthlyRate ?? 0) > 0 || (row.monthlyRate ?? 0) > 0)
    .map((row) => ({
      item: row.description || "Recurring item",
      description: row.includedText?.length ? `${row.description} - ${row.includedText.join("; ")}` : row.description,
      category: row.rowType === "terminal_fee" ? "Terminal fee" : row.rowType === "overage" ? "Usage / overage" : row.rowType === "support" ? "Support" : "Recurring service",
      schedule: "Recurring",
      quantity: row.quantity ?? "",
      unit: row.unitLabel ?? "",
      revenue: roundCurrency(row.totalMonthlyRate ?? row.monthlyRate ?? row.unitPrice ?? 0),
      notes: compact([row.sourceLabel, row.rowType === "support" ? "Cost allocated from recurring summary." : "Derived from proposal recurring section."]).join(" | "),
    }));

  const recurringCosts = allocateCostsByRevenue(recurringPricedRows, model.recurringCost);

  const equipmentRows = quote.sections.sectionB.lineItems.map((row) => ({
    item: row.itemName || "Equipment item",
    description: compact([row.description, row.partNumber, row.terminalType]).join(" | "),
    category: row.itemCategory || "Equipment",
    schedule: "One-time",
    quantity: row.quantity,
    unit: "ea",
    revenue: roundCurrency(row.totalPrice),
    notes: compact([row.sourceLabel, "Cost allocated from one-time summary."]).join(" | "),
  }));

  const serviceRows = quote.sections.sectionC.lineItems.map((row) => ({
    item: row.description || "Service item",
    description: row.notes || row.description,
    category: row.serviceCategory === "site_inspection" ? "Site inspection" : row.serviceCategory === "installation" ? "Installation" : "Service",
    schedule: "One-time",
    quantity: row.quantity,
    unit: row.unitLabel ?? "ea",
    revenue: roundCurrency(row.totalPrice),
    notes: compact([row.sourceLabel, row.pricingStage ? `${row.pricingStage} pricing` : "", "Cost allocated from one-time summary."]).join(" | "),
  }));

  const oneTimeRows = [...equipmentRows, ...serviceRows];
  const oneTimeCosts = allocateCostsByRevenue(oneTimeRows, model.oneTimeCost);

  return [
    ...recurringPricedRows.map((row, index) => {
      const ourCost = recurringCosts[index] ?? 0;
      const grossProfit = roundCurrency(row.revenue - ourCost);
      return {
        item: row.item,
        description: row.description,
        category: row.category,
        schedule: row.schedule,
        quantity: normalizeQuantity(row.quantity),
        unit: row.unit,
        customerPricing: row.revenue,
        ourCost,
        grossProfit,
        grossMarginPercent: safePercent(grossProfit, row.revenue) * 100,
        notes: row.notes,
      } satisfies ApprovalWorkbookLine;
    }),
    ...oneTimeRows.map((row, index) => {
      const ourCost = oneTimeCosts[index] ?? 0;
      const grossProfit = roundCurrency(row.revenue - ourCost);
      return {
        item: row.item,
        description: row.description,
        category: row.category,
        schedule: row.schedule,
        quantity: normalizeQuantity(row.quantity),
        unit: row.unit,
        customerPricing: row.revenue,
        ourCost,
        grossProfit,
        grossMarginPercent: safePercent(grossProfit, row.revenue) * 100,
        notes: row.notes,
      } satisfies ApprovalWorkbookLine;
    }),
  ];
}

function buildAdvancedMajorProjectLines(components: MajorProjectComponent[]) {
  return components.map((component) => {
    const grossProfit = roundCurrency(component.customerExtendedPrice - component.vendorExtendedCost);
    return {
      item: component.customerFacingLabel?.trim() || component.internalName || "Component",
      description: compact([
        component.internalName && component.customerFacingLabel && component.customerFacingLabel !== component.internalName ? `Internal: ${component.internalName}` : "",
        component.vendor ? `Vendor: ${component.vendor}` : "",
        component.manufacturer ? `Mfr: ${component.manufacturer}` : "",
        component.notes,
      ]).join(" | "),
      category: component.category || component.lineType,
      schedule: component.schedule === "recurring" ? "Recurring" : "One-time",
      quantity: component.quantity,
      unit: component.unit || "ea",
      customerPricing: roundCurrency(component.customerExtendedPrice),
      ourCost: roundCurrency(component.vendorExtendedCost),
      grossProfit,
      grossMarginPercent: safePercent(grossProfit, component.customerExtendedPrice) * 100,
      notes: compact([
        component.passThrough ? "Pass-through" : "",
        component.costBasis ? `Cost basis: ${component.costBasis}` : "",
        component.resaleBasis ? `Resale basis: ${component.resaleBasis}` : "",
      ]).join(" | "),
    } satisfies ApprovalWorkbookLine;
  });
}

function bucketLabel(bucket: MajorProjectSimpleRow["bucket"]) {
  switch (bucket) {
    case "mrr":
      return "Recurring service";
    case "hardware":
      return "Hardware";
    case "install":
      return "Installation";
    case "other_vendor":
      return "Recurring vendor";
    case "support_recurring":
      return "Recurring support";
    case "other_recurring":
      return "Other recurring";
    default:
      return "Other";
  }
}

function buildSimpleMajorProjectLines(rows: MajorProjectSimpleRow[]) {
  return rows.map((row) => {
    const grossProfit = roundCurrency(row.customerExtendedPrice - row.ourExtendedCost);
    return {
      item: row.label || "Project row",
      description: row.description || row.label || "Commercial row",
      category: bucketLabel(row.bucket),
      schedule: row.bucket === "hardware" || row.bucket === "install" ? "One-time" : "Recurring",
      quantity: row.quantity,
      unit: row.unit ?? "",
      customerPricing: roundCurrency(row.customerExtendedPrice),
      ourCost: roundCurrency(row.ourExtendedCost),
      grossProfit,
      grossMarginPercent: safePercent(grossProfit, row.customerExtendedPrice) * 100,
      notes: "Major Project simple builder row.",
    } satisfies ApprovalWorkbookLine;
  });
}

function buildQuoteLineSummaryNotes(lines: MajorProjectCustomerQuoteLineMetrics[]) {
  return lines
    .filter((line) => line.oneTimeRevenue > 0 || line.recurringRevenue > 0)
    .map((line) => {
      const revenue = roundCurrency(line.oneTimeRevenue + line.recurringRevenue);
      const cost = roundCurrency(line.oneTimeCost + line.recurringCost);
      const gp = roundCurrency(revenue - cost);
      return `${line.label}: revenue ${revenue.toFixed(2)}, cost ${cost.toFixed(2)}, GP ${gp.toFixed(2)}.`;
    });
}

function buildWorkbookModel(quote: QuoteRecord): ApprovalWorkbookModel {
  const commercial = buildCommercialMetrics(quote);
  const majorProjectMetrics = buildMajorProjectMetrics(quote);
  const workflowLabel = quote.metadata.workflowMode === "major_project" ? "Major Project" : "Quick Quote";
  const projectName = quote.majorProject?.summary?.projectName?.trim() || quote.metadata.documentTitle || quote.customer.name;
  const projectDescription = compact([
    quote.majorProject?.summary?.projectDescription,
    quote.executiveSummary.customerContext,
    quote.executiveSummary.body,
  ]).join(" ");

  const lines = quote.metadata.workflowMode === "major_project" && quote.majorProject?.enabled
    ? (majorProjectMetrics.hasThreeLayerModel
      ? buildAdvancedMajorProjectLines(majorProjectMetrics.components)
      : buildSimpleMajorProjectLines(majorProjectMetrics.simpleRows))
    : buildQuickQuoteLines(quote, {
      fileNameBase: "",
      quoteDate: "",
      customerName: "",
      proposalNumber: "",
      projectName: "",
      projectDescription: "",
      preparedBy: "",
      optionLabel: "",
      statusLabel: "",
      workflowLabel: "",
      recurringRevenue: commercial.recurringRevenue,
      recurringCost: commercial.recurringCost,
      recurringGrossProfit: commercial.recurringGrossProfit,
      recurringGrossMarginPercent: commercial.recurringGrossMarginPercent,
      oneTimeRevenue: commercial.oneTimeRevenue,
      oneTimeCost: commercial.oneTimeCost,
      oneTimeGrossProfit: commercial.oneTimeGrossProfit,
      oneTimeGrossMarginPercent: commercial.oneTimeGrossMarginPercent,
      totalRevenue: commercial.totalRevenue,
      totalCost: commercial.totalCost,
      totalGrossProfit: commercial.totalGrossProfit,
      totalGrossMarginPercent: commercial.totalGrossMarginPercent,
      lines: [],
      assumptions: [],
      vendorNotes: [],
      serviceReferences: [],
      internalNotes: [],
    });

  const assumptionEntries = compact([
    quote.majorProject?.summary?.assumptions,
    quote.commercial.meta.notes,
    quote.majorProject?.summary?.paymentTerms ? `Payment terms: ${quote.majorProject.summary.paymentTerms}` : "",
    quote.majorProject?.summary?.billingStart ? `Billing start: ${quote.majorProject.summary.billingStart}` : "",
    quote.metadata.quoteType === "lease" ? `Lease term: ${quote.metadata.leaseTermMonths ?? 12} months.` : "",
  ]);

  const vendorNotes = quote.metadata.workflowMode === "major_project" && quote.majorProject?.enabled
    ? (majorProjectMetrics.vendorSummary.length > 0
      ? majorProjectMetrics.vendorSummary.map((entry) => `${entry.vendor}${entry.manufacturer ? ` / ${entry.manufacturer}` : ""}: one-time cost ${entry.oneTimeCost.toFixed(2)}, recurring cost ${entry.recurringCost.toFixed(2)}.`)
      : ["Vendor costs are tracked in the internal commercial model."])
    : ["Quick Quote mode tracks costs at summary level rather than per vendor."];

  const serviceReferences = compact([
    quote.serviceAgreement.profile.agreementLabel ? `Service agreement: ${quote.serviceAgreement.profile.agreementLabel}` : "",
    quote.serviceAgreement.profile.sourceDocument?.fileName ? `Reference file: ${quote.serviceAgreement.profile.sourceDocument.fileName}` : "",
    quote.serviceAgreement.profile.signedDate ? `Signed date: ${quote.serviceAgreement.profile.signedDate}` : "",
    ...quote.serviceAgreement.profile.categories
      .filter((category) => category.laborRate !== null || category.notes)
      .map((category) => `${category.label}: ${category.rateBasis}${category.laborRate !== null ? ` labor ${category.laborRate.toFixed(2)}` : ""}${category.mileageRate !== null ? `, mileage ${category.mileageRate.toFixed(2)}` : ""}${category.notes ? `, ${category.notes}` : ""}`),
  ]);

  const internalNotes = compact([
    quote.internal.internalNotes,
    quote.integrations.lastSyncSummary,
    ...buildQuoteLineSummaryNotes(majorProjectMetrics.customerQuoteLines),
    majorProjectMetrics.validation.errorCount > 0 || majorProjectMetrics.validation.warningCount > 0
      ? `Validation: ${majorProjectMetrics.validation.errorCount} errors, ${majorProjectMetrics.validation.warningCount} warnings in the major project mapping model.`
      : "",
  ]);

  return {
    fileNameBase: `${fileSafeName(quote.metadata.proposalNumber)}-approval-workbook-v2`,
    quoteDate: quote.metadata.proposalDate,
    customerName: quote.customer.name,
    proposalNumber: quote.metadata.proposalNumber,
    projectName,
    projectDescription,
    preparedBy: quote.metadata.ownerName || quote.inet.contactName || "RapidQuote",
    optionLabel: quote.commercial.meta.optionLabel || "Option 1",
    statusLabel: quote.metadata.status.replaceAll("_", " "),
    workflowLabel,
    recurringRevenue: commercial.recurringRevenue,
    recurringCost: commercial.recurringCost,
    recurringGrossProfit: commercial.recurringGrossProfit,
    recurringGrossMarginPercent: commercial.recurringGrossMarginPercent,
    oneTimeRevenue: commercial.oneTimeRevenue,
    oneTimeCost: commercial.oneTimeCost,
    oneTimeGrossProfit: commercial.oneTimeGrossProfit,
    oneTimeGrossMarginPercent: commercial.oneTimeGrossMarginPercent,
    totalRevenue: commercial.totalRevenue,
    totalCost: commercial.totalCost,
    totalGrossProfit: commercial.totalGrossProfit,
    totalGrossMarginPercent: commercial.totalGrossMarginPercent,
    lines,
    assumptions: assumptionEntries,
    vendorNotes,
    serviceReferences,
    internalNotes,
  };
}

function buildExecutiveSummarySheet(model: ApprovalWorkbookModel): WorksheetDefinition {
  const rows: WorksheetDefinition["rows"] = [];
  const merges: WorksheetMerge[] = [];
  let rowIndex = 1;

  const pushMergedText = (label: string, value: string, styleId = 4) => {
    rows.push({
      index: rowIndex,
      cells: [
        { ref: cellRef(2, rowIndex), type: "string", value: label, styleId: 3 },
        { ref: cellRef(3, rowIndex), type: "string", value, styleId },
      ],
    });
    merges.push({ start: cellRef(3, rowIndex), end: cellRef(8, rowIndex) });
    rowIndex += 1;
  };

  rows.push({
    index: rowIndex,
    height: 28,
    cells: [
      { ref: "B1", type: "string", value: "RapidQuote Internal Approval Workbook", styleId: 1 },
    ],
  });
  merges.push({ start: "B1", end: "H1" });
  rowIndex += 1;

  rows.push({
    index: rowIndex,
    cells: [
      { ref: "B2", type: "string", value: "Executive Summary / Approval", styleId: 2 },
    ],
  });
  merges.push({ start: "B2", end: "H2" });
  rowIndex += 2;

  pushMergedText("Date", model.quoteDate);
  pushMergedText("Customer", model.customerName);
  pushMergedText("Proposal Number", model.proposalNumber);
  pushMergedText("Project Name", model.projectName);
  pushMergedText("Prepared By", model.preparedBy);
  pushMergedText("Workflow", `${model.workflowLabel} | ${model.optionLabel} | ${model.statusLabel}`);

  rows.push({
    index: rowIndex,
    height: 48,
    cells: [
      { ref: cellRef(2, rowIndex), type: "string", value: "Project Description", styleId: 3 },
      { ref: cellRef(3, rowIndex), type: "string", value: model.projectDescription || "No project description provided.", styleId: 4 },
    ],
  });
  merges.push({ start: cellRef(3, rowIndex), end: cellRef(8, rowIndex) });
  rowIndex += 2;

  rows.push({
    index: rowIndex,
    cells: [
      { ref: "B10", type: "string", value: "Financial Summary", styleId: 2 },
    ],
  });
  merges.push({ start: cellRef(2, rowIndex), end: cellRef(8, rowIndex) });
  rowIndex += 1;

  const summaryRows: Array<[string, number, number, number, number]> = [
    ["Recurring", model.recurringRevenue, model.recurringCost, model.recurringGrossProfit, model.recurringGrossMarginPercent / 100],
    ["One-time", model.oneTimeRevenue, model.oneTimeCost, model.oneTimeGrossProfit, model.oneTimeGrossMarginPercent / 100],
    ["Total", model.totalRevenue, model.totalCost, model.totalGrossProfit, model.totalGrossMarginPercent / 100],
  ];

  rows.push({
    index: rowIndex,
    cells: [
      { ref: cellRef(2, rowIndex), type: "string", value: "Bucket", styleId: 5 },
      { ref: cellRef(3, rowIndex), type: "string", value: "Customer Price", styleId: 5 },
      { ref: cellRef(4, rowIndex), type: "string", value: "Our Cost", styleId: 5 },
      { ref: cellRef(5, rowIndex), type: "string", value: "Gross Profit", styleId: 5 },
      { ref: cellRef(6, rowIndex), type: "string", value: "Gross Margin", styleId: 5 },
    ],
  });
  rowIndex += 1;

  summaryRows.forEach(([label, revenue, cost, profit, margin], index) => {
    const styleId = index === summaryRows.length - 1 ? 7 : 6;
    rows.push({
      index: rowIndex,
      cells: [
        { ref: cellRef(2, rowIndex), type: "string", value: label, styleId },
        { ref: cellRef(3, rowIndex), type: "number", value: revenue, styleId: styleId === 7 ? 8 : 9 },
        { ref: cellRef(4, rowIndex), type: "number", value: cost, styleId: styleId === 7 ? 8 : 9 },
        { ref: cellRef(5, rowIndex), type: "number", value: profit, styleId: styleId === 7 ? 8 : 9 },
        { ref: cellRef(6, rowIndex), type: "number", value: margin, styleId: styleId === 7 ? 10 : 11 },
      ],
    });
    rowIndex += 1;
  });

  rowIndex += 1;
  rows.push({
    index: rowIndex,
    cells: [
      { ref: cellRef(2, rowIndex), type: "string", value: "Approval Signatures", styleId: 2 },
    ],
  });
  merges.push({ start: cellRef(2, rowIndex), end: cellRef(8, rowIndex) });
  rowIndex += 1;

  const approvalRoles = [
    "CEO:",
    "CFO:",
    "Region GM and/or Area GM:",
    "VP Operations and/or VP Engineering:",
    "SVP and/or VP Sales:",
  ];

  approvalRoles.forEach((label) => {
    rows.push({
      index: rowIndex,
      height: 24,
      cells: [
        { ref: cellRef(2, rowIndex), type: "string", value: label, styleId: 3 },
        { ref: cellRef(3, rowIndex), type: "string", value: "", styleId: 16 },
        { ref: cellRef(7, rowIndex), type: "string", value: "Date:", styleId: 3 },
        { ref: cellRef(8, rowIndex), type: "string", value: "", styleId: 16 },
      ],
    });
    merges.push({ start: cellRef(3, rowIndex), end: cellRef(6, rowIndex) });
    rowIndex += 1;
  });

  return {
    name: "Executive Summary",
    cols: [{ width: 3 }, { width: 20 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }],
    rows,
    merges,
  };
}

function buildLineItemDetailSheet(model: ApprovalWorkbookModel): WorksheetDefinition {
  const rows: WorksheetDefinition["rows"] = [];
  let rowIndex = 1;

  rows.push({
    index: rowIndex,
    height: 24,
    cells: [
      { ref: "A1", type: "string", value: "Line Item Detail", styleId: 1 },
    ],
  });
  rowIndex += 2;

  const headers = [
    "Item",
    "Description",
    "Category / Bucket",
    "Schedule",
    "Qty",
    "Unit",
    "Customer Pricing",
    "Our Cost",
    "Gross Profit",
    "Gross Margin",
    "Notes / Assumptions",
  ];

  rows.push({
    index: rowIndex,
    cells: headers.map((header, index) => ({
      ref: cellRef(index + 1, rowIndex),
      type: "string" as const,
      value: header,
      styleId: 5,
    })),
  });
  rowIndex += 1;

  model.lines.forEach((line) => {
    rows.push({
      index: rowIndex,
      cells: [
        { ref: cellRef(1, rowIndex), type: "string", value: line.item, styleId: 13 },
        { ref: cellRef(2, rowIndex), type: "string", value: line.description, styleId: 14 },
        { ref: cellRef(3, rowIndex), type: "string", value: line.category, styleId: 14 },
        { ref: cellRef(4, rowIndex), type: "string", value: line.schedule, styleId: 14 },
        { ref: cellRef(5, rowIndex), type: typeof line.quantity === "number" ? "number" : "string", value: line.quantity === "" ? "" : line.quantity, styleId: 15 },
        { ref: cellRef(6, rowIndex), type: "string", value: line.unit, styleId: 14 },
        { ref: cellRef(7, rowIndex), type: "number", value: line.customerPricing, styleId: 9 },
        { ref: cellRef(8, rowIndex), type: "number", value: line.ourCost, styleId: 9 },
        { ref: cellRef(9, rowIndex), type: "number", value: line.grossProfit, styleId: 9 },
        { ref: cellRef(10, rowIndex), type: "number", value: line.grossMarginPercent / 100, styleId: 11 },
        { ref: cellRef(11, rowIndex), type: "string", value: line.notes, styleId: 14 },
      ],
    });
    rowIndex += 1;
  });

  rows.push({
    index: rowIndex,
    cells: [
      { ref: cellRef(1, rowIndex), type: "string", value: "Totals", styleId: 7 },
      { ref: cellRef(7, rowIndex), type: "number", value: model.totalRevenue, styleId: 8 },
      { ref: cellRef(8, rowIndex), type: "number", value: model.totalCost, styleId: 8 },
      { ref: cellRef(9, rowIndex), type: "number", value: model.totalGrossProfit, styleId: 8 },
      { ref: cellRef(10, rowIndex), type: "number", value: model.totalGrossMarginPercent / 100, styleId: 10 },
    ],
  });

  return {
    name: "Line Item Detail",
    cols: [
      { width: 26 },
      { width: 42 },
      { width: 20 },
      { width: 12 },
      { width: 10 },
      { width: 10 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 42 },
    ],
    rows,
    freezeTopRow: true,
    autoFilter: `A3:K${Math.max(rowIndex, 3)}`,
  };
}

function buildNotesSheet(model: ApprovalWorkbookModel): WorksheetDefinition {
  const rows: WorksheetDefinition["rows"] = [];
  const merges: WorksheetMerge[] = [];
  let rowIndex = 1;

  const pushSection = (title: string, entries: string[]) => {
    rows.push({
      index: rowIndex,
      cells: [{ ref: cellRef(1, rowIndex), type: "string", value: title, styleId: 2 }],
    });
    merges.push({ start: cellRef(1, rowIndex), end: cellRef(4, rowIndex) });
    rowIndex += 1;

    if (entries.length === 0) {
      rows.push({
        index: rowIndex,
        cells: [{ ref: cellRef(1, rowIndex), type: "string", value: "No notes recorded.", styleId: 14 }],
      });
      merges.push({ start: cellRef(1, rowIndex), end: cellRef(4, rowIndex) });
      rowIndex += 2;
      return;
    }

    entries.forEach((entry) => {
      rows.push({
        index: rowIndex,
        height: 36,
        cells: [{ ref: cellRef(1, rowIndex), type: "string", value: entry, styleId: 14 }],
      });
      merges.push({ start: cellRef(1, rowIndex), end: cellRef(4, rowIndex) });
      rowIndex += 1;
    });
    rowIndex += 1;
  };

  rows.push({
    index: rowIndex,
    height: 24,
    cells: [{ ref: "A1", type: "string", value: "Assumptions / Notes", styleId: 1 }],
  });
  merges.push({ start: "A1", end: "D1" });
  rowIndex += 2;

  pushSection("Commercial assumptions", model.assumptions);
  pushSection("Vendor notes", model.vendorNotes);
  pushSection("SLA / service references", model.serviceReferences);
  pushSection("Internal notes", model.internalNotes);

  return {
    name: "Assumptions & Notes",
    cols: [{ width: 42 }, { width: 42 }, { width: 18 }, { width: 18 }],
    rows,
    merges,
  };
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <numFmts count="1">
      <numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/>
    </numFmts>
    <fonts count="3">
      <font>
        <sz val="11"/>
        <color rgb="FF1F2933"/>
        <name val="Aptos"/>
        <family val="2"/>
      </font>
      <font>
        <b/>
        <sz val="16"/>
        <color rgb="FF8A1538"/>
        <name val="Aptos Display"/>
        <family val="2"/>
      </font>
      <font>
        <b/>
        <sz val="11"/>
        <color rgb="FFFFFFFF"/>
        <name val="Aptos"/>
        <family val="2"/>
      </font>
    </fonts>
    <fills count="6">
      <fill><patternFill patternType="none"/></fill>
      <fill><patternFill patternType="gray125"/></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FFF7F2F4"/><bgColor indexed="64"/></patternFill></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FF8A1538"/><bgColor indexed="64"/></patternFill></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF2"/><bgColor indexed="64"/></patternFill></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    </fills>
    <borders count="4">
      <border>
        <left/><right/><top/><bottom/><diagonal/>
      </border>
      <border>
        <left style="thin"><color rgb="FFD9E2EC"/></left>
        <right style="thin"><color rgb="FFD9E2EC"/></right>
        <top style="thin"><color rgb="FFD9E2EC"/></top>
        <bottom style="thin"><color rgb="FFD9E2EC"/></bottom>
        <diagonal/>
      </border>
      <border>
        <left style="medium"><color rgb="FF8A1538"/></left>
        <right style="medium"><color rgb="FF8A1538"/></right>
        <top style="medium"><color rgb="FF8A1538"/></top>
        <bottom style="medium"><color rgb="FF8A1538"/></bottom>
        <diagonal/>
      </border>
      <border>
        <left/><right/><top/>
        <bottom style="medium"><color rgb="FF8A1538"/></bottom>
        <diagonal/>
      </border>
    </borders>
    <cellStyleXfs count="1">
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    </cellStyleXfs>
    <cellXfs count="17">
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
      <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
      <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
      <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
      <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
      <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
      <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
      <xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
      <xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
      <xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
      <xf numFmtId="10" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
      <xf numFmtId="10" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
      <xf numFmtId="0" fontId="0" fillId="5" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
      <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
      <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
      <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
      <xf numFmtId="0" fontId="0" fillId="5" borderId="3" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="bottom"/></xf>
    </cellXfs>
    <cellStyles count="1">
      <cellStyle name="Normal" xfId="0" builtinId="0"/>
    </cellStyles>
  </styleSheet>`;
}

function renderCell(cell: WorksheetCell) {
  const styleAttr = cell.styleId !== undefined ? ` s="${cell.styleId}"` : "";

  if (cell.type === "number" && typeof cell.value === "number") {
    return `<c r="${cell.ref}"${styleAttr}><v>${cell.value}</v></c>`;
  }

  return `<c r="${cell.ref}" t="inlineStr"${styleAttr}><is><t>${xmlEscape(String(cell.value ?? ""))}</t></is></c>`;
}

function buildWorksheetXml(definition: WorksheetDefinition) {
  const colsXml = definition.cols.map((col, index) => `<col min="${index + 1}" max="${index + 1}" width="${col.width}" customWidth="1"/>`).join("");
  const rowsXml = definition.rows
    .map((row) => {
      const heightAttr = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      const cellsXml = row.cells.map(renderCell).join("");
      return `<row r="${row.index}"${heightAttr}>${cellsXml}</row>`;
    })
    .join("");
  const mergeXml = definition.merges?.length
    ? `<mergeCells count="${definition.merges.length}">${definition.merges.map((merge) => `<mergeCell ref="${merge.start}:${merge.end}"/>`).join("")}</mergeCells>`
    : "";
  const sheetDimension = (() => {
    const lastRow = Math.max(...definition.rows.map((row) => row.index), 1);
    const lastCol = Math.max(definition.cols.length, 1);
    return `A1:${cellRef(lastCol, lastRow)}`;
  })();
  const sheetViews = definition.freezeTopRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const autoFilterXml = definition.autoFilter ? `<autoFilter ref="${definition.autoFilter}"/>` : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <dimension ref="${sheetDimension}"/>
    ${sheetViews}
    <sheetFormatPr defaultRowHeight="18"/>
    <cols>${colsXml}</cols>
    <sheetData>${rowsXml}</sheetData>
    ${autoFilterXml}
    ${mergeXml}
    <pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  </worksheet>`;
}

function buildWorkbookXml(sheets: WorksheetDefinition[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <workbookPr defaultThemeVersion="166925"/>
    <sheets>
      ${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
    </sheets>
  </workbook>`;
}

function buildWorkbookRelationshipsXml(sheets: WorksheetDefinition[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
    <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  </Relationships>`;
}

function buildRootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
    <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
  </Relationships>`;
}

function buildContentTypesXml(sheets: WorksheetDefinition[]) {
  const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    ${sheetOverrides}
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
    <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  </Types>`;
}

function buildThemeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="RapidQuote">
    <a:themeElements>
      <a:clrScheme name="RapidQuote">
        <a:dk1><a:srgbClr val="1F2933"/></a:dk1>
        <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
        <a:dk2><a:srgbClr val="8A1538"/></a:dk2>
        <a:lt2><a:srgbClr val="F7F2F4"/></a:lt2>
        <a:accent1><a:srgbClr val="8A1538"/></a:accent1>
        <a:accent2><a:srgbClr val="52606D"/></a:accent2>
        <a:accent3><a:srgbClr val="BCCCDC"/></a:accent3>
        <a:accent4><a:srgbClr val="486581"/></a:accent4>
        <a:accent5><a:srgbClr val="D9E2EC"/></a:accent5>
        <a:accent6><a:srgbClr val="102A43"/></a:accent6>
        <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
        <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
      </a:clrScheme>
      <a:fontScheme name="Office">
        <a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont>
        <a:minorFont><a:latin typeface="Aptos"/></a:minorFont>
      </a:fontScheme>
      <a:fmtScheme name="Office">
        <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
        <a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
        <a:effectStyleLst><a:effectStyle/></a:effectStyleLst>
        <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
      </a:fmtScheme>
    </a:themeElements>
  </a:theme>`;
}

function buildCoreXml(model: ApprovalWorkbookModel) {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <dc:title>${xmlEscape(model.projectName)} Approval Workbook</dc:title>
    <dc:creator>RapidQuote</dc:creator>
    <cp:lastModifiedBy>RapidQuote</cp:lastModifiedBy>
    <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
    <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
  </cp:coreProperties>`;
}

function buildAppXml(sheets: WorksheetDefinition[]) {
  const titles = sheets.map((sheet) => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
    <Application>RapidQuote</Application>
    <DocSecurity>0</DocSecurity>
    <ScaleCrop>false</ScaleCrop>
    <HeadingPairs>
      <vt:vector size="2" baseType="variant">
        <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
        <vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>
      </vt:vector>
    </HeadingPairs>
    <TitlesOfParts>
      <vt:vector size="${sheets.length}" baseType="lpstr">${titles}</vt:vector>
    </TitlesOfParts>
    <Company>iNet RapidQuote</Company>
  </Properties>`;
}

export async function buildProposalApprovalWorkbook(quote: QuoteRecord) {
  const model = buildWorkbookModel(quote);
  const sheets = [
    buildExecutiveSummarySheet(model),
    buildLineItemDetailSheet(model),
    buildNotesSheet(model),
  ];

  const zipEntries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encodeUtf8(buildContentTypesXml(sheets)) },
    { name: "_rels/.rels", data: encodeUtf8(buildRootRelationshipsXml()) },
    { name: "docProps/core.xml", data: encodeUtf8(buildCoreXml(model)) },
    { name: "docProps/app.xml", data: encodeUtf8(buildAppXml(sheets)) },
    { name: "xl/workbook.xml", data: encodeUtf8(buildWorkbookXml(sheets)) },
    { name: "xl/_rels/workbook.xml.rels", data: encodeUtf8(buildWorkbookRelationshipsXml(sheets)) },
    { name: "xl/styles.xml", data: encodeUtf8(buildStylesXml()) },
    { name: "xl/theme/theme1.xml", data: encodeUtf8(buildThemeXml()) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encodeUtf8(buildWorksheetXml(sheet)),
    })),
  ];

  const zipBytes = createStoredZip(zipEntries);

  return {
    blob: new Blob([zipBytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: `${model.fileNameBase}.xlsx`,
  };
}

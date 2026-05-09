import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import type { MajorProjectCustomerQuoteLineMetrics } from "@/app/lib/major-project";
import { buildMajorProjectMetrics } from "@/app/lib/major-project";
import type {
  MajorProjectComponent,
  MajorProjectSimpleRow,
  QuoteRecord,
} from "@/app/lib/quote-record";

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

type ExcelJSModule = typeof import("exceljs");
type Workbook = import("exceljs").Workbook;
type Worksheet = import("exceljs").Worksheet;
type CellValue = string | number | null;

const BRAND = {
  greenDark: "FF8C1212",
  green: "FFAE0910",
  greenSoft: "FFF7E7E7",
  greenPale: "FFFFF8F8",
  gold: "FFF5F7FA",
  cream: "FFFBFCFE",
  slate: "FF556270",
  slateSoft: "FFF5F7FA",
  border: "FFD7DDE5",
  text: "FF18222C",
  white: "FFFFFFFF",
};

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
      notes: compact([
        "Major Project simple builder row.",
        row.specSheetLabel ? `Spec ref: ${row.specSheetLabel}` : "",
        row.specSheetLocation ? `Spec location: ${row.specSheetLocation}` : "",
      ]).join(" | "),
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
      return compact([
        `${line.label}: revenue ${revenue.toFixed(2)}, cost ${cost.toFixed(2)}, GP ${gp.toFixed(2)}.`,
        line.resolvedSpecSheetLabel ? `Spec ref: ${line.resolvedSpecSheetLabel}.` : "",
        line.resolvedSpecSheetLocation ? `Spec location: ${line.resolvedSpecSheetLocation}.` : "",
      ]).join(" ");
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
    fileNameBase: `${fileSafeName(quote.metadata.proposalNumber)}-approval-workbook`,
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

function buildLineTotals(lines: ApprovalWorkbookLine[]) {
  const revenue = roundCurrency(lines.reduce((sum, line) => sum + line.customerPricing, 0));
  const cost = roundCurrency(lines.reduce((sum, line) => sum + line.ourCost, 0));
  const grossProfit = roundCurrency(lines.reduce((sum, line) => sum + line.grossProfit, 0));
  return {
    revenue,
    cost,
    grossProfit,
    grossMarginPercent: safePercent(grossProfit, revenue),
  };
}

function eachCell(
  worksheet: Worksheet,
  fromRow: number,
  toRow: number,
  fromCol: number,
  toCol: number,
  cb: (cell: import("exceljs").Cell, row: number, col: number) => void,
) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = fromCol; col <= toCol; col += 1) {
      cb(worksheet.getCell(row, col), row, col);
    }
  }
}

function applyOuterBorder(worksheet: Worksheet, fromRow: number, toRow: number, fromCol: number, toCol: number, color = BRAND.border) {
  eachCell(worksheet, fromRow, toRow, fromCol, toCol, (cell, row, col) => {
    cell.border = {
      top: row === fromRow ? { style: "thin", color: { argb: color } } : cell.border?.top,
      left: col === fromCol ? { style: "thin", color: { argb: color } } : cell.border?.left,
      bottom: row === toRow ? { style: "thin", color: { argb: color } } : cell.border?.bottom,
      right: col === toCol ? { style: "thin", color: { argb: color } } : cell.border?.right,
    };
  });
}

function applySectionBand(worksheet: Worksheet, row: number, fromCol: number, toCol: number, label: string, color = BRAND.green) {
  worksheet.mergeCells(row, fromCol, row, toCol);
  const cell = worksheet.getCell(row, fromCol);
  cell.value = label;
  cell.font = { name: "Arial", bold: true, size: 11, color: { argb: BRAND.white } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  worksheet.getRow(row).height = 21;
  applyOuterBorder(worksheet, row, row, fromCol, toCol, color);
}

function styleLabelValueRow(worksheet: Worksheet, row: number, labelCol: number, valueCol: number, label: string, value: CellValue, valueToCol = valueCol) {
  const labelCell = worksheet.getCell(row, labelCol);
  labelCell.value = label;
  labelCell.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.slate } };
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenSoft } };
  labelCell.alignment = { vertical: "middle", horizontal: "left" };
  labelCell.border = {
    top: { style: "thin", color: { argb: BRAND.border } },
    left: { style: "thin", color: { argb: BRAND.border } },
    bottom: { style: "thin", color: { argb: BRAND.border } },
    right: { style: "thin", color: { argb: BRAND.border } },
  };

  if (valueToCol > valueCol) {
    worksheet.mergeCells(row, valueCol, row, valueToCol);
  }

  const valueCell = worksheet.getCell(row, valueCol);
  valueCell.value = value;
  valueCell.font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
  valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.white } };
  valueCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  applyOuterBorder(worksheet, row, row, valueCol, valueToCol, BRAND.border);
}

function styleMoneyCell(cell: import("exceljs").Cell, value: number) {
  cell.value = value;
  cell.numFmt = '"$"#,##0.00';
  cell.alignment = { vertical: "middle", horizontal: "right" };
}

function stylePercentCell(cell: import("exceljs").Cell, value: number) {
  cell.value = value;
  cell.numFmt = "0.0%";
  cell.alignment = { vertical: "middle", horizontal: "right" };
}

function applyTableHeader(worksheet: Worksheet, row: number, labels: string[]) {
  labels.forEach((label, index) => {
    const cell = worksheet.getCell(row, index + 1);
    cell.value = label;
    cell.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.greenDark } },
      left: { style: "thin", color: { argb: BRAND.greenDark } },
      bottom: { style: "thin", color: { argb: BRAND.greenDark } },
      right: { style: "thin", color: { argb: BRAND.greenDark } },
    };
  });
  worksheet.getRow(row).height = 28;
}

function applyBodyCellStyle(cell: import("exceljs").Cell, fill: string) {
  cell.font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: BRAND.border } },
    left: { style: "thin", color: { argb: BRAND.border } },
    bottom: { style: "thin", color: { argb: BRAND.border } },
    right: { style: "thin", color: { argb: BRAND.border } },
  };
}

function applyMetricCard(worksheet: Worksheet, row: number, fromCol: number, toCol: number, label: string, value: string, accent: string) {
  worksheet.mergeCells(row, fromCol, row, toCol);
  worksheet.mergeCells(row + 1, fromCol, row + 1, toCol);

  const titleCell = worksheet.getCell(row, fromCol);
  titleCell.value = label;
  titleCell.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };

  const valueCell = worksheet.getCell(row + 1, fromCol);
  valueCell.value = value;
  valueCell.font = { name: "Arial", bold: true, size: 14, color: { argb: BRAND.text } };
  valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.cream } };
  valueCell.alignment = { vertical: "middle", horizontal: "center" };

  applyOuterBorder(worksheet, row, row + 1, fromCol, toCol);
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(percentAsWhole: number) {
  return `${percentAsWhole.toFixed(1)}%`;
}

async function loadImageAsBase64(path: string) {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadImageDimensions(path: string) {
  try {
    return await new Promise<{ width: number; height: number } | null>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error(`Unable to load image dimensions for ${path}`));
      image.src = path;
    });
  } catch {
    return null;
  }
}

async function addWorkbookImage(
  workbook: Workbook,
  worksheet: Worksheet,
  assetPath: string,
  extension: "png" | "jpeg",
  range:
    | { tl: { col: number; row: number }; br: { col: number; row: number } }
    | { tl: { col: number; row: number }; ext: { width: number; height: number } },
) {
  const base64 = await loadImageAsBase64(assetPath);
  if (!base64) return false;
  const imageId = workbook.addImage({
    base64,
    extension,
  });
  worksheet.addImage(imageId, range as unknown as Parameters<Worksheet["addImage"]>[1]);
  return true;
}

async function addWorkbookImageByWidth(
  workbook: Workbook,
  worksheet: Worksheet,
  assetPath: string,
  extension: "png" | "jpeg",
  tl: { col: number; row: number },
  widthPx: number,
) {
  const dimensions = await loadImageDimensions(assetPath);
  if (!dimensions) return false;
  const heightPx = Math.round(widthPx * (dimensions.height / dimensions.width));
  return addWorkbookImage(workbook, worksheet, assetPath, extension, {
    tl,
    ext: { width: widthPx, height: heightPx },
  });
}

function buildExecutiveSummarySheet(exceljs: ExcelJSModule, workbook: Workbook, model: ApprovalWorkbookModel) {
  const sheet = workbook.addWorksheet("Executive Summary", {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 8 }],
  });

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
  };

  sheet.columns = [
    { width: 5 },
    { width: 18 },
    { width: 19 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
  ];

  sheet.mergeCells("B1:I1");
  sheet.getCell("B1").value = "INTERNAL APPROVAL WORKBOOK";
  sheet.getCell("B1").font = { name: "Arial", bold: true, size: 18, color: { argb: BRAND.white } };
  sheet.getCell("B1").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getCell("B1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
  sheet.getRow(1).height = 26;

  sheet.mergeCells("D2:I3");
  const titleCell = sheet.getCell("D2");
  titleCell.value = "iNet Executive Approval Summary";
  titleCell.font = { name: "Arial", bold: true, size: 22, color: { argb: BRAND.greenDark } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.cream } };
  applyOuterBorder(sheet, 2, 3, 4, 9);

  sheet.mergeCells("B2:C4");
  sheet.getCell("B2").value = "";
  sheet.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenPale } };
  applyOuterBorder(sheet, 2, 4, 2, 3);

  sheet.mergeCells("D4:I4");
  const subtitleCell = sheet.getCell("D4");
  subtitleCell.value = "Internal management review copy aligned to iNet proposal branding, pricing, approvals, and release readiness.";
  subtitleCell.font = { name: "Arial", size: 10, color: { argb: BRAND.slate } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left" };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.cream } };
  applyOuterBorder(sheet, 4, 4, 4, 9);

  sheet.mergeCells("B5:E5");
  sheet.getCell("B5").value = "INTERNAL ONLY  |  EXECUTIVE REVIEW  |  APPROVAL-READY";
  sheet.getCell("B5").font = { name: "Arial", bold: true, size: 9, color: { argb: BRAND.white } };
  sheet.getCell("B5").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getCell("B5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.green } };
  applyOuterBorder(sheet, 5, 5, 2, 5, BRAND.green);

  sheet.mergeCells("F5:I5");
  sheet.getCell("F5").value = `Status: ${model.statusLabel}  |  Workflow: ${model.workflowLabel}`;
  sheet.getCell("F5").font = { name: "Arial", bold: true, size: 9, color: { argb: BRAND.text } };
  sheet.getCell("F5").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getCell("F5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.gold } };
  applyOuterBorder(sheet, 5, 5, 6, 9, BRAND.gold);
  sheet.getRow(5).height = 20;

  applyMetricCard(sheet, 6, 2, 3, "Recurring Revenue", formatMoney(model.recurringRevenue), BRAND.green);
  applyMetricCard(sheet, 6, 4, 5, "One-time Revenue", formatMoney(model.oneTimeRevenue), BRAND.slate);
  applyMetricCard(sheet, 6, 6, 7, "Total Gross Profit", formatMoney(model.totalGrossProfit), BRAND.greenDark);
  applyMetricCard(sheet, 6, 8, 9, "Gross Margin", formatPercent(model.totalGrossMarginPercent), BRAND.gold);

  applySectionBand(sheet, 9, 2, 9, "Proposal Overview");
  styleLabelValueRow(sheet, 10, 2, 3, "Proposal Number", model.proposalNumber);
  styleLabelValueRow(sheet, 10, 5, 6, "Proposal Date", model.quoteDate);
  styleLabelValueRow(sheet, 10, 8, 9, "Prepared By", model.preparedBy);
  styleLabelValueRow(sheet, 11, 2, 3, "Customer", model.customerName);
  styleLabelValueRow(sheet, 11, 5, 6, "Workflow", model.workflowLabel);
  styleLabelValueRow(sheet, 11, 8, 9, "Option", model.optionLabel);
  styleLabelValueRow(sheet, 12, 2, 5, "Project Name", model.projectName, 5);
  styleLabelValueRow(sheet, 12, 6, 7, "Status", model.statusLabel);
  styleLabelValueRow(sheet, 12, 8, 9, "Workbook", "Approval XLSX v4");

  applySectionBand(sheet, 14, 2, 9, "Executive Summary");
  sheet.mergeCells("B15:F18");
  const summaryCell = sheet.getCell("B15");
  summaryCell.value = model.projectDescription || "No project description provided.";
  summaryCell.font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
  summaryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenPale } };
  summaryCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyOuterBorder(sheet, 15, 18, 2, 6);

  sheet.mergeCells("G15:I15");
  const checkpointHeader = sheet.getCell("G15");
  checkpointHeader.value = "Management checkpoints";
  checkpointHeader.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.white } };
  checkpointHeader.alignment = { vertical: "middle", horizontal: "center" };
  checkpointHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.green } };
  applyOuterBorder(sheet, 15, 15, 7, 9, BRAND.green);

  sheet.mergeCells("G16:I18");
  const checkpointCell = sheet.getCell("G16");
  checkpointCell.value = [
    `Total margin: ${formatPercent(model.totalGrossMarginPercent)}`,
    "Approval packet includes financials, routing, and support notes.",
    "Use detail and notes tabs before customer-facing release.",
  ].join("\n");
  checkpointCell.font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
  checkpointCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.slateSoft } };
  checkpointCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyOuterBorder(sheet, 16, 18, 7, 9);
  [15, 16, 17, 18].forEach((rowNumber) => {
    sheet.getRow(rowNumber).height = rowNumber === 15 ? 20 : 22;
  });

  applySectionBand(sheet, 20, 2, 9, "Financial Snapshot");
  applyTableHeader(sheet, 21, ["Bucket", "Customer Price", "Our Cost", "Gross Profit", "Gross Margin", "Commercial View", "Management Note", "", ""]);
  sheet.mergeCells("G21:H21");
  sheet.mergeCells("I21:I21");

  const metricRows = [
    ["Recurring", model.recurringRevenue, model.recurringCost, model.recurringGrossProfit, model.recurringGrossMarginPercent / 100, "Monthly / recurring program value", "Review durability of services margin."],
    ["One-time", model.oneTimeRevenue, model.oneTimeCost, model.oneTimeGrossProfit, model.oneTimeGrossMarginPercent / 100, "Hardware, install, and services", "Confirm deployment recovery and exceptions."],
    ["Total Deal", model.totalRevenue, model.totalCost, model.totalGrossProfit, model.totalGrossMarginPercent / 100, "Overall customer commitment", "Use as the primary executive checkpoint."],
  ] as const;

  metricRows.forEach((entry, index) => {
    const rowNumber = 22 + index;
    const fill = index % 2 === 0 ? BRAND.white : BRAND.greenPale;
    const row = sheet.getRow(rowNumber);
    row.height = 22;
    applyBodyCellStyle(sheet.getCell(rowNumber, 2), fill);
    sheet.getCell(rowNumber, 2).value = entry[0];
    [3, 4, 5].forEach((col, metricIndex) => {
      const cell = sheet.getCell(rowNumber, col);
      applyBodyCellStyle(cell, fill);
      styleMoneyCell(cell, entry[metricIndex + 1] as number);
    });
    const percentCell = sheet.getCell(rowNumber, 6);
    applyBodyCellStyle(percentCell, fill);
    stylePercentCell(percentCell, entry[4]);
    const viewCell = sheet.getCell(rowNumber, 7);
    const noteCell = sheet.getCell(rowNumber, 8);
    applyBodyCellStyle(viewCell, fill);
    applyBodyCellStyle(noteCell, fill);
    viewCell.value = entry[5];
    noteCell.value = entry[6];
    sheet.mergeCells(rowNumber, 8, rowNumber, 9);
    applyOuterBorder(sheet, rowNumber, rowNumber, 8, 9);
  });

  applySectionBand(sheet, 26, 2, 9, "Approval Routing / Signatures");
  sheet.mergeCells("B27:I27");
  sheet.getCell("B27").value = "Document approvals, release comments, and signatures here before this quote moves into any customer-facing workflow.";
  sheet.getCell("B27").font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
  sheet.getCell("B27").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getCell("B27").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.slateSoft } };
  applyOuterBorder(sheet, 27, 27, 2, 9);
  sheet.getRow(27).height = 24;

  applyTableHeader(sheet, 28, ["Role", "Approver", "Approval Decision", "Signature", "", "Date", "", "Comments", ""]);
  sheet.mergeCells("E28:F28");
  sheet.mergeCells("H28:I28");

  [
    "CEO",
    "CFO",
    "Region GM / Area GM",
    "VP Operations / VP Engineering",
    "SVP / VP Sales",
  ].forEach((role, index) => {
    const rowNumber = 29 + index;
    const fill = index % 2 === 0 ? BRAND.cream : BRAND.white;
    for (let col = 1; col <= 9; col += 1) {
      applyBodyCellStyle(sheet.getCell(rowNumber, col), fill);
    }
    sheet.getCell(rowNumber, 1).value = role;
    sheet.getCell(rowNumber, 2).value = "";
    sheet.getCell(rowNumber, 3).value = "Approve / Revise / Hold";
    sheet.getCell(rowNumber, 4).value = " ";
    sheet.mergeCells(rowNumber, 4, rowNumber, 5);
    sheet.getCell(rowNumber, 6).value = " ";
    sheet.mergeCells(rowNumber, 6, rowNumber, 7);
    sheet.mergeCells(rowNumber, 8, rowNumber, 9);
    sheet.getCell(rowNumber, 8).value = "";
    sheet.getRow(rowNumber).height = 26;
    applyOuterBorder(sheet, rowNumber, rowNumber, 4, 5);
    applyOuterBorder(sheet, rowNumber, rowNumber, 6, 7);
    applyOuterBorder(sheet, rowNumber, rowNumber, 8, 9);
    sheet.getCell(rowNumber, 4).border = {
      bottom: { style: "thin", color: { argb: BRAND.slate } },
      left: { style: "thin", color: { argb: BRAND.border } },
      top: { style: "thin", color: { argb: BRAND.border } },
      right: { style: "thin", color: { argb: BRAND.border } },
    };
    sheet.getCell(rowNumber, 6).border = {
      bottom: { style: "thin", color: { argb: BRAND.slate } },
      left: { style: "thin", color: { argb: BRAND.border } },
      top: { style: "thin", color: { argb: BRAND.border } },
      right: { style: "thin", color: { argb: BRAND.border } },
    };
  });

  applySectionBand(sheet, 35, 2, 9, "Release Readiness Notes");
  sheet.mergeCells("B36:I38");
  const noteCell = sheet.getCell("B36");
  noteCell.value = [
    "Use the Line Item Detail tab for pricing support and the Assumptions & Notes tab for vendor, SLA, and internal review narrative.",
    "Keep signatures, comments, and management decisions on this summary page so the workbook reads like a complete approval packet.",
    "This workbook remains internal-only and should be reviewed before any customer-facing release.",
  ].join("\n");
  noteCell.font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
  noteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.slateSoft } };
  noteCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyOuterBorder(sheet, 36, 38, 2, 9);
  sheet.getRow(36).height = 22;
  sheet.getRow(37).height = 22;
  sheet.getRow(38).height = 22;

  void exceljs;
  return sheet;
}

function buildLineItemDetailSheet(workbook: Workbook, model: ApprovalWorkbookModel) {
  const sheet = workbook.addWorksheet("Line Item Detail", {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 8 }],
  });

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  sheet.columns = [
    { width: 22 },
    { width: 34 },
    { width: 18 },
    { width: 11 },
    { width: 8 },
    { width: 8 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 12 },
    { width: 34 },
  ];

  sheet.mergeCells("A1:K1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "iNet Pricing Support";
  titleCell.font = { name: "Arial", bold: true, size: 18, color: { argb: BRAND.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
  sheet.getRow(1).height = 26;

  sheet.mergeCells("A2:K2");
  const subCell = sheet.getCell("A2");
  subCell.value = `${model.customerName} | ${model.projectName} | ${model.proposalNumber}`;
  subCell.font = { name: "Arial", size: 10, color: { argb: BRAND.slate } };
  subCell.alignment = { vertical: "middle", horizontal: "center" };

  sheet.mergeCells("A3:K3");
  sheet.getCell("A3").value = "Internal pricing backup for approval review, margin defense, and iNet release readiness.";
  sheet.getCell("A3").font = { name: "Arial", bold: true, size: 9, color: { argb: BRAND.text } };
  sheet.getCell("A3").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.gold } };
  applyOuterBorder(sheet, 3, 3, 1, 11, BRAND.gold);

  applyMetricCard(sheet, 4, 1, 2, "Recurring", formatMoney(model.recurringRevenue), BRAND.green);
  applyMetricCard(sheet, 4, 3, 4, "One-time", formatMoney(model.oneTimeRevenue), BRAND.slate);
  applyMetricCard(sheet, 4, 5, 6, "Total Revenue", formatMoney(model.totalRevenue), BRAND.greenDark);
  applyMetricCard(sheet, 4, 7, 8, "Total Cost", formatMoney(model.totalCost), BRAND.gold);
  applyMetricCard(sheet, 4, 9, 11, "Gross Margin", formatPercent(model.totalGrossMarginPercent), BRAND.green);

  sheet.mergeCells("A7:K7");
  sheet.getCell("A7").value = "Review recurring and one-time line items below. Use notes to explain allocation logic, vendor context, or pass-through treatment.";
  sheet.getCell("A7").font = { name: "Arial", size: 9, color: { argb: BRAND.text } };
  sheet.getCell("A7").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getCell("A7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.slateSoft } };
  applyOuterBorder(sheet, 7, 7, 1, 11);

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

  const recurringLines = model.lines.filter((line) => line.schedule === "Recurring");
  const oneTimeLines = model.lines.filter((line) => line.schedule !== "Recurring");
  const recurringTotals = buildLineTotals(recurringLines);
  const oneTimeTotals = buildLineTotals(oneTimeLines);

  let currentRow = 8;
  applySectionBand(sheet, currentRow, 1, 11, "Recurring Line Items");
  currentRow += 1;
  applyTableHeader(sheet, currentRow, headers);
  currentRow += 1;

  const writeLineRows = (lines: ApprovalWorkbookLine[]) => {
    const source = lines.length > 0 ? lines : [{
      item: "No items.",
      description: "",
      category: "",
      schedule: "",
      quantity: "",
      unit: "",
      customerPricing: 0,
      ourCost: 0,
      grossProfit: 0,
      grossMarginPercent: 0,
      notes: "",
    }];

    source.forEach((line, index) => {
      const fill = index % 2 === 0 ? BRAND.white : BRAND.greenPale;
      const row = sheet.getRow(currentRow);
      row.height = 20;
      const values: CellValue[] = [
        line.item,
        line.description,
        line.category,
        line.schedule,
        line.quantity === "" ? "" : line.quantity,
        line.unit,
        line.customerPricing,
        line.ourCost,
        line.grossProfit,
        line.grossMarginPercent / 100,
        line.notes,
      ];

      values.forEach((value, colIndex) => {
        const cell = sheet.getCell(currentRow, colIndex + 1);
        applyBodyCellStyle(cell, fill);
        cell.value = value;
      });

      [7, 8, 9].forEach((col) => {
        sheet.getCell(currentRow, col).numFmt = '"$"#,##0.00';
        sheet.getCell(currentRow, col).alignment = { vertical: "top", horizontal: "right" };
      });
      sheet.getCell(currentRow, 10).numFmt = "0.0%";
      sheet.getCell(currentRow, 10).alignment = { vertical: "top", horizontal: "right" };

      currentRow += 1;
    });
  };

  writeLineRows(recurringLines);

  sheet.mergeCells(currentRow, 1, currentRow, 6);
  const recurringSubtotalLabel = sheet.getCell(currentRow, 1);
  recurringSubtotalLabel.value = "Recurring Subtotal";
  recurringSubtotalLabel.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.text } };
  recurringSubtotalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.cream } };
  recurringSubtotalLabel.alignment = { vertical: "middle", horizontal: "left" };
  applyOuterBorder(sheet, currentRow, currentRow, 1, 6);

  [7, 8, 9, 10].forEach((col, index) => {
    const cell = sheet.getCell(currentRow, col);
    applyBodyCellStyle(cell, BRAND.cream);
    cell.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.text } };
    if (col === 10) {
      stylePercentCell(cell, recurringTotals.grossMarginPercent);
    } else {
      styleMoneyCell(cell, [recurringTotals.revenue, recurringTotals.cost, recurringTotals.grossProfit][index]);
    }
  });
  applyBodyCellStyle(sheet.getCell(currentRow, 11), BRAND.cream);
  currentRow += 2;

  applySectionBand(sheet, currentRow, 1, 11, "One-time Line Items");
  currentRow += 1;
  applyTableHeader(sheet, currentRow, headers);
  currentRow += 1;
  writeLineRows(oneTimeLines);

  sheet.mergeCells(currentRow, 1, currentRow, 6);
  const oneTimeSubtotalLabel = sheet.getCell(currentRow, 1);
  oneTimeSubtotalLabel.value = "One-time Subtotal";
  oneTimeSubtotalLabel.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.text } };
  oneTimeSubtotalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.cream } };
  oneTimeSubtotalLabel.alignment = { vertical: "middle", horizontal: "left" };
  applyOuterBorder(sheet, currentRow, currentRow, 1, 6);

  [7, 8, 9, 10].forEach((col, index) => {
    const cell = sheet.getCell(currentRow, col);
    applyBodyCellStyle(cell, BRAND.cream);
    cell.font = { name: "Arial", bold: true, size: 10, color: { argb: BRAND.text } };
    if (col === 10) {
      stylePercentCell(cell, oneTimeTotals.grossMarginPercent);
    } else {
      styleMoneyCell(cell, [oneTimeTotals.revenue, oneTimeTotals.cost, oneTimeTotals.grossProfit][index]);
    }
  });
  applyBodyCellStyle(sheet.getCell(currentRow, 11), BRAND.cream);
  currentRow += 2;

  sheet.mergeCells(currentRow, 1, currentRow, 6);
  const totalLabel = sheet.getCell(currentRow, 1);
  totalLabel.value = "TOTAL DEAL";
  totalLabel.font = { name: "Arial", bold: true, size: 11, color: { argb: BRAND.white } };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
  totalLabel.alignment = { vertical: "middle", horizontal: "left" };
  applyOuterBorder(sheet, currentRow, currentRow, 1, 6, BRAND.greenDark);

  [7, 8, 9].forEach((col, index) => {
    const cell = sheet.getCell(currentRow, col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
    cell.font = { name: "Arial", bold: true, size: 11, color: { argb: BRAND.white } };
    styleMoneyCell(cell, [model.totalRevenue, model.totalCost, model.totalGrossProfit][index]);
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.greenDark } },
      left: { style: "thin", color: { argb: BRAND.greenDark } },
      bottom: { style: "thin", color: { argb: BRAND.greenDark } },
      right: { style: "thin", color: { argb: BRAND.greenDark } },
    };
  });
  const totalPercent = sheet.getCell(currentRow, 10);
  totalPercent.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
  totalPercent.font = { name: "Arial", bold: true, size: 11, color: { argb: BRAND.white } };
  stylePercentCell(totalPercent, model.totalGrossMarginPercent / 100);
  totalPercent.border = {
    top: { style: "thin", color: { argb: BRAND.greenDark } },
    left: { style: "thin", color: { argb: BRAND.greenDark } },
    bottom: { style: "thin", color: { argb: BRAND.greenDark } },
    right: { style: "thin", color: { argb: BRAND.greenDark } },
  };
  const totalNotes = sheet.getCell(currentRow, 11);
  totalNotes.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
  totalNotes.border = {
    top: { style: "thin", color: { argb: BRAND.greenDark } },
    left: { style: "thin", color: { argb: BRAND.greenDark } },
    bottom: { style: "thin", color: { argb: BRAND.greenDark } },
    right: { style: "thin", color: { argb: BRAND.greenDark } },
  };

  return sheet;
}

function buildSectionRows(title: string, entries: string[]) {
  const rows: Array<Array<string>> = [[title], ...(
    entries.length > 0
      ? entries.map((entry, index) => [`${index + 1}. ${entry}`])
      : [["No notes recorded."]]
  )];
  return rows;
}

function buildNotesSheet(workbook: Workbook, model: ApprovalWorkbookModel) {
  const sheet = workbook.addWorksheet("Assumptions & Notes", {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 5 }],
  });

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
  };

  sheet.columns = [
    { width: 4 },
    { width: 102 },
  ];

  sheet.mergeCells("A1:B1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "iNet Assumptions, Notes, and Review Support";
  titleCell.font = { name: "Arial", bold: true, size: 18, color: { argb: BRAND.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.greenDark } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 26;

  sheet.mergeCells("A2:B2");
  const introCell = sheet.getCell("A2");
  introCell.value = "Narrative backup for pricing assumptions, vendor sourcing, service dependencies, and internal-only approval context.";
  introCell.font = { name: "Arial", size: 10, color: { argb: BRAND.slate } };
  introCell.alignment = { vertical: "middle", horizontal: "left" };

  sheet.mergeCells("A3:B3");
  sheet.getCell("A3").value = "Use this tab to document why the deal is priced this way and what leadership should know before release.";
  sheet.getCell("A3").font = { name: "Arial", bold: true, size: 9, color: { argb: BRAND.text } };
  sheet.getCell("A3").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.gold } };
  applyOuterBorder(sheet, 3, 3, 1, 2, BRAND.gold);

  applySectionBand(sheet, 4, 1, 2, "Review Guide");
  sheet.mergeCells("A5:B6");
  const guideCell = sheet.getCell("A5");
  guideCell.value = "Use commercial assumptions for pricing context, vendor notes for sourcing support, service references for SLA dependencies, and internal notes for approval-only context.";
  guideCell.font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
  guideCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.slateSoft } };
  guideCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyOuterBorder(sheet, 5, 6, 1, 2);

  let currentRow = 8;
  [
    buildSectionRows("Commercial assumptions", model.assumptions),
    buildSectionRows("Vendor notes", model.vendorNotes),
    buildSectionRows("SLA / service references", model.serviceReferences),
    buildSectionRows("Internal notes", model.internalNotes),
  ].forEach((sectionRows) => {
    applySectionBand(sheet, currentRow, 1, 2, sectionRows[0][0], BRAND.green);
    currentRow += 1;

    sectionRows.slice(1).forEach((entry, index) => {
      sheet.mergeCells(currentRow, 1, currentRow, 2);
      const cell = sheet.getCell(currentRow, 1);
      cell.value = entry[0];
      cell.font = { name: "Arial", size: 10, color: { argb: BRAND.text } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? BRAND.white : BRAND.greenPale } };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      applyOuterBorder(sheet, currentRow, currentRow, 1, 2);
      sheet.getRow(currentRow).height = 28;
      currentRow += 1;
    });

    currentRow += 1;
  });

  return sheet;
}

export async function buildProposalApprovalWorkbook(quote: QuoteRecord) {
  const model = buildWorkbookModel(quote);
  const exceljs = await import("exceljs");
  const workbook = new exceljs.Workbook();

  workbook.creator = "RapidQuote";
  workbook.company = "iNet Managed Technology Services";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "Internal Approval Workbook";
  workbook.title = `${model.proposalNumber} iNet Approval Workbook`;
  workbook.calcProperties.fullCalcOnLoad = true;

  const summarySheet = buildExecutiveSummarySheet(exceljs, workbook, model);
  const detailSheet = buildLineItemDetailSheet(workbook, model);
  const notesSheet = buildNotesSheet(workbook, model);

  const summaryLogoEmbedded = await addWorkbookImageByWidth(
    workbook,
    summarySheet,
    "/inet-logo.png",
    "png",
    { col: 1.35, row: 1.15 },
    120,
  );

  if (summaryLogoEmbedded) {
    await addWorkbookImageByWidth(workbook, detailSheet, "/inet-logo.png", "png", {
      col: 8.9,
      row: 0.3,
    }, 108);
    await addWorkbookImageByWidth(workbook, notesSheet, "/inet-logo.png", "png", {
      col: 0.08,
      row: 0.2,
    }, 72);
  }

  await addWorkbookImage(workbook, summarySheet, "/proposal-footer-hex.jpg", "jpeg", {
    tl: { col: 7.1, row: 35.1 },
    br: { col: 9.2, row: 38.5 },
  });
  await addWorkbookImage(workbook, detailSheet, "/proposal-footer-hex.jpg", "jpeg", {
    tl: { col: 8.1, row: 35.2 },
    br: { col: 11, row: 39.2 },
  });
  await addWorkbookImage(workbook, notesSheet, "/proposal-footer-hex.jpg", "jpeg", {
    tl: { col: 0.8, row: 29.5 },
    br: { col: 2, row: 33.5 },
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    blob: new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: `${model.fileNameBase}.xlsx`,
  };
}

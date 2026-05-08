import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import type { MajorProjectCustomerQuoteLineMetrics } from "@/app/lib/major-project";
import { buildMajorProjectMetrics } from "@/app/lib/major-project";
import type {
  MajorProjectComponent,
  MajorProjectSimpleRow,
  QuoteRecord,
} from "@/app/lib/quote-record";
import * as XLSX from "xlsx";

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

function createWorksheet(rows: Array<Array<string | number | null | undefined>>) {
  return XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((cell) => cell ?? "")));
}

function setColumnWidths(worksheet: XLSX.WorkSheet, widths: number[]) {
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
}

function addMerges(worksheet: XLSX.WorkSheet, merges: string[]) {
  worksheet["!merges"] = merges.map((value) => XLSX.utils.decode_range(value));
}

function buildExecutiveSummarySheet(model: ApprovalWorkbookModel) {
  const rows: Array<Array<string | number | null>> = [
    [null, "RapidQuote Internal Approval Workbook"],
    [null, "Executive Summary / Approval"],
    [],
    [null, "Date", model.quoteDate],
    [null, "Customer", model.customerName],
    [null, "Proposal Number", model.proposalNumber],
    [null, "Project Name", model.projectName],
    [null, "Prepared By", model.preparedBy],
    [null, "Workflow", `${model.workflowLabel} | ${model.optionLabel} | ${model.statusLabel}`],
    [null, "Project Description", model.projectDescription || "No project description provided."],
    [],
    [null, "Financial Summary"],
    [null, "Bucket", "Customer Price", "Our Cost", "Gross Profit", "Gross Margin"],
    [null, "Recurring", model.recurringRevenue, model.recurringCost, model.recurringGrossProfit, model.recurringGrossMarginPercent / 100],
    [null, "One-time", model.oneTimeRevenue, model.oneTimeCost, model.oneTimeGrossProfit, model.oneTimeGrossMarginPercent / 100],
    [null, "Total", model.totalRevenue, model.totalCost, model.totalGrossProfit, model.totalGrossMarginPercent / 100],
    [],
    [null, "Approval Signatures"],
    [null, "CEO:", "", "", "", "", "Date:", ""],
    [null, "CFO:", "", "", "", "", "Date:", ""],
    [null, "Region GM and/or Area GM:", "", "", "", "", "Date:", ""],
    [null, "VP Operations and/or VP Engineering:", "", "", "", "", "Date:", ""],
    [null, "SVP and/or VP Sales:", "", "", "", "", "Date:", ""],
  ];

  const sheet = createWorksheet(rows);
  setColumnWidths(sheet, [4, 28, 22, 16, 16, 16, 14, 16]);
  addMerges(sheet, [
    "B1:H1",
    "B2:H2",
    "C4:H4",
    "C5:H5",
    "C6:H6",
    "C7:H7",
    "C8:H8",
    "C9:H9",
    "C10:H10",
    "B12:H12",
    "B18:H18",
    "C19:F19",
    "C20:F20",
    "C21:F21",
    "C22:F22",
    "C23:F23",
  ]);
  return sheet;
}

function buildLineItemDetailSheet(model: ApprovalWorkbookModel) {
  const rows: Array<Array<string | number>> = [
    ["Line Item Detail"],
    [],
    [
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
    ],
    ...model.lines.map((line) => [
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
    ]),
    ["Totals", "", "", "", "", "", model.totalRevenue, model.totalCost, model.totalGrossProfit, model.totalGrossMarginPercent / 100, ""],
  ];

  const sheet = createWorksheet(rows);
  setColumnWidths(sheet, [26, 42, 20, 12, 10, 10, 16, 16, 16, 14, 42]);
  sheet["!autofilter"] = { ref: `A3:K${rows.length}` };
  sheet["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" } as never;
  return sheet;
}

function buildSectionRows(title: string, entries: string[]) {
  const rows: Array<Array<string>> = [[title]];
  if (entries.length === 0) {
    rows.push(["No notes recorded."]);
  } else {
    entries.forEach((entry) => rows.push([entry]));
  }
  rows.push([]);
  return rows;
}

function buildNotesSheet(model: ApprovalWorkbookModel) {
  const rows: Array<Array<string>> = [
    ["Assumptions / Notes"],
    [],
    ...buildSectionRows("Commercial assumptions", model.assumptions),
    ...buildSectionRows("Vendor notes", model.vendorNotes),
    ...buildSectionRows("SLA / service references", model.serviceReferences),
    ...buildSectionRows("Internal notes", model.internalNotes),
  ];

  const sheet = createWorksheet(rows);
  setColumnWidths(sheet, [110]);
  return sheet;
}

export async function buildProposalApprovalWorkbook(quote: QuoteRecord) {
  const model = buildWorkbookModel(quote);
  const workbook = XLSX.utils.book_new();

  const summarySheet = buildExecutiveSummarySheet(model);
  const detailSheet = buildLineItemDetailSheet(model);
  const notesSheet = buildNotesSheet(model);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Executive Summary");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Line Item Detail");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Assumptions & Notes");

  const array = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  });

  return {
    blob: new Blob([array], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: `${model.fileNameBase}.xlsx`,
  };
}

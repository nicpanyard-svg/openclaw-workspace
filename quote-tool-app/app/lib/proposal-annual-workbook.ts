import type { QuoteRecord } from "./quote-record";
import { getAnnualSubscriptionSummary } from "./quote-line-billing";
import { getCustomerFacingOneTimeTotal, getIncludedEquipmentRows, getIncludedSectionARows, getIncludedServiceRows, getLeasePricingSummary, getProposalOptionCostSummary, getRecurringMonthlyTotal } from "./proposal-commercial-summary";
import { buildMajorProjectMetrics } from "./major-project";

// A mixed-cadence quote needs a billing ledger, not the legacy MRR/NRR worksheet.
export async function buildAnnualProposalWorkbook(quote: QuoteRecord) {
  const exceljs = await import("exceljs");
  const workbook = new (exceljs.default ?? exceljs).Workbook();
  workbook.creator = "RapidQuote";
  workbook.title = `${quote.metadata.proposalNumber} Billing Approval`;
  const currency = quote.metadata.currencyCode || "USD";
  const moneyFormat = '#,##0.00;[Red](#,##0.00)';
  const annual = getAnnualSubscriptionSummary(quote);
  const options = getProposalOptionCostSummary(quote);
  const lease = getLeasePricingSummary(quote);
  const monthly = lease.isLease ? lease.leaseMonthly : getRecurringMonthlyTotal(quote);
  const oneTime = getCustomerFacingOneTimeTotal(quote);
  const summary = workbook.addWorksheet("Billing Summary");
  summary.columns = [{ width: 48 }, { width: 45 }];
  [
    ["Internal approval / quote snapshot", quote.metadata.proposalNumber],
    ["Customer", quote.customer.name], ["Quote title", quote.metadata.documentTitle], ["Currency", currency],
    ["One-time charges (including quoted tax)", oneTime],
    ["Monthly payment", lease.isLease && !lease.hasActiveDataAgreement ? "Pending data agreement" : monthly],
    ["Year 1 prepaid annual subscriptions", annual.firstYearTotal],
    ["Annual renewals from Year 2", annual.renewalTotal],
    ["One-time + Year 1 prepaid annual charges", oneTime + annual.firstYearTotal],
    ["Optional one-time charges (excluded)", options.oneTimeTotal],
    ["Optional monthly charges (excluded)", options.monthlyTotal],
    ["Optional annual renewals (excluded)", options.annualTotal],
    ["Billing basis", "Monthly and annual amounts are separate payment schedules. Renewal amounts use quoted rates."],
    ["Revision workflow", "Edit pricing and selected options in RapidQuote, then export a new approval workbook."],
  ].forEach((row) => summary.addRow(row));

  const items = workbook.addWorksheet("Included Billing");
  items.columns = [{ width: 46 }, { width: 36 }, { width: 12 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 24 }, { width: 65 }];
  items.addRow(["Item", "Billing", "Qty", "Unit", `Unit rate (${currency})`, `Period total (${currency})`, `Year 1 annual charge (${currency})`, "Description / terms"]);
  getIncludedSectionARows(quote).forEach((row) => items.addRow([row.description, row.rowType === "overage" ? "Usage-based (not fixed monthly)" : "Monthly", row.quantity, row.unitLabel, row.monthlyRate ?? row.unitPrice ?? 0, row.totalMonthlyRate ?? 0, null, row.includedText?.join("\n")]));
  getIncludedEquipmentRows(quote).forEach((row) => items.addRow([row.itemName, lease.isLease ? "Included in lease (pricing basis)" : "One-time", row.quantity, "ea", row.unitPrice, row.totalPrice, null, row.description]));
  getIncludedServiceRows(quote).forEach((row) => items.addRow([row.description, "One-time", row.quantity, row.unitLabel, row.unitPrice, row.totalPrice, null, row.notes]));
  annual.items.forEach((row) => items.addRow([row.label, row.startsYear === 2 ? "Annual renewal from Year 2" : "Annual prepaid", row.quantity, row.unitLabel, row.unitPrice, row.annualAmount, row.firstYearAmount, `${row.startsYear === 2 ? "First year included. " : ""}${row.description || ""}`]));

  const optional = workbook.addWorksheet("Option Costs");
  optional.columns = items.columns.map((column) => ({ width: column.width }));
  optional.addRow(["Option (excluded from base)", "Billing", "Qty", "Unit", `Unit rate (${currency})`, `Period total (${currency})`, "Included in base", "Description / terms"]);
  options.items.forEach((row) => optional.addRow([row.label, row.usageBased ? "Usage-based" : row.cadence === "annual" ? (row.startsYear === 2 ? "Annual renewal from Year 2" : "Annual prepaid") : row.cadence === "monthly" ? "Monthly" : "One-time", row.quantity, row.unitLabel, row.unitPrice, row.amount, "No", row.description]));

  const costs = workbook.addWorksheet("Internal Cost Review");
  costs.columns = [{ width: 46 }, { width: 24 }, { width: 34 }, { width: 20 }, { width: 20 }];
  if (quote.metadata.workflowMode === "major_project" && quote.majorProject?.enabled) {
    costs.addRow(["Component", "Vendor", "Billing", "Unit cost", "Period cost"]);
    const metrics = buildMajorProjectMetrics(quote);
    metrics.components.forEach((row) => costs.addRow([row.internalName, row.vendor, `${row.optional ? "Optional / " : ""}${row.billing?.cadence === "annual" ? (row.billing.startsYear === 2 ? "Annual from Year 2" : "Annual") : row.schedule === "recurring" ? "Monthly" : "One-time"}`, row.vendorUnitCost, row.vendorExtendedCost]));
  } else {
    costs.addRow(["Cost category", "Recorded cost", "Basis"]);
    Object.entries(quote.commercial.costs).forEach(([category, amount]) => costs.addRow([category, amount || "Not entered", category === "annualSubscriptionCost" ? "Year 1 annual subscription cost" : category.startsWith("recurring") ? "Monthly" : "One-time"]));
  }
  workbook.eachSheet((sheet) => {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.eachRow((row, index) => {
      row.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, bold: index === 1, color: { argb: index === 1 ? "FFFFFFFF" : "FF18222C" } };
        cell.alignment = { vertical: "top", wrapText: true };
        if (index === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAE0910" } };
        if (typeof cell.value === "number") cell.numFmt = moneyFormat;
      });
    });
  });
  const bytes = await workbook.xlsx.writeBuffer();
  const name = quote.metadata.proposalNumber.replace(/[^a-z0-9-_]+/gi, "-") || "quote";
  return { blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName: `${name}-approval-workbook.xlsx` };
}

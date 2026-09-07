import { applyMajorProjectToQuote, buildMajorProjectMetrics, ensureMajorProjectState } from "./major-project";
import { getLeasePricingSummary } from "./proposal-commercial-summary";
import { getLineBilling } from "./quote-line-billing";
import type { QuoteLineBilling, QuoteRecord } from "./quote-record";

export type QuoteMasterSelection = { quote: QuoteRecord; optionId: string; splitConnectivity?: boolean };
export type QuoteMasterLine = {
  id: string; label: string; quantity: number; cost: number; price: number;
  cadence: QuoteLineBilling["cadence"]; startsYear: number; optional: boolean;
  installation: boolean; category: string; notes: string; rental?: boolean; usageUnit?: string;
};
export type QuoteMasterColumn = {
  label: string; proposalNumber: string; termMonths: number; siteCount: number;
  lines: QuoteMasterLine[]; oneTime: number; monthly: number; annual: number;
  annualFirstYear: number; modelMonthly: number; notes: string;
};
export type QuoteMasterCell = { sheet: string; address: string; value?: string | number | null; formula?: string };
export const QUOTE_MASTER_TEMPLATE_URL = "/templates/quote-master-2026-08-28.xlsx";
export const QUOTE_MASTER_TEMPLATE_NOTICE = "Summary totals include all selected columns. These are separate scopes and service alternatives, not a combined customer order.";
const saleRows = [...Array.from({ length: 19 }, (_, n) => n + 10), ...Array.from({ length: 12 }, (_, n) => n + 30)];
const installationRows = Array.from({ length: 10 }, (_, n) => n + 43);
const recurringRows = Array.from({ length: 23 }, (_, n) => n + 128);
const saleQtyColumns = ["F", "I", "L", "O", "R"];
const rentalQtyColumns = ["D", "F", "H", "J", "L"];
const pricingColumns = ["E", "F", "G", "H", "I"];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const keyFor = (line: QuoteMasterLine) => JSON.stringify([line.label, line.quantity ? line.cost / line.quantity : 0, line.quantity ? line.price / line.quantity : 0, line.cadence, line.startsYear, line.optional, line.category]);

function category(label: string, installation: boolean, recurring: boolean) {
  if (recurring) return /T-Mobile|cellular/i.test(label) ? "Cellular or Traditional Phone Plan" : /Starlink|terminal.*fee|pooled data/i.test(label) ? "LEO, MEO, GEO Subscription Recurring" : "3rd Party Services";
  if (installation) return "Inst Labor Field Installation";
  if (/Starlink|VSAT/i.test(label)) return "VSAT Equipment";
  if (/gateway|modem|KNOT|SecFlow|switch/i.test(label)) return "Network Equipment";
  if (/camera|sensor|radar|gauge/i.test(label)) return "SCADA Equipment";
  return "Other";
}

function columnFor(selection: QuoteMasterSelection): QuoteMasterColumn {
  const quote = ensureMajorProjectState(structuredClone(selection.quote));
  const option = quote.majorProject.options.find((item) => item.id === selection.optionId);
  if (!option) throw new Error("The selected Major Project option is no longer available.");
  quote.majorProject.activeOptionId = option.id;
  const metrics = buildMajorProjectMetrics(quote);
  const rows = metrics.usingSimpleBuilder ? metrics.simpleRows.map((row) => ({
    id: row.id, label: row.label, quantity: row.quantity, cost: row.ourExtendedCost, price: row.customerExtendedPrice,
    billing: getLineBilling(row, row.bucket === "hardware" || row.bucket === "install" ? "one_time" : "monthly"),
    optional: Boolean(row.optional), installation: row.bucket === "install", hardware: row.bucket === "hardware", notes: row.description || "",
  })) : metrics.components.map((row) => {
    const presenters = metrics.customerQuoteLines.filter((line) => line.resolvedRevenueComponentIds.includes(row.id));
    const onlyOptionalPresenters = presenters.length > 0 && presenters.every((line) => line.optional || line.resolvedBundleIds.some((id) => metrics.bundles.find((bundle) => bundle.id === id)?.optional));
    return {
      id: row.id, label: row.customerFacingLabel || row.internalName, quantity: row.quickQuoteSource?.usageBased ? Math.max(1, row.quantity) : row.quantity,
      cost: row.quickQuoteSource?.usageBased ? row.vendorUnitCost * Math.max(1, row.quantity) : row.vendorExtendedCost,
      price: row.quickQuoteSource?.usageBased ? row.customerUnitPrice * Math.max(1, row.quantity) : row.customerExtendedPrice,
      usageUnit: row.quickQuoteSource?.usageBased ? row.unit || "usage unit" : undefined,
      billing: getLineBilling(row, row.schedule === "recurring" ? "monthly" : "one_time"),
      optional: Boolean(row.optional || onlyOptionalPresenters || row.quickQuoteSource?.usageBased),
      installation: row.lineType === "installation" || row.lineType === "internal_labor", hardware: row.lineType === "hardware", notes: row.notes || "",
    };
  });
  if (!rows.length) throw new Error(`${option.label}: add line items before exporting the Quote Master workbook.`);
  const lines: QuoteMasterLine[] = rows.map((row) => {
    if (![row.quantity, row.cost, row.price].every(Number.isFinite) || row.quantity < 0 || row.cost < 0 || row.price < 0) throw new Error(`${row.label}: quantity, cost, and price must be valid nonnegative numbers.`);
    if (row.quantity === 0 && (row.cost || row.price)) throw new Error(`${row.label}: a priced item needs a quantity greater than zero.`);
    const rental = quote.metadata.quoteType === "lease" && row.hardware && row.billing.cadence === "one_time" && !row.optional;
    const bucket = category(row.label, row.installation, row.billing.cadence !== "one_time");
    return { ...row, rental, cadence: row.billing.cadence, startsYear: row.billing.startsYear || 1, category: rental && bucket === "VSAT Equipment" ? "LEO VSAT Equipment" : bucket };
  });
  const lease = quote.metadata.quoteType === "lease" ? getLeasePricingSummary(applyMajorProjectToQuote(quote)) : undefined;
  if (lease && !lease.hasActiveDataAgreement) throw new Error("Confirm the active data agreement before exporting lease pricing.");
  if (lease?.hardwareMonthly) lines.push({ id: "equipment-lease", label: `Equipment lease - ${lease.termMonths} months`, quantity: 1, cost: 0, price: lease.hardwareMonthly, cadence: "monthly", startsYear: 1, optional: false, installation: false, category: "Other", notes: "Hardware cost is in rental capex, not recurring cost." });
  const termMonths = lease?.termMonths || metrics.termMonths;
  if (lines.some((line) => !line.optional && line.cadence !== "one_time") && (termMonths <= 0 || termMonths > 120)) throw new Error(`${option.label}: enter a contract term from 1 to 120 months for the template's recurring-service and ten-year NPV calculations.`);
  const shortTitles: Record<string, string> = {
    "RCT-1788621320967": "Radar hardware", "RCT-1788628213855": "Camera hardware",
    "RCT-1788644603859": "AI / cloud", "RCT-1788656996974": "Connectivity",
  };
  const label = shortTitles[quote.metadata.proposalNumber] || option.label || quote.majorProject.summary.projectName || quote.metadata.documentTitle;
  return calculateColumn({ label, proposalNumber: quote.metadata.proposalNumber, termMonths, siteCount: metrics.siteCount, lines, notes: quote.majorProject.summary.assumptions || "", oneTime: 0, monthly: 0, annual: 0, annualFirstYear: 0, modelMonthly: 0 });
}

function annualPeriods(line: QuoteMasterLine, term: number) {
  return Math.max(0, Math.ceil(term / 12) - line.startsYear + 1);
}

function calculateColumn(column: QuoteMasterColumn): QuoteMasterColumn {
  const included = column.lines.filter((line) => !line.optional);
  const oneTime = sum(included.filter((line) => line.cadence === "one_time" && !line.rental).map((line) => line.price));
  const monthly = sum(included.filter((line) => line.cadence === "monthly").map((line) => line.price));
  const annual = included.filter((line) => line.cadence === "annual");
  return { ...column, oneTime: round(oneTime), monthly: round(monthly), annual: round(sum(annual.map((line) => line.price))), annualFirstYear: round(sum(annual.filter((line) => line.startsYear === 1).map((line) => line.price))), modelMonthly: monthly + (column.termMonths ? sum(annual.map((line) => line.price * annualPeriods(line, column.termMonths))) / column.termMonths : 0) };
}

export function buildQuoteMasterColumns(selections: QuoteMasterSelection[]): QuoteMasterColumn[] {
  if (!selections.length) throw new Error("Select at least one saved quote or project option.");
  const customers = new Set(selections.map(({ quote }) => quote.customer.name.trim().toLowerCase()));
  if (customers.size !== 1) throw new Error("Choose quotes for the same customer.");
  if (selections.some(({ quote }) => quote.metadata.currencyCode !== "USD")) throw new Error("Hector's template is USD-only. No currency conversion was applied.");
  const columns = selections.flatMap((selection) => {
    const source = columnFor(selection);
    if (!selection.splitConnectivity) return [source];
    const match = (pattern: RegExp, optional: boolean) => source.lines.filter((line) => line.cadence === "monthly" && line.optional === optional && pattern.test(line.label));
    const cellular = match(/\bT-Mobile\b/i, false);
    const privateNetwork = match(/\bSecureLynk\b/i, false);
    const satellite = match(/pooled data allowance|\bStarlink\b.*\bdata\b/i, true);
    const access = match(/terminal[ -]access fee/i, true);
    const selected = [...cellular, ...privateNetwork, ...satellite, ...access];
    if ([cellular, privateNetwork, satellite, access].some((group) => group.length !== 1) || new Set(selected.map((line) => line.id)).size !== 4 || source.lines.some((line) => !line.optional && !selected.includes(line) && (line.cost !== 0 || line.price !== 0))) {
      throw new Error(`${source.label}: cannot separate cellular and Starlink automatically. Keep it as one option or review the service line items.`);
    }
    return [
      calculateColumn({ ...source, label: "Cellular + SecureLynk", lines: [...cellular, ...privateNetwork], notes: "Cellular alternative to Starlink, not an additional charge. Private-network charge retained." }),
      calculateColumn({ ...source, label: "Starlink + SecureLynk", lines: [...satellite, ...access, ...privateNetwork].map((line) => ({ ...line, optional: false })), notes: "Starlink replaces cellular. Private-network charge retained." }),
    ];
  });
  if (columns.length > 5) throw new Error("Hector's unchanged template holds five option columns. Select fewer options; no sheets or columns were added.");
  return columns;
}

export function canSplitQuoteMasterConnectivity(selection: QuoteMasterSelection) {
  try {
    return buildQuoteMasterColumns([{ ...selection, splitConnectivity: true }]).length === 2;
  } catch {
    return false;
  }
}

export function blankQuoteMasterInputs(): QuoteMasterCell[] {
  const cells: QuoteMasterCell[] = [];
  const set = (sheet: string, address: string, value: string | number | null) => cells.push({ sheet, address, value });
  for (const row of [...saleRows, ...installationRows]) {
    for (const col of ["A", "B", "C", "D", ...saleQtyColumns, "V"]) set("Sale (BOM)", `${col}${row}`, col === "A" || col === "V" ? "" : col === "B" ? "-" : 0);
  }
  for (const row of [...Array.from({ length: 55 }, (_, n) => n + 10), ...Array.from({ length: 39 }, (_, n) => n + 66), ...Array.from({ length: 21 }, (_, n) => n + 106), ...recurringRows]) {
    for (const col of ["A", "B", "C", ...rentalQtyColumns, "O"]) set("Rental (BOM)", `${col}${row}`, col === "A" || col === "O" ? "" : col === "B" ? "-" : 0);
  }
  for (let i = 0; i < 5; i++) {
    set("Rental (BOM)", `${rentalQtyColumns[i]}4`, "");
    set("Sale (BOM)", `${saleQtyColumns[i]}7`, "");
    for (const row of [4, 5, 6, 7, 48, 65, 93]) set("Pricing", `${pricingColumns[i]}${row}`, 0);
    set("Pricing", `${pricingColumns[i]}64`, "");
  }
  for (const address of ["C4", "C5", "C6", "D7", "C8", "B10"]) set("Exec Summary", address, "");
  for (const address of ["K3", "K47", "K57", "K97"]) set("Pricing", address, "");
  return cells;
}

export function buildQuoteMasterInputs(selections: QuoteMasterSelection[], columns = buildQuoteMasterColumns(selections)) {
  const cells = new Map(blankQuoteMasterInputs().map((cell) => [`${cell.sheet}!${cell.address}`, cell]));
  const set = (sheet: string, address: string, value: string | number | null) => cells.set(`${sheet}!${address}`, { sheet, address, value });
  const quote = selections[0].quote;
  set("Exec Summary", "C4", quote.metadata.proposalDate);
  set("Exec Summary", "C5", quote.customer.name);
  set("Exec Summary", "C6", quote.metadata.ownerName || "");
  set("Exec Summary", "C8", selections.length > 1 ? `${quote.customer.name} quote package` : quote.majorProject.summary.projectName || quote.metadata.documentTitle);
  const descriptions = columns.map((column, i) => `${i + 1}. ${column.label}: ${money(column.oneTime)} one-time; ${money(column.monthly)}/month; ${money(column.annual)}/year (Year 1 ${money(column.annualFirstYear)}).`);
  set("Exec Summary", "B10", ["Internal pricing review. Separate scopes and service alternatives, not a combined purchase.", ...descriptions, "One package per column covers the full quoted quantities. Annual services use contract-average monthly equivalents in the financial model; billing remains annual. NPV and payback use this average cash-flow assumption."].join("\n"));
  set("Pricing", "K3", [quote.majorProject.summary.projectDescription, ...columns.map((column, i) => `${i + 1}. ${column.label}: ${column.proposalNumber}; ${column.siteCount} quoted site(s); one complete quoted package. ${column.notes}`)].filter(Boolean).join("\n"));
  set("Pricing", "K47", "Annual subscriptions remain annual invoices. Monthly financial-model inputs average annual charges over the exported contract term. Renewals beginning Year 2 exclude Year 1. Optional items have zero included quantity; their quoted quantities and prices are in BOM notes. Tax is excluded from internal revenue. NPV uses annual-end average cash flows, not an invoice-date forecast. Cash-flow grids show 59 months after the initial period.");
  set("Pricing", "K57", descriptions.join("\n"));
  set("Pricing", "K97", `${QUOTE_MASTER_TEMPLATE_NOTICE} Select the required hardware and one connectivity alternative. Costs and prices come from saved line items. Unconfirmed technical requirements remain in the source quotes.`);
  const grouped = new Map<string, { line: QuoteMasterLine; quantities: number[]; modelUnitCost: number; note: string }>();
  columns.forEach((column, index) => {
    set("Rental (BOM)", `${rentalQtyColumns[index]}4`, column.label);
    set("Sale (BOM)", `${saleQtyColumns[index]}7`, column.label);
    set("Pricing", `${pricingColumns[index]}64`, column.label);
    set("Pricing", `${pricingColumns[index]}4`, column.termMonths);
    set("Pricing", `${pricingColumns[index]}5`, column.lines.some((line) => !line.optional && line.cadence !== "one_time") ? 1 : 0);
    set("Pricing", `${pricingColumns[index]}6`, column.modelMonthly);
    set("Pricing", `${pricingColumns[index]}65`, column.lines.some((line) => !line.optional && line.cadence === "one_time" && !line.rental) ? 1 : 0);
    for (const line of column.lines) {
      if (!line.quantity && !line.price && !line.cost) continue;
      const factor = line.cadence === "annual" ? line.optional ? 1 / 12 : annualPeriods(line, column.termMonths) / column.termMonths : 1;
      const modelUnitCost = line.cost / line.quantity * factor;
      const key = `${keyFor(line)}:${modelUnitCost}:${Boolean(line.rental)}:${line.usageUnit || ""}:${line.optional ? index : ""}`;
      const group = grouped.get(key) || { line, quantities: [0, 0, 0, 0, 0], modelUnitCost, note: "" };
      group.quantities[index] += line.optional ? 0 : line.quantity;
      const cadence = line.usageUnit ? `/${line.usageUnit}` : line.cadence === "annual" ? "/yr" : line.cadence === "monthly" ? "/mo" : "";
      const renewal = line.cadence === "annual" ? `; Y${line.startsYear}` : "";
      const detail = line.rental ? "Leased equipment; no upfront sale." : line.cadence === "one_time" && !line.optional ? "Cost and price per unit; full quoted quantities." : `${line.optional ? `Opt ${index + 1}${line.usageUnit ? " usage" : ` qty ${line.quantity}`}: ` : ""}${money(line.price / line.quantity)}${cadence}; cost ${money(line.cost / line.quantity)}${cadence}${renewal}.`;
      group.note = detail;
      grouped.set(key, group);
    }
  });
  let itemIndex = 0, installIndex = 0, recurringIndex = 0, rentalIndex = 0;
  for (const group of grouped.values()) {
    const recurring = group.line.cadence !== "one_time";
    const inRentalSheet = recurring || group.line.rental;
    const row = group.line.rental ? (rentalIndex < 55 ? 10 + rentalIndex++ : undefined) : recurring ? recurringRows[recurringIndex++] : group.line.installation ? installationRows[installIndex++] : saleRows[itemIndex++];
    if (!row) throw new Error("The selected line items exceed the template's existing BOM rows. Export fewer options; no rows were added or items omitted.");
    const sheet = inRentalSheet ? "Rental (BOM)" : "Sale (BOM)";
    set(sheet, `A${row}`, `${group.line.optional ? "OPTION: " : ""}${group.line.label}${group.line.cadence === "annual" ? " (annual)" : ""}`);
    set(sheet, `B${row}`, group.line.category);
    set(sheet, `C${row}`, group.modelUnitCost);
    if (!inRentalSheet) {
      set(sheet, `D${row}`, group.line.price ? 1 - group.line.cost / group.line.price : 0);
      // Zero-cost or no-charge lines are quoted price inputs; margin division cannot represent them.
      if (group.line.cost === 0 || group.line.price === 0) {
        set(sheet, `E${row}`, group.line.price / group.line.quantity);
        group.note += " Fixed quoted unit price.";
      }
    }
    (inRentalSheet ? rentalQtyColumns : saleQtyColumns).forEach((col, i) => set(sheet, `${col}${row}`, group.quantities[i]));
    set(sheet, `${inRentalSheet ? "O" : "V"}${row}`, group.note);
  }
  const filename = `${quote.customer.name} - ${selections.length > 1 ? "Quote Package" : quote.majorProject.summary.projectName || quote.metadata.documentTitle} - Quote Master`.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 215).trim() + ".xlsx";
  return { cells: [...cells.values()], columns, fileName: filename, notices: [QUOTE_MASTER_TEMPLATE_NOTICE] };
}

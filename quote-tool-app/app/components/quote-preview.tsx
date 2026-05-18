"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { ProductLogo } from "@/app/components/product-logo";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/app/components/auth-shell";
import { buildProposalPreviewPath } from "@/app/lib/proposal-navigation";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, QUOTE_STATUS_OPTIONS, createProposalCopy, createProposalFromQuote, deserializeProposalStore, getActiveProposal, getDefaultProposalStore, mockUsers, serializeProposalStore, statusToStageLabel, upsertProposal, type SavedProposalRecord } from "@/app/lib/proposal-store";
import { resolvePreferredQuote } from "@/app/lib/active-proposal";
import {
  PROPOSAL_STORAGE_FALLBACK_KEY,
  PROPOSAL_STORAGE_KEY,
  deserializeQuoteRecord,
  persistQuoteRecord,
} from "@/app/lib/proposal-state";
import { equipmentCatalog, sectionACatalog } from "@/app/lib/catalog";
import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import {
  buildExecutiveSummaryRenderBlocks,
  createExecutiveSummaryBlock,
  normalizeExecutiveSummaryBlocks,
  serializeExecutiveSummaryBlocks,
} from "@/app/lib/executive-summary";
import { TERMS_PACKAGES, buildTermsFromPackage } from "@/app/lib/terms-packages";
import {
  isMajorProjectBomSectionRow,
  isMajorProjectBomSummaryRow,
  resolveMajorProjectBomColumnMap,
  resolveMajorProjectBomHeaderRow,
  resolveMajorProjectBomImportColumnMap,
} from "@/app/lib/major-project-bom-import";
import {
  CUSTOMER_PROFILE_STORE_FALLBACK_KEY,
  CUSTOMER_PROFILE_STORE_KEY,
  applyCustomerProfileToQuote,
  createCustomerProfileFromQuote,
  deserializeCustomerProfiles,
  serializeCustomerProfiles,
  upsertCustomerProfile,
  type SavedCustomerProfile,
} from "@/app/lib/customer-profiles";
import { ensureNickTrainingDemoProfiles, ensureNickTrainingDemoProposalStore } from "@/app/lib/nick-training-demo";
import { normalizeQuoteGovernanceState } from "@/app/lib/cpq-governance";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, ensureMajorProjectState, getActiveMajorProjectOption, majorProjectLineTypeLabel } from "@/app/lib/major-project";
import { getQuoteContentPresence } from "@/app/lib/proposal-commercial-summary";
import {
  createDefaultServiceAgreementProfile,
  createServiceRowFromAgreementCategory,
  normalizeServiceAgreementProfile,
} from "@/app/lib/service-agreement";
import { buildServiceAgreementDocument } from "@/app/lib/service-agreement-export";
import {
  type MajorProjectBundle,
  type MajorProjectBomColumnMap,
  type MajorProjectBomColumnKey,
  type MajorProjectBomImportSheet,
  type MajorProjectComponent,
  type MajorProjectCustomerQuoteLine,
  type MajorProjectOption,
  type MajorProjectSpecAttachment,
  type MajorProjectSimpleBucket,
  type MajorProjectSimpleRow,
  type MajorProjectVendorQuoteImport,
  type MajorProjectVendorQuoteSource,
  type AddressBlock,
  type EquipmentPricingRow,
  type PerKitPricingRow,
  type PoolPricingRow,
  type QuoteCustomField,
  type QuoteRecord,
  type QuoteStructuredTextBlock,
  type QuoteType,
  type ServiceAgreementCategoryKey,
  type ServiceAgreementRateBasis,
  type ServiceAgreementCategoryPricing,
  type ServicePricingRow,
} from "@/app/lib/quote-record";
import {
  MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES,
  createMajorProjectSpecAttachmentStorageKey,
  deleteMajorProjectSpecAttachmentFile,
  persistMajorProjectSpecAttachmentFile,
} from "@/app/lib/major-project-spec-attachments";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
import { createBlankQuoteRecord } from "@/app/lib/quote-template";

type EquipmentDraft = {
  itemName: string;
  imageUrl: string;
  itemCategory: string;
  terminalType: string;
  partNumber: string;
  quantity: string;
  unitPrice: string;
  description: string;
};

type CustomSectionField = QuoteCustomField;

type DataQuickAddUnit = "GB" | "TB";
type ServiceStage = "budgetary" | "final";
type ServiceCategory = "site_inspection" | "installation" | "custom";
type MajorProjectEditorTab = "components" | "bundles" | "quote_lines";
type MajorProjectStepStatus = "current" | "complete" | "locked";
type MajorProjectScheduleFilter = "all" | "one_time" | "recurring";
type CustomerEntryMode = "start" | "select" | "create" | "review";
type EntryIntent = "new-customer" | "select-customer" | "major-project" | "major-project-select-customer" | null;
type MajorProjectBomCaptureError = {
  fileName: string;
  sizeBytes: number;
  extension: string;
  mimeType?: string;
  message: string;
  source: "drop" | "picker";
};
type MajorProjectVendorQuoteCaptureError = {
  fileName: string;
  sizeBytes: number;
  extension: string;
  mimeType?: string;
  message: string;
  source: MajorProjectVendorQuoteSource;
};
type MajorProjectComponentBundleDraft = {
  sourceComponentId: string;
  selectedComponentIds: string[];
};
type MajorProjectVendorQuoteColumnKey =
  | "label"
  | "description"
  | "quantity"
  | "unit"
  | "vendor"
  | "unitPrice"
  | "extendedPrice"
  | "unitCost"
  | "extendedCost";

const EXECUTIVE_SUMMARY_BLOCK_LABELS: Record<QuoteStructuredTextBlock["type"], string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  bullet_list: "Bullets",
  numbered_list: "Numbered list",
};

const emptyEquipmentDraft: EquipmentDraft = {
  itemName: "",
  imageUrl: "",
  itemCategory: "Custom",
  terminalType: "",
  partNumber: "",
  quantity: "1",
  unitPrice: "0",
  description: "",
};

const MAJOR_PROJECT_BOM_ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;
const MAJOR_PROJECT_BOM_ALLOWED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "text/plain",
]);
const MAJOR_PROJECT_BOM_MAX_SHEET_ROWS = 250;
const MAJOR_PROJECT_BOM_PREVIEW_ROW_COUNT = 6;
const MAJOR_PROJECT_BOM_IMPORT_SOURCE_PREFIX = "BOM import source:";
const DEFAULT_IMPORTED_MARGIN_PERCENT = 35;
const MAJOR_PROJECT_VENDOR_QUOTE_ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"] as const;
const MAJOR_PROJECT_VENDOR_QUOTE_ALLOWED_MIME_TYPES = new Set([
  ...MAJOR_PROJECT_BOM_ALLOWED_MIME_TYPES,
  "application/pdf",
]);
const MAJOR_PROJECT_VENDOR_QUOTE_PREVIEW_ITEM_COUNT = 8;
const MAJOR_PROJECT_VENDOR_QUOTE_COLUMN_MATCHERS: Record<MajorProjectVendorQuoteColumnKey, string[]> = {
  label: ["item", "item name", "product", "component", "equipment", "service", "line item", "part", "product name"],
  description: ["description", "details", "scope", "notes"],
  quantity: ["qty", "quantity", "units", "count"],
  unit: ["unit", "uom", "measure"],
  vendor: ["vendor", "supplier", "distributor"],
  unitPrice: ["customer pricing", "customer price", "sell price", "sale price", "customer unit price", "unit sell", "price each", "each price", "price ea", "unit price", "discounted price", "discount price", "disc price", "disc. price", "net price", "monthly", "mrc", "mrr", "list price"],
  extendedPrice: ["customer total", "sell total", "line total", "extended price", "extended sell", "discounted total", "discount total", "disc total", "monthly total", "monthly amount", "customer amount", "amount"],
  unitCost: ["our cost", "unit cost", "vendor cost", "cost each", "cost ea", "ea cost"],
  extendedCost: ["total cost", "extended cost", "vendor total", "our total", "cost total"],
};

const MAJOR_PROJECT_BOM_REVIEW_FIELDS: Array<{ key: MajorProjectBomColumnKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "quantity", label: "Quantity" },
  { key: "vendor", label: "Vendor" },
  { key: "manufacturer", label: "Manufacturer / provider" },
  { key: "unitCost", label: "Unit cost" },
  { key: "totalCost", label: "Total cost" },
];

function getFileExtension(fileName: string) {
  const trimmed = fileName.trim().toLowerCase();
  const lastDotIndex = trimmed.lastIndexOf(".");
  return lastDotIndex >= 0 ? trimmed.slice(lastDotIndex) : "";
}

function formatMajorProjectBomFileType(fileName: string, mimeType?: string) {
  const extension = getFileExtension(fileName);
  if (extension) return extension.toUpperCase().replace(".", "");
  if (mimeType?.trim()) return mimeType;
  return "Unknown";
}

function formatMajorProjectVendorQuoteFileType(fileName: string, mimeType?: string) {
  return formatMajorProjectBomFileType(fileName, mimeType);
}

function NormalizedHardwarePreviewCard({
  imageUrl,
  altText,
}: {
  imageUrl?: string;
  altText: string;
}) {
  return (
    <div className="rounded-[18px] border border-[#dce3ea] bg-[#f8fbfd] p-3">
      {imageUrl ? (
        <img src={imageUrl} alt={altText} className="h-[132px] w-full rounded-[12px] bg-white object-contain" />
      ) : (
        <div className="flex h-[132px] items-center justify-center rounded-[12px] border border-dashed border-[#d8e1e8] bg-white px-3 text-center text-[12px] text-[#7a8794]">
          Add an image URL to show a normalized hardware preview.
        </div>
      )}
    </div>
  );
}

function validateMajorProjectBomFile(file: File) {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.trim().toLowerCase();
  const hasAllowedExtension = MAJOR_PROJECT_BOM_ALLOWED_EXTENSIONS.includes(
    extension as (typeof MAJOR_PROJECT_BOM_ALLOWED_EXTENSIONS)[number],
  );
  const hasAllowedMimeType = mimeType ? MAJOR_PROJECT_BOM_ALLOWED_MIME_TYPES.has(mimeType) : false;

  if (!hasAllowedExtension && !hasAllowedMimeType) {
    return "Unsupported workbook type. Use an .xlsx, .xls, or .csv file for BOM review.";
  }

  return null;
}

function validateMajorProjectVendorQuoteFile(file: File) {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.trim().toLowerCase();
  const hasAllowedExtension = MAJOR_PROJECT_VENDOR_QUOTE_ALLOWED_EXTENSIONS.includes(
    extension as (typeof MAJOR_PROJECT_VENDOR_QUOTE_ALLOWED_EXTENSIONS)[number],
  );
  const hasAllowedMimeType = mimeType ? MAJOR_PROJECT_VENDOR_QUOTE_ALLOWED_MIME_TYPES.has(mimeType) : false;

  if (!hasAllowedExtension && !hasAllowedMimeType) {
    return "Unsupported vendor quote type. Use an .xlsx, .xls, .csv, or .pdf file.";
  }

  return null;
}

async function readMajorProjectBomWorkbookLocally(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    dense: false,
  });
  const sheetEntries = workbook.SheetNames
    .map((rawSheetName) => ({
      rawSheetName,
      displayName: rawSheetName.trim(),
    }))
    .filter((entry) => entry.displayName);
  const sheetNames = sheetEntries.map((entry) => entry.displayName);

  if (!sheetNames.length) {
    throw new Error("Workbook parsed but no sheets were found.");
  }

  const sheets: MajorProjectBomImportSheet[] = sheetEntries.map((sheetEntry) => {
    const worksheet = workbook.Sheets[sheetEntry.rawSheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const normalizedRows = rawRows
      .map((row, index) => ({
        rowNumber: index + 1,
        cells: (Array.isArray(row) ? row : []).map((value) => String(value ?? "").trim()),
      }))
      .filter((row) => row.cells.some((cell) => cell.trim().length > 0));

    return {
      name: sheetEntry.displayName,
      rowCount: normalizedRows.length,
      rows: normalizedRows.slice(0, MAJOR_PROJECT_BOM_MAX_SHEET_ROWS),
    };
  });

  return { sheetNames, sheets };
}

async function readMajorProjectBomWorkbook(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/major-project-bom-parse", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Workbook upload succeeded, but RapidQuote could not parse the workbook rows.");
    }

    const parsed = await response.json() as {
      sheetNames?: string[];
      sheets?: MajorProjectBomImportSheet[];
    };
    const sheetNames = parsed.sheetNames?.map((sheetName) => sheetName.trim()).filter(Boolean) ?? [];
    const sheets = parsed.sheets ?? [];

    if (!sheetNames.length || !sheets.length) {
      throw new Error("Workbook parsed but no sheets were found.");
    }

    return { sheetNames, sheets };
  } catch {
    return readMajorProjectBomWorkbookLocally(file);
  }
}

function getMajorProjectBomStatusLabel(status: NonNullable<QuoteRecord["majorProject"]["bomImport"]>["status"]) {
  switch (status) {
    case "captured":
      return "Captured";
    case "reading":
      return "Reading workbook";
    case "loaded":
      return "Workbook tabs ready for review";
    case "error":
      return "Workbook read failed";
    default:
      return status;
  }
}

function getMajorProjectVendorQuoteStatusLabel(status: MajorProjectVendorQuoteImport["status"]) {
  switch (status) {
    case "reading":
      return "Reading quote";
    case "loaded":
      return "Ready to seed rows";
    case "error":
      return "Quote read failed";
    default:
      return status;
  }
}

function applyMarginToCost(cost: number, marginPercent: number) {
  const safeCost = Number.isFinite(cost) ? Math.max(cost, 0) : 0;
  const safeMargin = Number.isFinite(marginPercent) ? Math.min(Math.max(marginPercent, 0), 95) : 0;
  if (safeCost <= 0) return 0;
  if (safeMargin <= 0) return Number(safeCost.toFixed(2));
  return Number((safeCost / (1 - safeMargin / 100)).toFixed(2));
}

function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function buildMarginPricingSummary(cost: number | undefined, marginPercent: number, currencyCode = "USD") {
  const safeCost = Number.isFinite(Number(cost)) ? Math.max(Number(cost), 0) : 0;
  const safeMargin = Number.isFinite(marginPercent) ? Math.min(Math.max(marginPercent, 0), 95) : 0;
  if (safeCost <= 0) {
    return `${safeMargin}% gross margin will seed customer pricing from vendor cost when cost is available.`;
  }
  const customerPrice = applyMarginToCost(safeCost, safeMargin);
  return `${formatCurrency(safeCost, currencyCode)} vendor cost -> ${formatCurrency(customerPrice, currencyCode)} customer price at ${safeMargin}% margin.`;
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMajorProjectBomCurrency(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\((.+)\)/, "-$1")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMajorProjectVendorQuoteHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function getMajorProjectBomCell(row: MajorProjectBomImportSheet["rows"][number], index: number | undefined) {
  if (index === undefined || index < 0) return "";
  return row.cells[index]?.trim() ?? "";
}

function createMajorProjectBomImportSourceTag(sheetName: string, rowNumber: number) {
  return `BOM import source: ${sheetName} row ${rowNumber}`;
}

function resolveMajorProjectVendorQuoteHeaderRow(sheet: MajorProjectBomImportSheet) {
  let bestIndex = -1;
  let bestScore = 0;
  const scanRows = sheet.rows.slice(0, Math.min(sheet.rows.length, 12));

  for (const row of scanRows) {
    let score = 0;
    for (const cell of row.cells) {
      const normalizedCell = normalizeMajorProjectVendorQuoteHeader(cell);
      if (!normalizedCell) continue;
      for (const candidates of Object.values(MAJOR_PROJECT_VENDOR_QUOTE_COLUMN_MATCHERS)) {
        if (candidates.some((candidate) => normalizedCell.includes(candidate))) {
          score += 1;
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = sheet.rows.findIndex((candidate) => candidate.rowNumber === row.rowNumber);
    }
  }

  return bestScore >= 2 ? bestIndex : -1;
}

function scoreMajorProjectVendorQuoteHeaderMatch(normalizedCell: string, candidates: string[]) {
  let bestScore = -1;

  candidates.forEach((candidate, index) => {
    if (!normalizedCell.includes(candidate)) return;
    const exactMatch = normalizedCell === candidate;
    const score = (exactMatch ? 1000 : 500) - index;
    if (score > bestScore) {
      bestScore = score;
    }
  });

  return bestScore;
}

function resolveMajorProjectVendorQuoteColumnMap(headerCells: string[]) {
  const normalizedHeaders = headerCells.map((cell) => normalizeMajorProjectVendorQuoteHeader(cell));
  const columnMap: Partial<Record<MajorProjectVendorQuoteColumnKey, number>> = {};

  for (const [columnKey, candidates] of Object.entries(MAJOR_PROJECT_VENDOR_QUOTE_COLUMN_MATCHERS) as Array<[MajorProjectVendorQuoteColumnKey, string[]]>) {
    let bestIndex = -1;
    let bestScore = -1;

    normalizedHeaders.forEach((normalizedCell, index) => {
      if (!normalizedCell) return;
      const score = scoreMajorProjectVendorQuoteHeaderMatch(normalizedCell, candidates);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0) {
      columnMap[columnKey] = bestIndex;
    }
  }

  if (columnMap.label === undefined && columnMap.description !== undefined) {
    columnMap.label = columnMap.description;
  }

  return columnMap;
}

function shouldSkipMajorProjectVendorQuoteRow(label: string, description: string, priceText: string, extendedText: string) {
  const combined = [label, description, priceText, extendedText].join(" ").trim();
  if (!combined) return true;
  return /^(subtotal|total|grand total|monthly total|project total)/i.test(combined);
}

function inferMajorProjectVendorQuoteBucket(...values: Array<string | undefined>) {
  const combined = values.filter(Boolean).join(" ").toLowerCase();
  if (/(support|monitor|maintenance|managed service|help desk)/i.test(combined)) return "support_recurring" as const;
  if (/(monthly|mrc|mrr|subscription|recurring|license|service)/i.test(combined)) return "other_vendor" as const;
  if (/(install|labor|deployment|commissioning|survey|travel)/i.test(combined)) return "install" as const;
  return "hardware" as const;
}

function buildMajorProjectVendorQuoteItems(sheet: MajorProjectBomImportSheet, fileName: string) {
  const headerRowIndex = resolveMajorProjectVendorQuoteHeaderRow(sheet);
  const headerCells = headerRowIndex >= 0 ? sheet.rows[headerRowIndex]?.cells ?? [] : [];
  const columnMap = resolveMajorProjectVendorQuoteColumnMap(headerCells);
  const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  const items: NonNullable<MajorProjectVendorQuoteImport["previewItems"]> = [];

  for (const row of sheet.rows.slice(startIndex)) {
    const label = getMajorProjectBomCell(row, columnMap.label);
    const description = getMajorProjectBomCell(row, columnMap.description);
    const quantityText = getMajorProjectBomCell(row, columnMap.quantity);
    const unit = getMajorProjectBomCell(row, columnMap.unit) || "ea";
    const vendor = getMajorProjectBomCell(row, columnMap.vendor);
    const unitPriceText = getMajorProjectBomCell(row, columnMap.unitPrice);
    const extendedPriceText = getMajorProjectBomCell(row, columnMap.extendedPrice);
    const unitCostText = getMajorProjectBomCell(row, columnMap.unitCost);
    const extendedCostText = getMajorProjectBomCell(row, columnMap.extendedCost);

    if (shouldSkipMajorProjectVendorQuoteRow(label, description, [unitPriceText, extendedPriceText, unitCostText, extendedCostText].filter(Boolean).join(" "), extendedPriceText)) {
      continue;
    }

    const quantityValue = parseMajorProjectBomCurrency(quantityText) ?? parseNumber(quantityText);
    const quantity = quantityValue > 0 ? quantityValue : 1;
    const unitPriceValue = parseMajorProjectBomCurrency(unitPriceText);
    const extendedPriceValue = parseMajorProjectBomCurrency(extendedPriceText);
    const unitCostValue = parseMajorProjectBomCurrency(unitCostText);
    const extendedCostValue = parseMajorProjectBomCurrency(extendedCostText);
    const resolvedUnitPrice = unitPriceValue
      ?? (extendedPriceValue !== null ? Number((extendedPriceValue / quantity).toFixed(2)) : null)
      ?? unitCostValue
      ?? (extendedCostValue !== null ? Number((extendedCostValue / quantity).toFixed(2)) : 0);
    const resolvedExtendedPrice = extendedPriceValue ?? Number((quantity * resolvedUnitPrice).toFixed(2));
    const resolvedUnitCost = unitCostValue
      ?? (extendedCostValue !== null ? Number((extendedCostValue / quantity).toFixed(2)) : null)
      ?? resolvedUnitPrice;
    const resolvedExtendedCost = extendedCostValue ?? Number((quantity * resolvedUnitCost).toFixed(2));
    const resolvedLabel = label || description || stripFileExtension(fileName);

    if (!resolvedLabel.trim()) {
      continue;
    }

    items.push({
      id: `vendor-quote-item-${row.rowNumber}`,
      label: resolvedLabel,
      description: description && description !== resolvedLabel ? description : undefined,
      quantity,
      unit,
      unitPrice: resolvedUnitPrice,
      extendedPrice: resolvedExtendedPrice,
      unitCost: resolvedUnitCost,
      extendedCost: resolvedExtendedCost,
      bucket: inferMajorProjectVendorQuoteBucket(resolvedLabel, description, vendor),
      rowNumber: row.rowNumber,
      vendor: vendor || undefined,
    });
  }

  return items;
}

function selectBestMajorProjectVendorQuoteSheet(sheets: MajorProjectBomImportSheet[]) {
  if (!sheets.length) return null;

  const rankedSheets = sheets
    .map((sheet) => ({
      sheet,
      headerRowIndex: resolveMajorProjectVendorQuoteHeaderRow(sheet),
    }))
    .map((entry) => ({
      ...entry,
      itemCount: buildMajorProjectVendorQuoteItems(entry.sheet, entry.sheet.name).length,
    }))
    .sort((left, right) => right.itemCount - left.itemCount || left.sheet.name.localeCompare(right.sheet.name));

  return rankedSheets[0]?.sheet ?? sheets[0];
}

function createPdfMajorProjectVendorQuotePreview(file: File): NonNullable<MajorProjectVendorQuoteImport["previewItems"]> {
  return [{
    id: `vendor-quote-item-${Date.now()}`,
    label: stripFileExtension(file.name),
    description: "Vendor quote PDF attached for manual pricing review. Convert this placeholder into priced rows after review.",
    quantity: 1,
    unit: "ea",
    unitPrice: 0,
    extendedPrice: 0,
    bucket: "hardware",
    rowKind: "item",
  }];
}

function buildVendorQuoteMetadataSummary(item: NonNullable<MajorProjectVendorQuoteImport["previewItems"]>[number]) {
  return [
    item.itemCode ? `Item code: ${item.itemCode}` : "",
    item.manufacturer ? `Manufacturer: ${item.manufacturer}` : "",
    item.warranty ? `Warranty: ${item.warranty}` : "",
    item.origin ? `Origin: ${item.origin}` : "",
    item.quoteReference ? `Quote ref: ${item.quoteReference}` : "",
  ].filter(Boolean);
}

async function readMajorProjectVendorQuote(file: File, source: MajorProjectVendorQuoteSource): Promise<MajorProjectVendorQuoteImport> {
  const extension = getFileExtension(file.name);
  const isPdf = extension === ".pdf" || file.type.trim().toLowerCase() === "application/pdf";
  const id = `major-vendor-quote-${Date.now()}-${Math.round(Math.random() * 1000)}`;

  if (isPdf) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/vendor-quote-pdf-parse", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Vendor quote PDF upload succeeded, but RapidQuote could not parse the PDF rows.");
    }

    const parsed = await response.json() as {
      vendorName?: string;
      quoteReference?: string;
      previewItems?: NonNullable<MajorProjectVendorQuoteImport["previewItems"]>;
    };

    const previewItems = parsed.previewItems?.length ? parsed.previewItems : createPdfMajorProjectVendorQuotePreview(file);

    return {
      id,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || undefined,
      capturedAt: new Date().toISOString(),
      source,
      status: "loaded",
      quoteLabel: parsed.quoteReference?.trim() || stripFileExtension(file.name),
      vendorName: parsed.vendorName?.trim() || undefined,
      previewItems,
    };
  }

  const { sheets } = await readMajorProjectBomWorkbook(file);
  const selectedSheet = selectBestMajorProjectVendorQuoteSheet(sheets);
  if (!selectedSheet) {
    throw new Error("Vendor quote workbook parsed but no usable sheets were found.");
  }

  const previewItems = buildMajorProjectVendorQuoteItems(selectedSheet, file.name);
  if (!previewItems.length) {
    throw new Error("No usable quote rows were found. Use a sheet with item labels and pricing columns.");
  }

  const detectedVendor = previewItems.find((item) => item.vendor?.trim())?.vendor?.trim();

  return {
    id,
    fileName: file.name,
    sizeBytes: file.size,
    mimeType: file.type || undefined,
    capturedAt: new Date().toISOString(),
    source,
    status: "loaded",
    quoteLabel: stripFileExtension(file.name),
    vendorName: detectedVendor || undefined,
    previewItems,
  };
}

function createDraftMajorProjectComponentFromBomRow(params: {
  row: MajorProjectBomImportSheet["rows"][number];
  sheetName: string;
  columnMap: Partial<Record<MajorProjectBomColumnKey, number>>;
  importIndex: number;
}): MajorProjectComponent | null {
  const { row, sheetName, columnMap, importIndex } = params;
  if (isMajorProjectBomSectionRow(row) || isMajorProjectBomSummaryRow(row)) {
    return null;
  }

  const name = getMajorProjectBomCell(row, columnMap.name);
  const description = getMajorProjectBomCell(row, columnMap.description);
  const vendor = getMajorProjectBomCell(row, columnMap.vendor);
  const manufacturer = getMajorProjectBomCell(row, columnMap.manufacturer);
  const quantityValue = getMajorProjectBomCell(row, columnMap.quantity);
  const unitCostValue = getMajorProjectBomCell(row, columnMap.unitCost);
  const totalCostValue = getMajorProjectBomCell(row, columnMap.totalCost);
  const fallbackName = row.cells.find((cell) => /[a-z]/i.test(cell))?.trim() ?? "";
  const resolvedName = name || description || fallbackName;

  if (!resolvedName) return null;

  const normalizedName = normalizeSearchValue(resolvedName);
  if (["total", "subtotal", "grand total"].some((label) => normalizedName === label || normalizedName.startsWith(`${label} `))) {
    return null;
  }

  const quantity = Math.max(parseMajorProjectBomCurrency(quantityValue) ?? 1, 0);
  const rawUnitCost = parseMajorProjectBomCurrency(unitCostValue);
  const rawTotalCost = parseMajorProjectBomCurrency(totalCostValue);
  const vendorUnitCost = rawUnitCost ?? (rawTotalCost !== null && quantity > 0 ? Number((rawTotalCost / quantity).toFixed(2)) : 0);
  const vendorExtendedCost = rawTotalCost ?? Number((quantity * vendorUnitCost).toFixed(2));
  const customerUnitPrice = applyMarginToCost(vendorUnitCost, DEFAULT_IMPORTED_MARGIN_PERCENT);
  const customerExtendedPrice = Number((quantity * customerUnitPrice).toFixed(2));
  const hasObviousField = Boolean(name || description || vendor || manufacturer || rawUnitCost !== null || rawTotalCost !== null || quantityValue);

  if (!hasObviousField) return null;

  const draft = createMajorProjectComponentDraft(importIndex);
  const noteParts = [
    createMajorProjectBomImportSourceTag(sheetName, row.rowNumber),
    description && description !== resolvedName ? description : "",
  ].filter(Boolean);

  return {
    ...draft,
    internalName: resolvedName,
    customerFacingLabel: description && description !== resolvedName ? description : resolvedName,
    vendor,
    manufacturer,
    quantity,
    customerUnitPrice,
    customerExtendedPrice,
    vendorUnitCost,
    vendorExtendedCost,
    notes: noteParts.join("\n"),
  } satisfies MajorProjectComponent;
}

function majorProjectMarginPercent(revenue: number, cost: number) {
  if (revenue <= 0) return 0;
  return ((revenue - cost) / revenue) * 100;
}

function majorProjectContractMonths(termMonths: number) {
  if (!Number.isFinite(termMonths) || termMonths <= 0) return 0;
  return Math.round(termMonths);
}

function majorProjectContractValue(monthlyValue: number, termMonths: number) {
  return Number((monthlyValue * majorProjectContractMonths(termMonths)).toFixed(2));
}

function buildMajorProjectContractRollup(params: {
  oneTimeRevenue: number;
  recurringRevenue: number;
  oneTimeCost: number;
  recurringCost: number;
  termMonths: number;
}) {
  const recurringContractRevenue = majorProjectContractValue(params.recurringRevenue, params.termMonths);
  const recurringContractCost = majorProjectContractValue(params.recurringCost, params.termMonths);
  const totalContractRevenue = Number((params.oneTimeRevenue + recurringContractRevenue).toFixed(2));
  const totalContractCost = Number((params.oneTimeCost + recurringContractCost).toFixed(2));

  return {
    recurringContractRevenue,
    recurringContractCost,
    totalContractRevenue,
    totalContractCost,
  };
}

function createMajorProjectBundleInternalName(sourceComponent: MajorProjectComponent | undefined, fallback: string) {
  const trimmed = sourceComponent?.internalName?.trim();
  return trimmed || fallback;
}

function createMajorProjectBundleDescription(components: MajorProjectComponent[], customerFacingLabel: string) {
  const sharedLabel = normalizeSearchValue(customerFacingLabel);
  const seen = new Set<string>();
  const details: string[] = [];

  for (const component of components) {
    for (const candidate of [component.customerFacingLabel?.trim(), component.notes?.trim()]) {
      const normalized = normalizeSearchValue(candidate ?? "");
      if (!normalized || normalized === sharedLabel || seen.has(normalized)) continue;
      seen.add(normalized);
      details.push(candidate!);
    }
  }

  return details.join(" | ");
}

function inferMajorProjectBundleSchedule(components: MajorProjectComponent[]): MajorProjectBundle["schedule"] {
  const hasRecurring = components.some((component) => component.schedule === "recurring");
  const hasOneTime = components.some((component) => component.schedule === "one_time");

  if (hasRecurring && hasOneTime) return "mixed";
  return hasRecurring ? "recurring" : "one_time";
}

function inferMajorProjectQuoteLineCategory(components: MajorProjectComponent[]): MajorProjectCustomerQuoteLine["presentationCategory"] {
  const hasRecurringOnly = components.length > 0 && components.every((component) => component.schedule === "recurring");
  if (hasRecurringOnly) return "recurring";

  const serviceLineTypes = new Set<MajorProjectComponent["lineType"]>([
    "installation",
    "service",
    "support",
    "managed_service",
    "optional_service",
    "internal_labor",
    "other",
  ]);

  return components.every((component) => serviceLineTypes.has(component.lineType)) ? "services" : "hardware";
}

function createMajorProjectLineItemNumberLabel(index: number) {
  return `${index}`;
}

function getNextMajorProjectLineItemNumber(lines: MajorProjectCustomerQuoteLine[]) {
  const highestLineItemNumber = lines.reduce((max, line, index) => {
    const lineItemNumber = Number(line.lineItemNumber);
    if (Number.isInteger(lineItemNumber) && lineItemNumber > 0) {
      return Math.max(max, lineItemNumber);
    }
    const fallbackLineItemNumber = /^\d+$/.test(line.label?.trim() ?? "") ? Number(line.label.trim()) : index + 1;
    return Math.max(max, fallbackLineItemNumber);
  }, 0);
  return highestLineItemNumber + 1;
}

function findSynchronizedQuoteLineForBundle(
  option: MajorProjectOption,
  bundleId: string,
) {
  const linkedQuoteLines = (option.customerQuoteLines ?? []).filter((line) => (line.bundleIds ?? []).includes(bundleId));
  if (linkedQuoteLines.length !== 1) return null;
  const [linkedQuoteLine] = linkedQuoteLines;
  return (linkedQuoteLine.bundleIds ?? []).length === 1 ? linkedQuoteLine : null;
}

function findSynchronizedBundleForQuoteLine(
  option: MajorProjectOption,
  quoteLineId: string,
) {
  const quoteLine = option.customerQuoteLines?.find((line) => line.id === quoteLineId);
  if (!quoteLine || (quoteLine.bundleIds ?? []).length !== 1) return null;
  const [bundleId] = quoteLine.bundleIds;
  const linkedQuoteLines = (option.customerQuoteLines ?? []).filter((line) => (line.bundleIds ?? []).includes(bundleId));
  if (linkedQuoteLines.length !== 1) return null;
  return option.bundles?.find((bundle) => bundle.id === bundleId) ?? null;
}

function computeEquipmentRow(row: EquipmentPricingRow): EquipmentPricingRow {
  return {
    ...row,
    totalPrice: Number((row.quantity * row.unitPrice).toFixed(2)),
  };
}

function computeServiceRow(row: ServicePricingRow): ServicePricingRow {
  return {
    ...row,
    totalPrice: Number((row.quantity * row.unitPrice).toFixed(2)),
  };
}

function resolveCustomerEntryMode(params: {
  intent: EntryIntent;
  hasCustomer: boolean;
  savedProfileCount: number;
}) {
  const { intent, hasCustomer, savedProfileCount } = params;

  if (hasCustomer) return "review" satisfies CustomerEntryMode;
  if (intent === "new-customer") return "create" satisfies CustomerEntryMode;
  if (intent === "select-customer" || intent === "major-project-select-customer") {
    return (savedProfileCount > 0 ? "select" : "create") satisfies CustomerEntryMode;
  }
  return (savedProfileCount > 0 ? "start" : "create") satisfies CustomerEntryMode;
}

function computeSectionARow<T extends PoolPricingRow | PerKitPricingRow>(row: T): T {
  if (row.rowType === "support") return row;

  const quantity = typeof row.quantity === "number" ? row.quantity : 1;
  const rate = typeof row.monthlyRate === "number" ? row.monthlyRate : row.unitPrice ?? 0;
  const total = row.rowType === "overage" ? rate : quantity * rate;

  return {
    ...row,
    unitPrice: row.unitPrice ?? rate,
    monthlyRate: rate,
    totalMonthlyRate: Number(total.toFixed(2)),
  };
}

function compactList(items: Array<string | undefined | null>) {
  return items.map((item) => item?.trim()).filter((item): item is string => Boolean(item));
}

function countSectionAUnits(rows: Array<PoolPricingRow | PerKitPricingRow>) {
  return rows.reduce((sum, row) => {
    if (row.rowType === "support") return sum;
    return sum + (typeof row.quantity === "number" ? row.quantity : 0);
  }, 0);
}

function deriveConnectivityLabel(rows: Array<PoolPricingRow | PerKitPricingRow>) {
  const text = rows.map((row) => row.description).join(" ").toLowerCase();
  const labels = [
    text.includes("starlink") ? "Starlink" : null,
    text.includes("unisim") || text.includes("lte") ? "LTE/UniSIM" : null,
    text.includes("t-mobile") ? "T-Mobile" : null,
  ].filter((label): label is string => Boolean(label));

  return Array.from(new Set(labels)).join(" + ") || "configured";
}

function buildExecutiveSummaryDraft(quote: QuoteRecord) {
  const customerName = quote.customer.name || quote.metadata.customerShortName || "the customer";
  const pricingModel = quote.sections.sectionA.mode === "pool" ? "pooled service" : "per-kit service";
  const sectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;
  const connectivityLabel = deriveConnectivityLabel(sectionARows);
  const serviceUnits = countSectionAUnits(sectionARows);
  const equipmentRows = quote.sections.sectionB.lineItems;
  const equipmentUnits = equipmentRows.reduce((sum, row) => sum + row.quantity, 0);
  const optionalServices = quote.sections.sectionC.enabled ? quote.sections.sectionC.lineItems : [];
  const optionalServiceLabels = compactList(optionalServices.map((row) => row.description));
  const equipmentLabels = compactList(equipmentRows.map((row) => `${row.quantity}x ${row.itemName}`));
  const recurringDescriptions = compactList(
    sectionARows
      .filter((row) => row.rowType !== "support")
      .map((row) => row.description),
  );

  const heading = "Executive Summary";
  const customerContext = `${quote.metadata.documentTitle || "Proposal"} for ${customerName} covering ${connectivityLabel} connectivity, equipment, and implementation scope as currently configured in the builder.`;

  const bodyParts = [
    `This draft reflects a ${quote.metadata.quoteType === "lease" ? "lease" : "purchase"} quote structured around ${pricingModel}${serviceUnits ? ` with ${serviceUnits} active service unit${serviceUnits === 1 ? "" : "s"}` : ""}.`,
    recurringDescriptions.length
      ? `Recurring service currently includes ${recurringDescriptions.slice(0, 3).join(", ")}${recurringDescriptions.length > 3 ? ", and additional configured line items" : ""}.`
      : undefined,
    equipmentLabels.length
      ? `Hardware scope includes ${equipmentUnits} total item${equipmentUnits === 1 ? "" : "s"}, including ${equipmentLabels.slice(0, 4).join(", ")}${equipmentLabels.length > 4 ? ", and other selected equipment" : ""}.`
      : undefined,
    optionalServiceLabels.length
      ? `Optional services currently include ${optionalServiceLabels.join(", ")}.`
      : `Optional services are ${quote.sections.sectionC.enabled ? "available to add as needed" : "not included in the current draft"}.`,
    `The summary is intended as a practical starting point and can be edited before sharing the final proposal with ${customerName}.`,
  ];

  const body = compactList(bodyParts).join(" ");
  const blocks: QuoteStructuredTextBlock[] = [
    {
      id: "generated-summary-body",
      type: "paragraph",
      text: body,
    },
  ];
  const serialized = serializeExecutiveSummaryBlocks(blocks);

  return { heading, customerContext, body: serialized.body, paragraphs: compactList([customerContext, ...serialized.paragraphs]), blocks: serialized.blocks };
}

function cloneQuote(source: QuoteRecord): QuoteRecord {
  return JSON.parse(JSON.stringify(source)) as QuoteRecord;
}

function moveInList<T>(list: T[], index: number, direction: -1 | 1) {
  if (list.length <= 1 || index < 0 || index >= list.length) return list;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) return list;
  const clone = [...list];
  const [item] = clone.splice(index, 1);
  clone.splice(nextIndex, 0, item);
  return clone;
}

function moveToPositionInList<T>(list: T[], index: number, targetPosition: number) {
  if (list.length <= 1 || index < 0 || index >= list.length) return list;
  const boundedTarget = Math.min(Math.max(targetPosition, 1), list.length) - 1;
  if (boundedTarget === index) return list;
  const clone = [...list];
  const [item] = clone.splice(index, 1);
  clone.splice(boundedTarget, 0, item);
  return clone;
}

function createEquipmentRowFromCatalog(catalogId: string): EquipmentPricingRow | null {
  const item = equipmentCatalog.find((entry) => entry.id === catalogId);
  if (!item) return null;

  return {
    id: `b_${catalogId}_${Date.now()}`,
    sourceType: "standard",
    itemName: item.label,
    imageUrl: item.imageUrl,
    itemCategory: item.category,
    terminalType: item.terminalType,
    partNumber: item.partNumber,
    quantity: 1,
    unitPrice: item.defaultUnitPrice,
    totalPrice: item.defaultUnitPrice,
    description: item.description,
    sourceLabel: item.source,
  };
}

function createSectionARowFromCatalog(catalogId: string, mode: "pool" | "per_kit"): PoolPricingRow | PerKitPricingRow | null {
  const item = sectionACatalog.find((entry) => entry.id === catalogId);
  if (!item) return null;

  if (item.id === "support-included") {
    return {
      id: `a_${catalogId}_${Date.now()}`,
      rowType: "support",
      description: item.label,
      includedText: item.description ? [item.description] : ["iNet customer support and portal access included."],
      sourceLabel: item.source,
    };
  }

  if (item.id === "pool-overage" && mode === "pool") {
    return {
      id: `a_${catalogId}_${Date.now()}`,
      rowType: "overage",
      description: item.label,
      quantity: 1,
      unitLabel: item.unitLabel ?? "GB",
      unitPrice: item.defaultUnitPrice,
      monthlyRate: item.defaultUnitPrice,
      totalMonthlyRate: item.defaultUnitPrice,
      sourceLabel: item.source,
    };
  }

  if (item.id === "terminal-access-fee") {
    return {
      id: `a_${catalogId}_${Date.now()}`,
      rowType: "terminal_fee",
      description: item.label,
      quantity: 1,
      unitLabel: item.unitLabel ?? "kit",
      unitPrice: item.defaultUnitPrice,
      monthlyRate: item.defaultUnitPrice,
      totalMonthlyRate: item.defaultUnitPrice,
      sourceLabel: item.source,
    };
  }

  const compatibleWithMode =
    mode === "pool"
      ? item.category !== "Per Kit Data"
      : item.category !== "Pool Plan" && item.category !== "Pool Overage";

  if (!compatibleWithMode) return null;

  return {
    id: `a_${catalogId}_${Date.now()}`,
    rowType: "service",
    description: item.label,
    quantity: 1,
    unitLabel: item.unitLabel ?? (mode === "pool" ? "pool" : "block"),
    unitPrice: item.defaultUnitPrice,
    monthlyRate: item.defaultUnitPrice,
    totalMonthlyRate: item.defaultUnitPrice,
    sourceLabel: item.source,
  };
}

function ToggleCard({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] border px-4 py-4 text-left transition ${
        active
          ? "border-[#b00000] bg-[#fff6f6] shadow-[0_12px_24px_rgba(176,0,0,0.10)]"
          : "border-[#d8dde3] bg-white hover:border-[#c3ccd6]"
      }`}
    >
      <div className="text-[15px] font-semibold text-[#16202b]">{label}</div>
      <div className="mt-1 text-[13px] leading-[1.45] text-[#5d6772]">{description}</div>
    </button>
  );
}

function SectionToggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-3 rounded-full border border-[#d7dde4] bg-white px-4 py-2 text-[14px] font-medium text-[#24303b]">
      <input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ActionButton({
  children,
  variant = "default",
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "danger";
  onClick: () => void;
  className?: string;
}) {
  const baseClass = variant === "danger" ? "danger-button" : "pill-button";

  return (
    <button type="button" className={`${baseClass} ${className}`.trim()} onClick={onClick}>
      {children}
    </button>
  );
}

function CommercialMetricCard({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className={`rounded-[18px] border p-4 ${accent ? "border-[#f1d1d1] bg-[#fff7f7]" : "border-[#dde3e8] bg-white"}`}>
      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">{label}</div>
      <div className={`mt-2 text-[24px] font-semibold tracking-[-0.03em] ${accent ? "text-[#b00000]" : "text-[#16202b]"}`}>{value}</div>
      <div className="mt-1 text-[13px] text-[#60707f]">{note}</div>
    </div>
  );
}

function RowActions({
  rowNumber,
  totalRows,
  onMoveUp,
  onMoveDown,
  onMoveTo,
  onDuplicate,
  onRemove,
}: {
  rowNumber: number;
  totalRows: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveTo: (targetPosition: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [targetRow, setTargetRow] = useState(String(rowNumber));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton onClick={onMoveUp}>Up</ActionButton>
      <ActionButton onClick={onMoveDown}>Down</ActionButton>
      <label className="builder-inline-select min-w-[104px]">
        <span>Move to</span>
        <input value={targetRow} onChange={(e) => setTargetRow(e.target.value)} />
      </label>
      <ActionButton onClick={() => onMoveTo(parseNumber(targetRow) || rowNumber)}>Go</ActionButton>
      <ActionButton onClick={onDuplicate}>Duplicate</ActionButton>
      <ActionButton variant="danger" onClick={onRemove}>Remove</ActionButton>
      <span className="text-[12px] text-[#7a8793]">Row {rowNumber} of {totalRows}</span>
    </div>
  );
}

const accessoryMap: Record<string, string[]> = {
  "Performance G3": ["perf-pipe-adapter", "cable-50m", "non-pen-mount"],
  "Standard V4": ["pipe-adapter", "cable-50m", "non-pen-mount"],
  "Mini G1": ["mini-pole-mount", "savage-case", "cable-50m"],
};

const servicePresetTemplates: Array<{ key: string; label: string; description: string; category: ServiceCategory; stage: ServiceStage; unitPrice: number }> = [
  {
    key: "site-budgetary",
    label: "Site inspection — budgetary",
    description: "Site inspection budgetary allowance before site walk",
    category: "site_inspection",
    stage: "budgetary",
    unitPrice: 850,
  },
  {
    key: "site-final",
    label: "Site inspection — final",
    description: "Site inspection final pricing after scope is confirmed",
    category: "site_inspection",
    stage: "final",
    unitPrice: 1250,
  },
  {
    key: "install-budgetary",
    label: "Installation — budgetary",
    description: "Installation budgetary estimate before site inspection",
    category: "installation",
    stage: "budgetary",
    unitPrice: 3500,
  },
  {
    key: "install-final",
    label: "Installation — final",
    description: "Installation final pricing after site inspection",
    category: "installation",
    stage: "final",
    unitPrice: 0,
  },
];

function serviceAgreementRateBasisLabel(rateBasis: ServiceAgreementRateBasis) {
  if (rateBasis === "standard") return "Standard";
  if (rateBasis === "non_standard") return "Non-standard";
  return "N/A";
}

function serviceAgreementCategoryTone(rateBasis: ServiceAgreementRateBasis) {
  if (rateBasis === "standard") return "border-[#d9eadb] bg-[#f5fbf6]";
  if (rateBasis === "non_standard") return "border-[#f0ddc0] bg-[#fff8ef]";
  return "border-[#e2e7ec] bg-[#fbfcfe]";
}

const majorProjectBucketOptions: Array<{ value: MajorProjectSimpleBucket; label: string; note: string }> = [
  { value: "mrr", label: "MRR", note: "Primary recurring service" },
  { value: "hardware", label: "Hardware", note: "Section B one-time hardware" },
  { value: "install", label: "Install", note: "Section C one-time install" },
  { value: "other_vendor", label: "Other vendor", note: "Recurring vendor pass-through" },
  { value: "support_recurring", label: "Support recurring", note: "Recurring support/program cost" },
  { value: "other_recurring", label: "Other recurring", note: "Recurring allowance or other service" },
];

const majorProjectVendorOptions = [
  "Ilios-Integrators",
  "Anixter Inc.",
  "Easy Up",
] as const;

const majorProjectManufacturerOptions = [
  "SpaceX",
  "RAD",
  "Ubiquiti",
  "Axis",
] as const;

const MAJOR_PROJECT_CUSTOM_OPTION = "Custom";

function resolvePresetOrCustomSelection(value: string | undefined, presets: readonly string[]) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed === MAJOR_PROJECT_CUSTOM_OPTION) return MAJOR_PROJECT_CUSTOM_OPTION;
  return presets.includes(trimmed) ? trimmed : MAJOR_PROJECT_CUSTOM_OPTION;
}

function majorProjectBucketLabel(bucket: MajorProjectSimpleBucket) {
  return majorProjectBucketOptions.find((option) => option.value === bucket)?.label ?? bucket;
}

function majorProjectVendorQuoteSchedule(bucket: MajorProjectSimpleBucket): MajorProjectComponent["schedule"] {
  return bucket === "hardware" || bucket === "install" ? "one_time" : "recurring";
}

function majorProjectVendorQuoteLineType(bucket: MajorProjectSimpleBucket): MajorProjectComponent["lineType"] {
  switch (bucket) {
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

function createMajorProjectVendorQuoteSourceText(vendorName: string | undefined, quoteLabel: string, rowNumber: number | undefined) {
  return [
    `Vendor quote source: ${vendorName ? `${vendorName} - ` : ""}${quoteLabel}`,
    rowNumber ? `source row ${rowNumber}` : null,
  ].filter(Boolean).join(" | ");
}

function AddressEditor({
  title,
  address,
  onChange,
  disabled = false,
}: {
  title: string;
  address: AddressBlock;
  onChange: (next: AddressBlock) => void;
  disabled?: boolean;
}) {
  const updateLine = (index: number, value: string) => {
    const nextLines = [...address.lines];
    nextLines[index] = value;
    onChange({ ...address, lines: nextLines });
  };

  return (
    <div className={`space-y-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4 ${disabled ? "opacity-65" : ""}`}>
      <div>
        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Address block</div>
        <div className="mt-1 text-[18px] font-semibold text-[#16202b]">{title}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="builder-field compact md:col-span-2"><span>Company</span><input disabled={disabled} value={address.companyName ?? ""} onChange={(e) => onChange({ ...address, companyName: e.target.value })} /></label>
        <label className="builder-field compact md:col-span-2"><span>Attention</span><input disabled={disabled} value={address.attention ?? ""} onChange={(e) => onChange({ ...address, attention: e.target.value })} /></label>
        <label className="builder-field compact md:col-span-2"><span>Address line 1</span><input disabled={disabled} value={address.lines[0] ?? ""} onChange={(e) => updateLine(0, e.target.value)} /></label>
        <label className="builder-field compact md:col-span-2"><span>Address line 2</span><input disabled={disabled} value={address.lines[1] ?? ""} onChange={(e) => updateLine(1, e.target.value)} /></label>
        <label className="builder-field compact md:col-span-2"><span>Address line 3</span><input disabled={disabled} value={address.lines[2] ?? ""} onChange={(e) => updateLine(2, e.target.value)} /></label>
      </div>
    </div>
  );
}

function majorProjectSectionTone(hasErrors: boolean, hasWarnings: boolean) {
  if (hasErrors) return "border-[#f0c7cf] bg-[#fff5f7] text-[#7a042e]";
  if (hasWarnings) return "border-[#f2ddba] bg-[#fff9ef] text-[#7a4b00]";
  return "border-[#dbe7df] bg-[#f5fbf6] text-[#215a36]";
}

function createMajorProjectComponentDraft(index: number, bundleId = ""): MajorProjectComponent {
  return {
    id: `major-component-${Date.now()}-${index}`,
    internalName: `Component ${index}`,
    customerFacingLabel: "",
    imageUrl: undefined,
    specSheetLabel: "",
    specSheetLocation: "",
    specSheetAttachment: undefined,
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
    bundleAssignmentId: bundleId,
    notes: "",
  };
}

function isMajorProjectHardwareComponent(component: MajorProjectComponent) {
  return component.schedule !== "recurring" && ["hardware", "shipping", "tax"].includes(component.lineType);
}

function createMajorProjectBundleDraft(index: number): MajorProjectBundle {
  return {
    id: `major-bundle-${Date.now()}-${index}`,
    internalName: `Bundle ${index}`,
    customerFacingLabel: `Customer bundle ${index}`,
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

function createMajorProjectQuoteLineDraft(index: number): MajorProjectCustomerQuoteLine {
  return {
    id: `major-quote-line-${Date.now()}-${index}`,
    lineItemNumber: index,
    label: `Quote line ${index}`,
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

function createMajorProjectSimpleRowDraft(index: number): MajorProjectSimpleRow {
  return {
    id: `major-simple-row-${Date.now()}-${index}`,
    label: `Line item ${index}`,
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

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

function formatAttachmentUpdatedAt(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function countMajorProjectSpecAttachmentReferences(quote: QuoteRecord, storageKey: string) {
  let total = 0;

  for (const attachment of quote.majorProject?.summary?.systemDrawings ?? []) {
    if (attachment.storageKey === storageKey) total += 1;
  }

  for (const option of quote.majorProject?.options ?? []) {
    for (const component of option.components ?? []) {
      if (component.specSheetAttachment?.storageKey === storageKey) total += 1;
    }

    for (const row of option.simpleRows ?? []) {
      if (row.specSheetAttachment?.storageKey === storageKey) total += 1;
    }

    for (const bundle of option.bundles ?? []) {
      if (bundle.specSheetAttachment?.storageKey === storageKey) total += 1;
    }

    for (const line of option.customerQuoteLines ?? []) {
      if (line.specSheetAttachment?.storageKey === storageKey) total += 1;
    }
  }

  return total;
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function MajorProjectSpecAttachmentField({
  itemId,
  attachment,
  specSheetLabel,
  onAttachmentChange,
  onSpecSheetLabelChange,
}: {
  itemId: string;
  attachment: MajorProjectSpecAttachment | undefined;
  specSheetLabel: string | undefined;
  onAttachmentChange: (attachment: MajorProjectSpecAttachment | undefined) => void;
  onSpecSheetLabelChange?: (value: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const inputId = `major-project-spec-${itemId}`;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    setError("");
    setIsSaving(true);

    try {
      const nextAttachment = await persistMajorProjectSpecAttachmentFile(file, createMajorProjectSpecAttachmentStorageKey(itemId));
      onAttachmentChange(nextAttachment);

      if (onSpecSheetLabelChange && !specSheetLabel?.trim()) {
        onSpecSheetLabelChange(stripFileExtension(file.name));
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the attachment.");
    } finally {
      setIsSaving(false);
      setIsDragging(false);
    }
  };

  return (
    <div className="mt-3 rounded-[18px] border border-[#d8e0e8] bg-[#f8fbfd] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-[#16202b]">Spec sheet attachment</div>
          <div className="mt-1 text-[12px] text-[#60707f]">Stored on this exact item for later proposal assembly.</div>
        </div>
        {attachment ? <button type="button" className="rounded-full border border-[#d5dde6] bg-white px-3 py-1 text-[12px] font-semibold text-[#334150]" onClick={() => { setError(""); onAttachmentChange(undefined); }}>Remove file</button> : null}
      </div>
      <label
        htmlFor={inputId}
        className={`mt-3 block cursor-pointer rounded-[18px] border border-dashed bg-white px-4 py-4 text-left transition ${isDragging ? "border-[#2f6fed] bg-[#edf4ff]" : "border-[#cfd7e0]"}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isSaving) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (isSaving) return;
          void handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          id={inputId}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <span className="block text-[14px] font-semibold text-[#17212c]">{isSaving ? "Saving attachment..." : "Drag and drop a PDF spec sheet here"}</span>
        <span className="mt-1 block text-[12px] text-[#60707f]">Or click to choose a PDF file up to {formatAttachmentSize(MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES)}.</span>
        {attachment ? (
          <span className="mt-3 block rounded-[14px] border border-[#e4ebf2] bg-[#f8fbfd] px-3 py-3 text-[12px] text-[#334150]">
            <strong className="block text-[13px] text-[#16202b]">{attachment.fileName}</strong>
            <span className="mt-1 block">{formatAttachmentSize(attachment.sizeBytes)}{attachment.mimeType ? ` • ${attachment.mimeType}` : ""}</span>
            {formatAttachmentUpdatedAt(attachment.updatedAt) ? <span className="mt-1 block">Saved {formatAttachmentUpdatedAt(attachment.updatedAt)}</span> : null}
          </span>
        ) : null}
      </label>
      {error ? <div className="mt-2 text-[12px] text-[#b42318]">{error}</div> : null}
    </div>
  );
}

function MajorProjectSystemDrawingsField({
  attachments,
  onChange,
}: {
  attachments: MajorProjectSpecAttachment[];
  onChange: (attachments: MajorProjectSpecAttachment[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const inputId = "major-project-system-drawings";

  const handleFiles = async (fileList: FileList | File[] | null | undefined) => {
    const files = Array.from(fileList ?? []).filter(Boolean);
    if (!files.length) return;

    setError("");
    setIsSaving(true);

    try {
      const nextAttachments: MajorProjectSpecAttachment[] = [];
      for (const file of files) {
        const nextAttachment = await persistMajorProjectSpecAttachmentFile(
          file,
          createMajorProjectSpecAttachmentStorageKey(`system-drawing-${file.name}`),
        );
        nextAttachments.push(nextAttachment);
      }
      onChange([...attachments, ...nextAttachments]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the drawing attachment.");
    } finally {
      setIsSaving(false);
      setIsDragging(false);
    }
  };

  return (
    <div className="mt-3 rounded-[18px] border border-[#d8e0e8] bg-[#f8fbfd] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-[#16202b]">System drawings</div>
          <div className="mt-1 text-[12px] text-[#60707f]">Attach proposal-level drawing images here. They will render before spec sheets in proposal output.</div>
        </div>
      </div>
      <label
        htmlFor={inputId}
        className={`mt-3 block cursor-pointer rounded-[18px] border border-dashed bg-white px-4 py-4 text-left transition ${isDragging ? "border-[#2f6fed] bg-[#edf4ff]" : "border-[#cfd7e0]"}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isSaving) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (isSaving) return;
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          id={inputId}
          type="file"
          accept=".png,.jpg,.jpeg,.gif,.webp,image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <span className="block text-[14px] font-semibold text-[#17212c]">{isSaving ? "Saving drawings..." : "Drag and drop drawing images here"}</span>
        <span className="mt-1 block text-[12px] text-[#60707f]">Or click to choose image files up to {formatAttachmentSize(MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES)} each.</span>
      </label>
      {attachments.length ? (
        <div className="mt-3 space-y-2">
          {attachments.map((attachment) => (
            <div key={attachment.storageKey} className="rounded-[14px] border border-[#e4ebf2] bg-white px-3 py-3 text-[12px] text-[#334150]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong className="block text-[13px] text-[#16202b]">{attachment.fileName}</strong>
                  <span className="mt-1 block">{formatAttachmentSize(attachment.sizeBytes)}{attachment.mimeType ? ` • ${attachment.mimeType}` : ""}</span>
                  {formatAttachmentUpdatedAt(attachment.updatedAt) ? <span className="mt-1 block">Saved {formatAttachmentUpdatedAt(attachment.updatedAt)}</span> : null}
                </div>
                <button type="button" className="rounded-full border border-[#d5dde6] bg-white px-3 py-1 text-[12px] font-semibold text-[#334150]" onClick={() => onChange(attachments.filter((entry) => entry.storageKey !== attachment.storageKey))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <div className="mt-2 text-[12px] text-[#b42318]">{error}</div> : null}
    </div>
  );
}

function MajorProjectStepCard({
  step,
  title,
  summary,
  detail,
  status,
  count,
  optional = false,
  onOpen,
  children,
}: {
  step: string;
  title: string;
  summary: string;
  detail: string;
  status: MajorProjectStepStatus;
  count: number;
  optional?: boolean;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const isCurrent = status === "current";
  const isLocked = status === "locked";
  const toneClass = isCurrent
    ? "major-project-step-card-current"
    : isLocked
      ? "major-project-step-card-locked"
      : "major-project-step-card-complete";
  const statusLabel = isCurrent ? "Now" : isLocked ? "Locked" : optional ? "Optional" : "Done";
  const actionLabel = isLocked ? "Finish earlier step first" : optional ? "Open optional step" : "View step";

  return (
    <section className={`major-project-step-card ${toneClass}`}>
      <div className="major-project-step-card-head">
        <div>
          <div className="major-project-step-label-row">
            <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Step {step}</div>
            {optional ? <span className="major-project-step-optional">Optional</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h4 className="text-[18px] font-semibold tracking-[-0.03em] text-[#16202b]">{title}</h4>
            <span className={`major-project-step-badge ${isCurrent ? "major-project-step-badge-current" : isLocked ? "major-project-step-badge-locked" : "major-project-step-badge-complete"}`}>
              {statusLabel}
            </span>
            <span className="major-project-step-count">{count} item{count === 1 ? "" : "s"}</span>
          </div>
          <p className="mt-2 text-[13px] text-[#44515d]">{summary}</p>
          <p className="mt-1 text-[12px] leading-[1.55] text-[#708090]">{detail}</p>
        </div>
        {!isCurrent ? (
          <button type="button" className="pill-button self-start" onClick={onOpen} disabled={isLocked}>
            {actionLabel}
          </button>
        ) : null}
      </div>
      {isCurrent ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function WorkflowSummaryStat({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "neutral" | "success" | "warn";
}) {
  const toneClass = tone === "success"
    ? "border-[#d7e3db] bg-[#f7fcf8]"
    : tone === "warn"
      ? "border-[#f2d3b5] bg-[#fff8ef]"
      : "border-[#d7e0e8] bg-white";

  return (
    <div className={`rounded-[12px] border px-3 py-3 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">{label}</div>
      <div className="mt-2 text-[20px] font-semibold text-[#16202b]">{value}</div>
      <div className="mt-1 text-[12px] text-[#435262]">{detail}</div>
    </div>
  );
}

export default function QuotePreview() {
  const { user } = useAuth();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [quote, setQuote] = useState<QuoteRecord>(createBlankQuoteRecord());
  const [activeProposal, setActiveProposal] = useState<SavedProposalRecord | null>(null);
  const [customerProfiles, setCustomerProfiles] = useState<SavedCustomerProfile[]>([]);
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState("");
  const [autoUpdateCustomerProfile, setAutoUpdateCustomerProfile] = useState(false);
  const [customerEntryMode, setCustomerEntryMode] = useState<CustomerEntryMode>("start");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentCategoryFilter, setEquipmentCategoryFilter] = useState("All");
  const [customEquipmentDraft, setCustomEquipmentDraft] = useState<EquipmentDraft>(emptyEquipmentDraft);
  const [customSectionFields, setCustomSectionFields] = useState<CustomSectionField[]>(createBlankQuoteRecord().customFields ?? []);
  const [dataQuickAddValue, setDataQuickAddValue] = useState("1");
  const [dataQuickAddUnit, setDataQuickAddUnit] = useState<DataQuickAddUnit>("TB");
  const [majorProjectEditorTab, setMajorProjectEditorTab] = useState<MajorProjectEditorTab>("components");
  const [majorProjectComponentSearch, setMajorProjectComponentSearch] = useState("");
  const [majorProjectComponentScheduleFilter, setMajorProjectComponentScheduleFilter] = useState<MajorProjectScheduleFilter>("all");
  const [majorProjectBundleSearch, setMajorProjectBundleSearch] = useState("");
  const [majorProjectQuoteLineSearch, setMajorProjectQuoteLineSearch] = useState("");
  const [majorProjectComponentBundleDraft, setMajorProjectComponentBundleDraft] = useState<MajorProjectComponentBundleDraft | null>(null);
  const [isMajorProjectBomDragging, setIsMajorProjectBomDragging] = useState(false);
  const [majorProjectBomCaptureError, setMajorProjectBomCaptureError] = useState<MajorProjectBomCaptureError | null>(null);
  const [showMajorProjectBomColumnMapping, setShowMajorProjectBomColumnMapping] = useState(false);
  const [isMajorProjectVendorQuoteDragging, setIsMajorProjectVendorQuoteDragging] = useState(false);
  const [majorProjectVendorQuoteCaptureError, setMajorProjectVendorQuoteCaptureError] = useState<MajorProjectVendorQuoteCaptureError | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [majorProjectImportedMarginPercent, setMajorProjectImportedMarginPercent] = useState(String(DEFAULT_IMPORTED_MARGIN_PERCENT));

  useEffect(() => {
    const activeProposalId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
    const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const fallbackStore = getDefaultProposalStore(createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }));
    const sessionUser = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.title,
          team: user.team,
        }
      : fallbackStore.currentUser;

    const baseStore = savedStore
      ? {
          ...savedStore,
          currentUser: sessionUser,
        }
      : {
          ...fallbackStore,
          currentUser: sessionUser,
        };
    const store = ensureNickTrainingDemoProposalStore(baseStore);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(store));

    const searchParams = new URLSearchParams(window.location.search);
    const requestedProposalId = searchParams.get("proposalId");
    const savedQuote = deserializeQuoteRecord(
      window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY) ?? window.localStorage.getItem(PROPOSAL_STORAGE_FALLBACK_KEY),
    );
    const savedCustomerProfiles = ensureNickTrainingDemoProfiles(deserializeCustomerProfiles(
      window.localStorage.getItem(CUSTOMER_PROFILE_STORE_KEY) ?? window.localStorage.getItem(CUSTOMER_PROFILE_STORE_FALLBACK_KEY),
    ));
    window.localStorage.setItem(CUSTOMER_PROFILE_STORE_KEY, serializeCustomerProfiles(savedCustomerProfiles));
    const forceNewDraft = searchParams.get("mode") === "new";
    const entryIntent = (searchParams.get("entry") as EntryIntent) ?? null;
    const requestedCustomerProfileId = searchParams.get("customerProfileId");
    const requestedCustomerProfile = requestedCustomerProfileId
      ? savedCustomerProfiles.find((profile) => profile.id === requestedCustomerProfileId) ?? null
      : null;
    const matchedProposal = forceNewDraft
      ? null
      : getActiveProposal(store, requestedProposalId ?? activeProposalId ?? savedQuote?.internal?.savedProposalId ?? savedQuote?.internal?.quoteId ?? null);
    const resolvedQuote = forceNewDraft
      ? createBlankQuoteRecord()
      : resolvePreferredQuote({
        savedQuote,
        activeProposal: matchedProposal,
        fallbackQuote: createBlankQuoteRecord(),
      }).quote;
    const nextQuote = ensureMajorProjectState(cloneQuote(resolvedQuote));

    if (requestedCustomerProfile) {
      applyCustomerProfileToQuote(nextQuote, requestedCustomerProfile);
    }

    if (entryIntent === "major-project" || entryIntent === "major-project-select-customer") {
      nextQuote.metadata.workflowMode = "major_project";
      if (nextQuote.majorProject) {
        nextQuote.majorProject.enabled = true;
      }
    }

    if (forceNewDraft) {
      window.localStorage.removeItem(ACTIVE_PROPOSAL_ID_KEY);
    } else if (matchedProposal) {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, matchedProposal.id);
    }

    persistQuoteRecord(nextQuote);

    setActiveProposal(matchedProposal);
    setQuote(nextQuote);
    setCustomSectionFields(nextQuote.customFields ?? []);
    setCustomerProfiles(savedCustomerProfiles);
    setSelectedCustomerProfileId(requestedCustomerProfile?.id ?? nextQuote.internal.savedCustomerProfileId ?? "");
    setCustomerEntryMode(requestedCustomerProfile ? "review" : resolveCustomerEntryMode({
      intent: entryIntent,
      hasCustomer: Boolean(nextQuote.customer.name.trim()),
      savedProfileCount: savedCustomerProfiles.length,
    }));
    setIsHydrated(true);
  }, [user]);

  useEffect(() => {
    if (!selectedCustomerProfileId) {
      setAutoUpdateCustomerProfile(false);
    }
  }, [selectedCustomerProfileId]);

  const currencyCode = quote.metadata.currencyCode || "USD";
  const workflowMode = quote.metadata.workflowMode ?? "quick_quote";
  const isMajorProject = workflowMode === "major_project";
  const majorProjectState = ensureMajorProjectState(quote).majorProject;
  const activeMajorOption = getActiveMajorProjectOption(ensureMajorProjectState(quote));
  const activeSectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;

  const recurringMonthlyTotal = useMemo(() => Number(activeSectionARows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2)), [activeSectionARows]);
  const equipmentTotal = useMemo(() => Number(quote.sections.sectionB.lineItems.reduce((sum, row) => sum + (row.totalPrice ?? row.quantity * row.unitPrice), 0).toFixed(2)), [quote.sections.sectionB.lineItems]);
  const sectionCTotal = useMemo(() => Number(quote.sections.sectionC.lineItems.reduce((sum, row) => sum + row.totalPrice, 0).toFixed(2)), [quote.sections.sectionC.lineItems]);

  const selectedLeaseTerm = quote.metadata.leaseTermMonths ?? 12;
  const hasActiveDataAgreement = quote.metadata.hasActiveDataAgreement ?? false;
  const leaseMarginPercent = quote.metadata.leaseMarginPercent ?? 35;

  const leaseMarginAmount = useMemo(() => {
    if (quote.metadata.quoteType !== "lease" || !isMajorProject) return 0;
    return Number((equipmentTotal * (leaseMarginPercent / 100)).toFixed(2));
  }, [equipmentTotal, isMajorProject, leaseMarginPercent, quote.metadata.quoteType]);

  const leaseEquipmentBase = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    return Number((equipmentTotal + leaseMarginAmount).toFixed(2));
  }, [equipmentTotal, leaseMarginAmount, quote.metadata.quoteType]);

  const leaseEquipmentMonthly = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    return Number((leaseEquipmentBase / selectedLeaseTerm).toFixed(2));
  }, [leaseEquipmentBase, quote.metadata.quoteType, selectedLeaseTerm]);

  const leaseMonthly = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    if (!hasActiveDataAgreement) return 0;
    return Number((recurringMonthlyTotal + leaseEquipmentMonthly).toFixed(2));
  }, [hasActiveDataAgreement, leaseEquipmentMonthly, quote.metadata.quoteType, recurringMonthlyTotal]);

  const commercialMetrics = useMemo(() => buildCommercialMetrics(quote), [quote]);
  const majorProjectMetrics = useMemo(() => buildMajorProjectMetrics(quote), [quote]);
  const majorProjectTermMonths = useMemo(() => majorProjectContractMonths(majorProjectMetrics.termMonths), [majorProjectMetrics.termMonths]);
  const executiveSummaryEditorBlocks = useMemo(() => normalizeExecutiveSummaryBlocks(quote.executiveSummary), [quote.executiveSummary]);
  const executiveSummaryRenderBlocks = useMemo(() => buildExecutiveSummaryRenderBlocks(quote.executiveSummary), [quote.executiveSummary]);
  const majorProjectHasBlockingErrors = isMajorProject && majorProjectMetrics.validation.errorCount > 0;
  const majorProjectBlockingIssues = useMemo(
    () => majorProjectMetrics.validation.issues.filter((issue) => issue.severity === "error"),
    [majorProjectMetrics.validation.issues],
  );

  const equipmentCategories = useMemo(() => ["All", ...Array.from(new Set(equipmentCatalog.map((item) => item.category))).sort()], []);

  const filteredEquipmentCatalog = useMemo(() => {
    const search = equipmentSearch.trim().toLowerCase();
    return equipmentCatalog.filter((item) => {
      const matchesCategory = equipmentCategoryFilter === "All" || item.category === equipmentCategoryFilter;
      const haystack = [item.label, item.category, item.terminalType, item.description, item.partNumber].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [equipmentCategoryFilter, equipmentSearch]);

  const contentPresence = useMemo(() => getQuoteContentPresence(quote), [quote]);
  const activeMajorOptionSimpleRows = useMemo(() => activeMajorOption?.simpleRows ?? [], [activeMajorOption]);
  const activeMajorOptionVendorQuotes = useMemo(() => activeMajorOption?.vendorQuotes ?? [], [activeMajorOption]);
  const activeMajorOptionComponents = useMemo(() => activeMajorOption?.components ?? [], [activeMajorOption]);
  const activeMajorOptionBundles = useMemo(() => activeMajorOption?.bundles ?? [], [activeMajorOption]);
  const activeMajorOptionQuoteLines = useMemo(() => activeMajorOption?.customerQuoteLines ?? [], [activeMajorOption]);
  const selectedMajorProjectBomSheet = useMemo(() => {
    const bomImport = majorProjectState.bomImport;
    if (!bomImport?.sheets?.length) return null;
    return bomImport.sheets.find((sheet) => sheet.name === bomImport.selectedSheetName) ?? bomImport.sheets[0] ?? null;
  }, [majorProjectState.bomImport]);
  const selectedMajorProjectBomHeaderRowIndex = useMemo(
    () => (selectedMajorProjectBomSheet ? resolveMajorProjectBomHeaderRow(selectedMajorProjectBomSheet) : -1),
    [selectedMajorProjectBomSheet],
  );
  const selectedMajorProjectBomHeaderCells = useMemo(
    () => (selectedMajorProjectBomSheet && selectedMajorProjectBomHeaderRowIndex >= 0
      ? selectedMajorProjectBomSheet.rows[selectedMajorProjectBomHeaderRowIndex]?.cells ?? []
      : []),
    [selectedMajorProjectBomSheet, selectedMajorProjectBomHeaderRowIndex],
  );
  const selectedMajorProjectBomColumnOptions = useMemo(() => {
    const sourceCells = selectedMajorProjectBomHeaderCells.length
      ? selectedMajorProjectBomHeaderCells
      : selectedMajorProjectBomSheet?.rows.reduce<string[]>(
          (widestRow, row) => (row.cells.length > widestRow.length ? row.cells : widestRow),
          [],
        ) ?? [];

    return sourceCells.map((cell, index) => ({
      value: index,
      label: cell.trim() || `Column ${index + 1}`,
    }));
  }, [selectedMajorProjectBomHeaderCells, selectedMajorProjectBomSheet]);
  const selectedMajorProjectBomReviewedColumnMap = useMemo<MajorProjectBomColumnMap>(() => {
    if (!selectedMajorProjectBomSheet) return {};
    const detectedMap = selectedMajorProjectBomHeaderCells.length ? resolveMajorProjectBomColumnMap(selectedMajorProjectBomHeaderCells) : {};
    const reviewedMap = majorProjectState.bomImport?.reviewedColumnMapBySheet?.[selectedMajorProjectBomSheet.name] ?? {};
    return {
      ...detectedMap,
      ...reviewedMap,
    };
  }, [majorProjectState.bomImport?.reviewedColumnMapBySheet, selectedMajorProjectBomHeaderCells, selectedMajorProjectBomSheet]);
  const selectedMajorProjectBomDetectedFieldLabels = useMemo(
    () => MAJOR_PROJECT_BOM_REVIEW_FIELDS
      .filter((field) => {
        const value = selectedMajorProjectBomReviewedColumnMap[field.key];
        return value !== undefined && value !== null;
      })
      .map((field) => field.label),
    [selectedMajorProjectBomReviewedColumnMap],
  );
  const shouldForceMajorProjectBomColumnMapping = selectedMajorProjectBomHeaderRowIndex === -1 || selectedMajorProjectBomDetectedFieldLabels.length === 0;
  const previewMajorProjectBomRows = useMemo(() => {
    if (!selectedMajorProjectBomSheet) return [];
    const startIndex = selectedMajorProjectBomHeaderRowIndex >= 0 ? selectedMajorProjectBomHeaderRowIndex : 0;
    return selectedMajorProjectBomSheet.rows.slice(startIndex, startIndex + MAJOR_PROJECT_BOM_PREVIEW_ROW_COUNT);
  }, [selectedMajorProjectBomHeaderRowIndex, selectedMajorProjectBomSheet]);
  const componentOptions = useMemo(() => activeMajorOptionComponents.map((component) => ({
    id: component.id,
    label: component.internalName || component.customerFacingLabel || component.id,
  })), [activeMajorOptionComponents]);
  const bundleOptions = useMemo(() => activeMajorOptionBundles.map((bundle) => ({
    id: bundle.id,
    label: bundle.customerFacingLabel || bundle.internalName || bundle.id,
  })), [activeMajorOptionBundles]);
  const filteredMajorProjectComponents = useMemo(() => {
    const search = normalizeSearchValue(majorProjectComponentSearch);
    return activeMajorOptionComponents.filter((component) => {
      const matchesSchedule = majorProjectComponentScheduleFilter === "all" || component.schedule === majorProjectComponentScheduleFilter;
      const haystack = [
        component.internalName,
        component.customerFacingLabel,
        component.vendor,
        component.manufacturer,
        component.lineType,
        component.bundleAssignmentId,
        component.notes,
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesSchedule && matchesSearch;
    });
  }, [activeMajorOptionComponents, majorProjectComponentScheduleFilter, majorProjectComponentSearch]);
  const filteredMajorProjectBundles = useMemo(() => {
    const search = normalizeSearchValue(majorProjectBundleSearch);
    return activeMajorOptionBundles.filter((bundle) => {
      const haystack = [bundle.internalName, bundle.customerFacingLabel, bundle.category, bundle.description].filter(Boolean).join(" ").toLowerCase();
      return !search || haystack.includes(search);
    });
  }, [activeMajorOptionBundles, majorProjectBundleSearch]);
  const filteredMajorProjectQuoteLines = useMemo(() => {
    const search = normalizeSearchValue(majorProjectQuoteLineSearch);
    return activeMajorOptionQuoteLines.filter((line) => {
      const haystack = [line.label, line.description, line.presentationCategory, line.schedule].filter(Boolean).join(" ").toLowerCase();
      return !search || haystack.includes(search);
    });
  }, [activeMajorOptionQuoteLines, majorProjectQuoteLineSearch]);
  useEffect(() => {
    setMajorProjectComponentBundleDraft((current) => {
      if (!current) return null;

      const availableIds = new Set(activeMajorOptionComponents.map((component) => component.id));
      if (!availableIds.has(current.sourceComponentId)) return null;

      const selectedComponentIds = Array.from(new Set([
        current.sourceComponentId,
        ...current.selectedComponentIds.filter((componentId) => availableIds.has(componentId)),
      ]));

      if (
        selectedComponentIds.length === current.selectedComponentIds.length
        && selectedComponentIds.every((componentId, index) => componentId === current.selectedComponentIds[index])
      ) {
        return current;
      }

      return {
        ...current,
        selectedComponentIds,
      };
    });
  }, [activeMajorOptionComponents]);
  useEffect(() => {
    if (shouldForceMajorProjectBomColumnMapping) {
      setShowMajorProjectBomColumnMapping(true);
    }
  }, [shouldForceMajorProjectBomColumnMapping, selectedMajorProjectBomSheet?.name]);
  const majorProjectVendorMarginCards = useMemo(() => majorProjectMetrics.vendorSummary.map((vendor) => {
    const revenue = vendor.oneTimeRevenue + vendor.recurringRevenue;
    const cost = vendor.oneTimeCost + vendor.recurringCost;
    return {
      key: `${vendor.vendor}-${vendor.manufacturer ?? ""}`,
      label: vendor.vendor || "Unassigned vendor",
      note: vendor.manufacturer || "Vendor bucket",
      revenue,
      cost,
      grossProfit: revenue - cost,
      grossMarginPercent: majorProjectMarginPercent(revenue, cost),
    };
  }).sort((a, b) => b.revenue - a.revenue), [majorProjectMetrics.vendorSummary]);
  const majorProjectBundleMarginCards = useMemo(() => majorProjectMetrics.bundles.map((bundle) => {
    const revenue = bundle.oneTimeRevenue + bundle.recurringRevenue;
    const cost = bundle.oneTimeCost + bundle.recurringCost;
    return {
      key: bundle.id,
      label: bundle.internalName || bundle.customerFacingLabel || bundle.id,
      note: `${bundle.resolvedComponentIds.length} mapped component${bundle.resolvedComponentIds.length === 1 ? "" : "s"}`,
      revenue,
      cost,
      grossProfit: revenue - cost,
      grossMarginPercent: majorProjectMarginPercent(revenue, cost),
    };
  }).sort((a, b) => b.revenue - a.revenue), [majorProjectMetrics.bundles]);
  const majorProjectQuoteLineMarginCards = useMemo(() => majorProjectMetrics.customerQuoteLines.map((line) => {
    const revenue = line.oneTimeRevenue + line.recurringRevenue;
    const cost = line.oneTimeCost + line.recurringCost;
    return {
      key: line.id,
      label: line.label || line.id,
      note: `${line.resolvedBundleIds.length} bundle${line.resolvedBundleIds.length === 1 ? "" : "s"} feeding downstream`,
      revenue,
      cost,
      grossProfit: revenue - cost,
      grossMarginPercent: majorProjectMarginPercent(revenue, cost),
    };
  }).sort((a, b) => b.revenue - a.revenue), [majorProjectMetrics.customerQuoteLines]);
  const majorProjectSimpleBucketSummary = useMemo(() => {
    return activeMajorOptionSimpleRows.reduce((summary, row) => {
      const current = summary[row.bucket] ?? { revenue: 0, cost: 0 };
      current.revenue += row.customerExtendedPrice;
      current.cost += row.ourExtendedCost;
      summary[row.bucket] = current;
      return summary;
    }, {} as Record<MajorProjectSimpleBucket, { revenue: number; cost: number }>);
  }, [activeMajorOptionSimpleRows]);
  const majorProjectUsesDirectComponentPath = majorProjectState.builderMode === "advanced"
    && activeMajorOptionComponents.length > 0
    && activeMajorOptionBundles.length === 0
    && activeMajorOptionQuoteLines.length === 0;
  const majorProjectPreviewCategorySummary = useMemo(() => {
    if (majorProjectMetrics.builderMode === "simple") {
      return {
        recurring: majorProjectMetrics.recurringRevenue,
        hardware: majorProjectMetrics.hardwareRevenue,
        services: majorProjectMetrics.installRevenue + majorProjectMetrics.otherOneTimeRevenue,
      };
    }
    if (majorProjectUsesDirectComponentPath) {
      return activeMajorOptionComponents.reduce((summary, component) => {
        const revenue = component.customerExtendedPrice;
        if (component.schedule === "recurring") summary.recurring += revenue;
        else if (isMajorProjectHardwareComponent(component)) summary.hardware += revenue;
        else summary.services += revenue;
        return summary;
      }, { recurring: 0, hardware: 0, services: 0 });
    }
    return majorProjectMetrics.customerQuoteLines.reduce((summary, line) => {
      const bucket = line.presentationCategory ?? "other";
      const revenue = line.oneTimeRevenue + line.recurringRevenue;
      if (bucket === "recurring") summary.recurring += revenue;
      else if (bucket === "hardware") summary.hardware += revenue;
      else summary.services += revenue;
      return summary;
    }, { recurring: 0, hardware: 0, services: 0 });
  }, [activeMajorOptionComponents, majorProjectMetrics.builderMode, majorProjectMetrics.customerQuoteLines, majorProjectMetrics.hardwareRevenue, majorProjectMetrics.installRevenue, majorProjectMetrics.otherOneTimeRevenue, majorProjectMetrics.recurringRevenue, majorProjectUsesDirectComponentPath]);
  const importedMajorProjectComponents = useMemo(
    () => activeMajorOptionComponents.filter((component) => (component.notes ?? "").startsWith(MAJOR_PROJECT_BOM_IMPORT_SOURCE_PREFIX)),
    [activeMajorOptionComponents],
  );
  const importedMajorProjectComponentIds = useMemo(
    () => new Set(importedMajorProjectComponents.map((component) => component.id)),
    [importedMajorProjectComponents],
  );
  const importedMajorProjectNeedsCustomerLabelCount = useMemo(
    () => importedMajorProjectComponents.filter((component) => !(component.customerFacingLabel ?? "").trim()).length,
    [importedMajorProjectComponents],
  );
  const importedMajorProjectNeedsCustomerPricingCount = useMemo(
    () => importedMajorProjectComponents.filter((component) => component.customerUnitPrice <= 0).length,
    [importedMajorProjectComponents],
  );
  const importedMajorProjectUnbundledCount = useMemo(
    () => importedMajorProjectComponents.filter((component) => !(component.bundleAssignmentId ?? "").trim()).length,
    [importedMajorProjectComponents],
  );
  const importedMajorProjectUnquotedCount = useMemo(
    () => majorProjectMetrics.validation.uncoveredComponentIds.filter((componentId) => importedMajorProjectComponentIds.has(componentId)).length,
    [importedMajorProjectComponentIds, majorProjectMetrics.validation.uncoveredComponentIds],
  );
  const importedMajorProjectWithVendorCostCount = useMemo(
    () => importedMajorProjectComponents.filter((component) => component.vendorUnitCost > 0).length,
    [importedMajorProjectComponents],
  );
  const importedMajorProjectWithCustomerPricingCount = useMemo(
    () => importedMajorProjectComponents.filter((component) => component.customerUnitPrice > 0).length,
    [importedMajorProjectComponents],
  );
  const importedMajorProjectNeedsReviewCount = useMemo(
    () => importedMajorProjectComponents.filter((component) => (
      !(component.customerFacingLabel ?? "").trim()
      || component.customerUnitPrice <= 0
      || majorProjectMetrics.validation.uncoveredComponentIds.includes(component.id)
    )).length,
    [importedMajorProjectComponents, majorProjectMetrics.validation.uncoveredComponentIds],
  );
  const importedMajorProjectNextActions = useMemo(() => {
    const actions: string[] = [];
    if (importedMajorProjectNeedsCustomerLabelCount > 0) {
      actions.push(`${importedMajorProjectNeedsCustomerLabelCount} imported item${importedMajorProjectNeedsCustomerLabelCount === 1 ? "" : "s"} still need customer-facing labels.`);
    }
    if (importedMajorProjectNeedsCustomerPricingCount > 0) {
      actions.push(`${importedMajorProjectNeedsCustomerPricingCount} imported item${importedMajorProjectNeedsCustomerPricingCount === 1 ? "" : "s"} still need customer sell pricing.`);
    }
    if (importedMajorProjectUnquotedCount > 0) {
      actions.push(`${importedMajorProjectUnquotedCount} imported component${importedMajorProjectUnquotedCount === 1 ? "" : "s"} are not yet flowing into direct output or quote lines.`);
    }
    if (actions.length === 0 && importedMajorProjectComponents.length > 0) {
      actions.push("Imported components are ready for direct output or optional packaging.");
    }
    return actions;
  }, [
    importedMajorProjectComponents.length,
    importedMajorProjectNeedsCustomerLabelCount,
    importedMajorProjectNeedsCustomerPricingCount,
    importedMajorProjectUnquotedCount,
  ]);
  const majorProjectBomInputId = "major-project-bom-import";
  const majorProjectVendorQuoteInputId = "major-project-vendor-quote-import";
  const hasComponentsStepContent = activeMajorOptionComponents.length > 0;
  const hasBundleStepContent = activeMajorOptionBundles.length > 0;
  const hasQuoteLineStepContent = activeMajorOptionQuoteLines.length > 0;
  const majorProjectCanSkipPackagingSteps = hasComponentsStepContent && majorProjectUsesDirectComponentPath;
  const bundleCoverageCount = majorProjectMetrics.bundles.filter((bundle) => bundle.resolvedComponentIds.length > 0).length;
  const presentedBundleCount = activeMajorOptionBundles.length - majorProjectMetrics.validation.unpresentedBundleIds.length;
  const componentsStepStatus: MajorProjectStepStatus = majorProjectEditorTab === "components" ? "current" : hasComponentsStepContent ? "complete" : "current";
  const bundlesStepStatus: MajorProjectStepStatus = !hasComponentsStepContent
    ? "locked"
    : majorProjectCanSkipPackagingSteps
      ? majorProjectEditorTab === "bundles"
        ? "current"
        : "complete"
    : majorProjectEditorTab === "bundles"
      ? "current"
      : hasBundleStepContent && bundleCoverageCount > 0
        ? "complete"
        : "current";
  const quoteLinesStepStatus: MajorProjectStepStatus = majorProjectCanSkipPackagingSteps
    ? majorProjectEditorTab === "quote_lines"
      ? "current"
      : "complete"
    : !majorProjectUsesDirectComponentPath && (!hasComponentsStepContent || !hasBundleStepContent || bundleCoverageCount === 0)
    ? "locked"
    : majorProjectEditorTab === "quote_lines"
      ? "current"
      : hasQuoteLineStepContent && presentedBundleCount > 0
        ? "complete"
        : "current";

  useEffect(() => {
    if (!isMajorProject) return;
    if (majorProjectEditorTab === "bundles" && !hasComponentsStepContent) {
      setMajorProjectEditorTab("components");
      return;
    }
    if (!majorProjectUsesDirectComponentPath && majorProjectEditorTab === "quote_lines" && (!hasComponentsStepContent || !hasBundleStepContent || bundleCoverageCount === 0)) {
      setMajorProjectEditorTab(hasComponentsStepContent ? "bundles" : "components");
    }
  }, [bundleCoverageCount, hasBundleStepContent, hasComponentsStepContent, isMajorProject, majorProjectEditorTab, majorProjectUsesDirectComponentPath]);

  const filteredSectionACatalog = useMemo(() => {
    return sectionACatalog.filter((item) => {
      if (quote.sections.sectionA.mode === "pool") {
        return item.category !== "Per Kit Data";
      }
      return item.category !== "Pool Plan" && item.category !== "Pool Overage";
    });
  }, [quote.sections.sectionA.mode]);

  const suggestedAccessories = useMemo(() => {
    const selectedTerminalTypes = Array.from(new Set(quote.sections.sectionB.lineItems.map((row) => row.terminalType).filter(Boolean))) as string[];
    const existingLabels = new Set(quote.sections.sectionB.lineItems.map((row) => row.itemName));

    return selectedTerminalTypes
      .flatMap((terminalType) => (accessoryMap[terminalType] ?? []).map((catalogId) => ({ terminalType, catalogId })))
      .filter(({ catalogId }, index, list) => list.findIndex((entry) => entry.catalogId === catalogId) === index)
      .map(({ terminalType, catalogId }) => ({ terminalType, item: equipmentCatalog.find((entry) => entry.id === catalogId) }))
      .filter((entry): entry is { terminalType: string; item: (typeof equipmentCatalog)[number] } => Boolean(entry.item))
      .filter(({ item }) => !existingLabels.has(item.label));
  }, [quote.sections.sectionB.lineItems]);

  const updateQuote = (updater: (current: QuoteRecord) => QuoteRecord) => setQuote((current) => ensureMajorProjectState(updater(cloneQuote(current))));

  const persistCustomerProfiles = (profiles: SavedCustomerProfile[]) => {
    if (typeof window !== "undefined") {
      const serializedProfiles = serializeCustomerProfiles(profiles);
      window.localStorage.setItem(CUSTOMER_PROFILE_STORE_KEY, serializedProfiles);
      window.localStorage.setItem(CUSTOMER_PROFILE_STORE_FALLBACK_KEY, serializedProfiles);
    }
    setCustomerProfiles(profiles);
  };

  const selectedCustomerProfile = useMemo(
    () => customerProfiles.find((profile) => profile.id === selectedCustomerProfileId) ?? null,
    [customerProfiles, selectedCustomerProfileId],
  );
  const releaseMajorProjectSpecAttachmentIfUnused = (attachment: MajorProjectSpecAttachment | undefined) => {
    if (!attachment) return;
    if (countMajorProjectSpecAttachmentReferences(quote, attachment.storageKey) > 1) return;
    void deleteMajorProjectSpecAttachmentFile(attachment.storageKey).catch(() => {});
  };
  const quoteServiceAgreementProfile = useMemo(
    () => normalizeServiceAgreementProfile(quote.serviceAgreement?.profile ?? createDefaultServiceAgreementProfile()),
    [quote.serviceAgreement],
  );
  const selectedCustomerServiceAgreement = useMemo(
    () => normalizeServiceAgreementProfile(selectedCustomerProfile?.serviceAgreementDefaults ?? createDefaultServiceAgreementProfile()),
    [selectedCustomerProfile],
  );
  const hasSelectedCustomerServiceAgreement = useMemo(
    () => selectedCustomerServiceAgreement.categories.some((category) => category.rateBasis !== "na" || category.laborRate !== null || category.mileageRate !== null || Boolean(category.notes?.trim())),
    [selectedCustomerServiceAgreement],
  );
  const activeServiceAgreementCategories = useMemo(
    () => quoteServiceAgreementProfile.categories.filter((category) => category.rateBasis !== "na" || category.laborRate !== null || category.mileageRate !== null || Boolean(category.notes?.trim())),
    [quoteServiceAgreementProfile],
  );
  const customerEntryComplete = customerEntryMode === "review" && Boolean(quote.customer.name.trim());
  const customerHeadline = quote.customer.name.trim() || quote.metadata.accountName?.trim() || "No customer selected";
  const customerSubline = compactList([
    quote.customer.contactName,
    quote.customer.contactEmail,
    quote.customer.contactPhone,
  ]).join(" • ");
  const customerServiceAddress = compactList(quote.customer.addressLines).join(", ");
  const builderLocked = !customerEntryComplete;
  const governanceState = useMemo(
    () => normalizeQuoteGovernanceState({
      metadata: quote.metadata,
      internal: quote.internal,
      governance: quote.governance,
    }),
    [quote.governance, quote.internal, quote.metadata],
  );
  const latestRevisionEntry = useMemo(
    () => quote.revisionHistory.at(-1) ?? null,
    [quote.revisionHistory],
  );
  const latestProposalActivity = useMemo(
    () => activeProposal?.activity?.at(-1) ?? null,
    [activeProposal?.activity],
  );
  const quoteLastTouchedLabel = useMemo(
    () => formatAttachmentUpdatedAt(activeProposal?.updatedAt ?? quote.metadata.lastTouchedAt ?? ""),
    [activeProposal?.updatedAt, quote.metadata.lastTouchedAt],
  );
  const proposalHeroSummary = compactList([
    customerEntryComplete ? quote.customer.name : "Finish customer intake",
    quote.metadata.proposalNumber,
    `Revision ${governanceState.revisionLabel}`,
  ]).join(" • ");
  const proposalHeroActionCopy = builderLocked
    ? "Finish customer intake first so Save, Preview, PDF, and workbook export can unlock."
    : "Save in the builder, then use Preview Proposal for the customer-facing document plus PDF and Approval Workbook exports.";
  const firstImportedMajorProjectCost = useMemo(
    () => importedMajorProjectComponents.find((component) => component.vendorUnitCost > 0)?.vendorUnitCost,
    [importedMajorProjectComponents],
  );
  const bomImportedPricingSummary = useMemo(
    () => buildMarginPricingSummary(firstImportedMajorProjectCost, parseNumber(majorProjectImportedMarginPercent), currencyCode),
    [currencyCode, firstImportedMajorProjectCost, majorProjectImportedMarginPercent],
  );
  const editorNeedsAttention = useMemo(() => {
    const items: string[] = [];

    if (quote.executiveSummary.enabled && !contentPresence.hasExecutiveSummaryContent) {
      items.push("Executive Summary is enabled but still has no customer-facing content.");
    }
    if (quote.sections.sectionB.enabled && !contentPresence.hasSectionBContent) {
      items.push("Hardware output is enabled but there are no live hardware rows yet.");
    }
    if (quote.sections.sectionC.enabled && !contentPresence.hasSectionCContent) {
      items.push("Install / site services are enabled but there are no live service rows yet.");
    }
    if (quote.warranty.enabled && !quote.warranty.manufacturerReference.trim() && !quote.warranty.coverageNote.trim()) {
      items.push("Warranty is enabled but still needs source text or coverage notes.");
    }
    if (quote.metadata.quoteType === "lease" && !hasActiveDataAgreement) {
      items.push("Lease pricing still needs an active data agreement before release.");
    }
    if (isMajorProject && majorProjectMetrics.validation.errorCount > 0) {
      items.push(`${majorProjectMetrics.validation.errorCount} Major Project validation issue${majorProjectMetrics.validation.errorCount === 1 ? "" : "s"} still block preview/export readiness.`);
    }
    if (isMajorProject && importedMajorProjectNeedsReviewCount > 0) {
      items.push(`${importedMajorProjectNeedsReviewCount} imported component${importedMajorProjectNeedsReviewCount === 1 ? "" : "s"} still need label, pricing, or output review.`);
    }

    return items;
  }, [
    contentPresence.hasExecutiveSummaryContent,
    contentPresence.hasSectionBContent,
    contentPresence.hasSectionCContent,
    hasActiveDataAgreement,
    importedMajorProjectNeedsReviewCount,
    isMajorProject,
    majorProjectMetrics.validation.errorCount,
    quote.executiveSummary.enabled,
    quote.metadata.quoteType,
    quote.sections.sectionB.enabled,
    quote.sections.sectionC.enabled,
    quote.warranty.coverageNote,
    quote.warranty.enabled,
    quote.warranty.manufacturerReference,
  ]);
  const outputReadiness = useMemo(() => {
    if (!customerEntryComplete) {
      return [
        { label: "Preview Proposal", state: "Locked", detail: "Finish customer intake to unlock the customer-facing preview." },
        { label: "PDF preview", state: "Locked", detail: "PDF export opens from Preview Proposal after the draft is ready." },
        { label: "Approval workbook", state: "Locked", detail: "Workbook export stays on hold until the quote can be saved and previewed." },
      ];
    }

    const previewBlocked = majorProjectHasBlockingErrors;
    return [
      {
        label: "Preview Proposal",
        state: previewBlocked ? "Blocked" : "Ready",
        detail: previewBlocked
          ? `${majorProjectMetrics.validation.errorCount} Major Project validation issue${majorProjectMetrics.validation.errorCount === 1 ? "" : "s"} still need cleanup.`
          : "Customer-facing proposal is ready to open from this draft.",
      },
      {
        label: "PDF preview",
        state: previewBlocked ? "Blocked" : "Ready",
        detail: previewBlocked
          ? "PDF stays blocked until the same preview blockers are cleared."
          : "PDF output uses the same proposal route as Preview Proposal.",
      },
      {
        label: "Approval workbook",
        state: previewBlocked ? "Needs fixes" : "Ready",
        detail: previewBlocked
          ? "Workbook export should wait until pricing and validation blockers are resolved."
          : "Approval workbook exports from Preview Proposal with the current quote math.",
      },
    ];
  }, [customerEntryComplete, majorProjectHasBlockingErrors, majorProjectMetrics.validation.errorCount]);

  const updateMajorProjectQuote = (updater: (draft: QuoteRecord) => QuoteRecord) => {
    updateQuote((current) => applyMajorProjectToQuote(updater(ensureMajorProjectState(current))));
  };

  const captureMajorProjectBomImport = async (file: File, source: "drop" | "picker") => {
    const validationError = validateMajorProjectBomFile(file);
    if (validationError) {
      setMajorProjectBomCaptureError({
        fileName: file.name,
        sizeBytes: file.size,
        extension: getFileExtension(file.name),
        mimeType: file.type || undefined,
        message: validationError,
        source,
      });
      setWorkflowNotice(validationError);
      return;
    }

    const capturedAt = new Date().toISOString();
    setMajorProjectBomCaptureError(null);
    setShowMajorProjectBomColumnMapping(false);
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject) return draft;
      draft.majorProject.bomImport = {
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || undefined,
        capturedAt,
        source,
        status: "reading",
        reviewState: "pending",
        sheetNames: [],
        sheets: [],
        selectedSheetName: undefined,
        readError: undefined,
        importedComponentCount: undefined,
        importedAt: undefined,
      };
      return draft;
    });

    try {
      const { sheetNames, sheets } = await readMajorProjectBomWorkbook(file);
      updateMajorProjectQuote((draft) => {
        if (!draft.majorProject) return draft;
        draft.majorProject.bomImport = {
          fileName: file.name,
          sizeBytes: file.size,
          mimeType: file.type || undefined,
          capturedAt,
          source,
          status: "loaded",
          reviewState: "pre_import_review",
          sheetNames,
          sheets,
          selectedSheetName: sheetNames[0] ?? undefined,
          readError: undefined,
          importedComponentCount: undefined,
          importedAt: undefined,
        };
        return draft;
      });
      setWorkflowNotice(sheetNames.length
        ? `Captured ${file.name} and found ${sheetNames.length} workbook tab${sheetNames.length === 1 ? "" : "s"}.`
        : `Captured ${file.name}, but no workbook tabs were detected.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read workbook.";
      updateMajorProjectQuote((draft) => {
        if (!draft.majorProject) return draft;
        draft.majorProject.bomImport = {
          fileName: file.name,
          sizeBytes: file.size,
          mimeType: file.type || undefined,
          capturedAt,
          source,
          status: "error",
          reviewState: "pending",
          sheetNames: [],
          sheets: [],
          selectedSheetName: undefined,
          readError: message,
          importedComponentCount: undefined,
          importedAt: undefined,
        };
        return draft;
      });
      setWorkflowNotice(`Captured ${file.name}, but RapidQuote could not read workbook tabs yet.`);
    }
  };

  const clearMajorProjectBomImport = () => {
    setMajorProjectBomCaptureError(null);
    setShowMajorProjectBomColumnMapping(false);
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject) return draft;
      draft.majorProject.bomImport = undefined;
      return draft;
    });
    setWorkflowNotice("Cleared the pending BOM workbook shell.");
  };

  const setMajorProjectBomSelectedSheet = (sheetName: string) => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject?.bomImport) return draft;
      draft.majorProject.bomImport.selectedSheetName = sheetName;
      return draft;
    });
  };

  const setMajorProjectBomReviewedColumn = (sheetName: string, columnKey: MajorProjectBomColumnKey, columnIndex: number | null) => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject?.bomImport) return draft;
      if (!draft.majorProject.bomImport.reviewedColumnMapBySheet) {
        draft.majorProject.bomImport.reviewedColumnMapBySheet = {};
      }
      const reviewedMap = draft.majorProject.bomImport.reviewedColumnMapBySheet[sheetName] ?? {};
      draft.majorProject.bomImport.reviewedColumnMapBySheet[sheetName] = {
        ...reviewedMap,
        [columnKey]: columnIndex,
      };
      return draft;
    });
  };

  const importDraftMajorProjectBomComponents = () => {
    const bomImport = majorProjectState.bomImport;
    const selectedSheet = selectedMajorProjectBomSheet;
    if (!bomImport || !selectedSheet) {
      setWorkflowNotice("Capture a workbook and choose a tab before importing draft components.");
      return;
    }

    const { headerRowIndex, columnMap } = resolveMajorProjectBomImportColumnMap(
      selectedSheet,
      bomImport.reviewedColumnMapBySheet,
    );
    if (headerRowIndex === -1 && !Object.keys(columnMap).length) {
      setWorkflowNotice(`RapidQuote could not find an obvious header row in ${selectedSheet.name}. Map the needed columns first or choose a cleaner tab.`);
      return;
    }

    const bomSourcePrefix = `BOM import source: ${selectedSheet.name} row `;

    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!draft.majorProject?.bomImport || !option) return draft;

      const preservedComponents = (option.components ?? []).filter((component) => !(component.notes ?? "").startsWith(bomSourcePrefix));
      const importedComponents = selectedSheet.rows
        .slice(headerRowIndex >= 0 ? headerRowIndex + 1 : 0)
        .map((row, index) => createDraftMajorProjectComponentFromBomRow({
          row,
          sheetName: selectedSheet.name,
          columnMap,
          importIndex: preservedComponents.length + index + 1,
        }))
        .filter((component): component is MajorProjectComponent => Boolean(component));

      if (!importedComponents.length) {
        draft.majorProject.bomImport.importedComponentCount = 0;
        draft.majorProject.bomImport.importedAt = new Date().toISOString();
        return draft;
      }

      option.components = [...preservedComponents, ...importedComponents];
      draft.majorProject.builderMode = "advanced";
      draft.majorProject.bomImport.importedComponentCount = importedComponents.length;
      draft.majorProject.bomImport.importedAt = new Date().toISOString();
      draft.majorProject.bomImport.reviewState = "pre_import_review";
      return draft;
    });

    const importedCount = selectedSheet.rows
      .slice(headerRowIndex >= 0 ? headerRowIndex + 1 : 0)
      .map((row, index) => createDraftMajorProjectComponentFromBomRow({
        row,
        sheetName: selectedSheet.name,
        columnMap,
        importIndex: index + 1,
      }))
      .filter(Boolean)
      .length;

    setMajorProjectEditorTab("components");
    setWorkflowNotice(
      importedCount > 0
        ? `Imported ${importedCount} draft component${importedCount === 1 ? "" : "s"} from ${selectedSheet.name}. Vendor cost and ${DEFAULT_IMPORTED_MARGIN_PERCENT}% starter pricing came across; review before bundling or direct output.`
        : `No obvious component rows were found in ${selectedSheet.name}.`,
    );
  };

  const seedImportedMajorProjectCustomerLabels = () => {
    const importedWithoutLabels = importedMajorProjectComponents.filter((component) => !(component.customerFacingLabel ?? "").trim());
    if (!importedWithoutLabels.length) {
      setWorkflowNotice("Imported components already have customer labels. Review pricing or bundling next.");
      return;
    }

    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      option.components = option.components.map((component) => {
        if (
          !(component.notes ?? "").startsWith(MAJOR_PROJECT_BOM_IMPORT_SOURCE_PREFIX)
          || (component.customerFacingLabel ?? "").trim()
        ) {
          return component;
        }
        return {
          ...component,
          customerFacingLabel: component.internalName,
        };
      });
      return draft;
    });

    setWorkflowNotice(`Seeded ${importedWithoutLabels.length} imported component${importedWithoutLabels.length === 1 ? "" : "s"} with customer-facing labels from their internal names.`);
  };

  const seedImportedMajorProjectPricingFromCost = () => {
    const importedWithoutPricing = importedMajorProjectComponents.filter((component) => component.customerUnitPrice <= 0 && component.vendorUnitCost > 0);
    if (!importedWithoutPricing.length) {
      setWorkflowNotice("Imported components already have starter pricing, or there is no vendor cost available to seed from.");
      return;
    }

    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      option.components = option.components.map((component) => {
        if (
          !(component.notes ?? "").startsWith(MAJOR_PROJECT_BOM_IMPORT_SOURCE_PREFIX)
          || component.customerUnitPrice > 0
          || component.vendorUnitCost <= 0
        ) {
          return component;
        }
        const customerUnitPrice = applyMarginToCost(component.vendorUnitCost, DEFAULT_IMPORTED_MARGIN_PERCENT);
        return {
          ...component,
          customerUnitPrice,
          customerExtendedPrice: Number((component.quantity * customerUnitPrice).toFixed(2)),
        };
      });
      return draft;
    });

    setWorkflowNotice(`Seeded ${DEFAULT_IMPORTED_MARGIN_PERCENT}% starter pricing from vendor cost for ${importedWithoutPricing.length} imported component${importedWithoutPricing.length === 1 ? "" : "s"}.`);
  };

  const applyImportedMajorProjectMarginFromCost = () => {
    const marginPercent = Math.max(parseNumber(majorProjectImportedMarginPercent), 0);
    const importedWithoutPricing = importedMajorProjectComponents.filter((component) => component.customerUnitPrice <= 0 && component.vendorUnitCost > 0);
    if (!importedWithoutPricing.length) {
      setWorkflowNotice("Imported components already have customer pricing, or there is no vendor cost available to price from.");
      return;
    }

    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      option.components = option.components.map((component) => {
        if (
          !(component.notes ?? "").startsWith(MAJOR_PROJECT_BOM_IMPORT_SOURCE_PREFIX)
          || component.customerUnitPrice > 0
          || component.vendorUnitCost <= 0
        ) {
          return component;
        }
        const customerUnitPrice = applyMarginToCost(component.vendorUnitCost, marginPercent);
        return {
          ...component,
          customerUnitPrice,
          customerExtendedPrice: Number((component.quantity * customerUnitPrice).toFixed(2)),
        };
      });
      return draft;
    });

    setWorkflowNotice(`Applied ${marginPercent}% margin to ${importedWithoutPricing.length} imported component${importedWithoutPricing.length === 1 ? "" : "s"} using vendor cost as the base.`);
  };

  const beginImportedMajorProjectBundling = () => {
    if (!importedMajorProjectComponents.length) {
      setWorkflowNotice("Import BOM components first, then start grouping them into bundles.");
      return;
    }

    const firstUnbundledImportedComponent = importedMajorProjectComponents.find((component) => !(component.bundleAssignmentId ?? "").trim());
    if (!firstUnbundledImportedComponent) {
      setMajorProjectEditorTab("bundles");
      setWorkflowNotice("Imported components are already assigned to bundles. Review package labels and descriptions next.");
      return;
    }

    startMajorProjectComponentBundleDraft(firstUnbundledImportedComponent);
    setWorkflowNotice(`Start with ${firstUnbundledImportedComponent.internalName || "the selected component"} and choose the other raw BOM items that belong in the same customer bundle.`);
  };

  const syncExecutiveSummaryStructure = (draft: QuoteRecord) => {
    const normalizedBlocks = normalizeExecutiveSummaryBlocks(draft.executiveSummary);
    const serialized = serializeExecutiveSummaryBlocks(normalizedBlocks);
    draft.executiveSummary.body = serialized.body;
    draft.executiveSummary.paragraphs = compactList([draft.executiveSummary.customerContext, ...serialized.paragraphs]);
    draft.executiveSummary.blocks = normalizedBlocks;
  };

  const updateExecutiveSummaryBlocks = (updater: (blocks: QuoteStructuredTextBlock[]) => QuoteStructuredTextBlock[]) => {
    updateQuote((draft) => {
      draft.executiveSummary.blocks = updater(normalizeExecutiveSummaryBlocks(draft.executiveSummary));
      syncExecutiveSummaryStructure(draft);
      return draft;
    });
  };

  const addExecutiveSummaryBlock = (type: QuoteStructuredTextBlock["type"]) => {
    updateExecutiveSummaryBlocks((blocks) => [...blocks, createExecutiveSummaryBlock(type, blocks.length)]);
  };

  const updateExecutiveSummaryBlock = (blockId: string, updater: (block: QuoteStructuredTextBlock) => QuoteStructuredTextBlock) => {
    updateExecutiveSummaryBlocks((blocks) => blocks.map((block) => block.id === blockId ? updater(block) : block));
  };

  const changeExecutiveSummaryBlockType = (
    blockId: string,
    nextType: QuoteStructuredTextBlock["type"],
  ) => {
    updateExecutiveSummaryBlock(blockId, (block) => {
      if (block.type === nextType) return block;

      if (nextType === "heading" || nextType === "paragraph") {
        const nextText = block.type === "heading" || block.type === "paragraph"
          ? block.text ?? ""
          : (block.items ?? []).join("\n");
        return {
          id: block.id,
          type: nextType,
          text: nextText,
        };
      }

      const nextItems = block.type === "bullet_list" || block.type === "numbered_list"
        ? (block.items?.length ? block.items : [""])
        : (block.text ?? "").split("\n").map((item) => item.trim()).filter(Boolean);

      return {
        id: block.id,
        type: nextType,
        items: nextItems.length ? nextItems : [""],
      };
    });
  };

  const updateExecutiveSummaryListItem = (blockId: string, itemIndex: number, value: string) => {
    updateExecutiveSummaryBlock(blockId, (block) => ({
      ...block,
      items: (block.items ?? []).map((item, index) => index === itemIndex ? value : item),
    }));
  };

  const addExecutiveSummaryListItem = (blockId: string) => {
    updateExecutiveSummaryBlock(blockId, (block) => ({
      ...block,
      items: [...(block.items ?? []), ""],
    }));
  };

  const removeExecutiveSummaryListItem = (blockId: string, itemIndex: number) => {
    updateExecutiveSummaryBlock(blockId, (block) => {
      const nextItems = (block.items ?? []).filter((_, index) => index !== itemIndex);
      return {
        ...block,
        items: nextItems.length ? nextItems : [""],
      };
    });
  };

  const moveExecutiveSummaryBlock = (blockId: string, direction: -1 | 1) => {
    updateExecutiveSummaryBlocks((blocks) => {
      const currentIndex = blocks.findIndex((block) => block.id === blockId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= blocks.length) return blocks;

      const nextBlocks = [...blocks];
      const [target] = nextBlocks.splice(currentIndex, 1);
      nextBlocks.splice(nextIndex, 0, target);
      return nextBlocks;
    });
  };

  const removeExecutiveSummaryBlock = (blockId: string) => {
    updateExecutiveSummaryBlocks((blocks) => blocks.filter((block) => block.id !== blockId));
  };

  const generateExecutiveSummary = () => {
    const generated = buildExecutiveSummaryDraft(quote);
    updateQuote((draft) => {
      draft.executiveSummary.enabled = true;
      draft.executiveSummary.heading = generated.heading;
      draft.executiveSummary.customerContext = generated.customerContext;
      draft.executiveSummary.body = generated.body;
      draft.executiveSummary.paragraphs = generated.paragraphs;
      draft.executiveSummary.blocks = generated.blocks;
      return draft;
    });
  };

  const updateAgreementCategoryField = (
    categoryKey: ServiceAgreementCategoryKey,
    field: keyof Pick<ServiceAgreementCategoryPricing, "rateBasis" | "laborRate" | "mileageRate" | "notes">,
    value: string,
  ) => updateQuote((draft) => {
    draft.serviceAgreement.profile.categories = draft.serviceAgreement.profile.categories.map((category) => {
      if (category.key !== categoryKey) return category;

      if (field === "rateBasis") {
        return {
          ...category,
          rateBasis: value as ServiceAgreementRateBasis,
        };
      }

      if (field === "laborRate") {
        return {
          ...category,
          laborRate: value.trim() ? Math.max(parseNumber(value), 0) : null,
        };
      }

      if (field === "mileageRate") {
        return {
          ...category,
          mileageRate: value.trim() ? Math.max(parseNumber(value), 0) : null,
        };
      }

      return {
        ...category,
        notes: value,
      };
    });
    draft.serviceAgreement.profile.updatedAt = new Date().toISOString();
    return draft;
  });

  const updateAgreementProfileField = (
    field: "agreementLabel" | "signedDate" | "acceptedDate" | "notes",
    value: string,
  ) => updateQuote((draft) => {
    draft.serviceAgreement.profile[field] = value;
    draft.serviceAgreement.profile.updatedAt = new Date().toISOString();
    return draft;
  });

  const updateAgreementAttachmentField = (field: "fileName" | "fileUrl" | "note", value: string) => updateQuote((draft) => {
    const currentAttachment = draft.serviceAgreement.profile.sourceDocument ?? { fileName: "", fileUrl: "", note: "" };
    const nextAttachment = {
      ...currentAttachment,
      [field]: value,
    };

    draft.serviceAgreement.profile.sourceDocument = nextAttachment.fileName.trim()
      ? {
          fileName: nextAttachment.fileName,
          fileUrl: nextAttachment.fileUrl?.trim() || undefined,
          note: nextAttachment.note?.trim() || undefined,
        }
      : undefined;
    draft.serviceAgreement.profile.updatedAt = new Date().toISOString();
    return draft;
  });

  const handleExportServiceAgreement = async () => {
    try {
      const { blob, fileName } = await buildServiceAgreementDocument(quote);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.alert("Unable to export the SLA document right now. Please try again.");
    }
  };

  const applyCustomerServiceAgreementDefaults = () => {
    if (!selectedCustomerProfile) return;

    updateQuote((draft) => {
      draft.serviceAgreement = {
        useCustomerDefaults: true,
        sourceCustomerProfileId: selectedCustomerProfile.id,
        sourceCustomerProfileName: selectedCustomerProfile.companyName,
        lastAppliedAt: new Date().toISOString(),
        profile: normalizeServiceAgreementProfile(selectedCustomerProfile.serviceAgreementDefaults),
      };
      return draft;
    });
    setWorkflowNotice(`Loaded service pricing defaults from ${selectedCustomerProfile.companyName}.`);
  };

  const addAgreementCategoryToSectionC = (category: ServiceAgreementCategoryPricing) => {
    updateQuote((draft) => {
      draft.sections.sectionC.enabled = true;
      draft.sections.sectionC.lineItems.push(
        createServiceRowFromAgreementCategory(
          category,
          draft.serviceAgreement.profile.sourceDocument?.fileName || draft.serviceAgreement.sourceCustomerProfileName || "Customer SLA default",
        ),
      );
      return draft;
    });
    setWorkflowNotice(`Added ${category.label} from the service agreement defaults into Section C.`);
  };

  const updateMajorCommercialField = (field: keyof QuoteRecord["majorProject"]["commercial"], value: string | number | boolean) => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject) return draft;
      (draft.majorProject.commercial[field] as string | number | boolean) = value;
      return draft;
    });
  };

  const updateActiveMajorOption = (field: keyof NonNullable<QuoteRecord["majorProject"]>["options"][number], value: string | number) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      (option[field] as string | number | undefined) = value;
      return draft;
    });
  };

  const updateActiveMajorSimpleRow = (rowId: string, updater: (row: MajorProjectSimpleRow) => MajorProjectSimpleRow) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.simpleRows) return draft;
      option.simpleRows = option.simpleRows.map((row) => row.id === rowId ? updater(row) : row);
      return draft;
    });
  };

  const addMajorProjectSimpleRow = () => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      const nextIndex = (option.simpleRows?.length ?? 0) + 1;
      option.simpleRows = [...(option.simpleRows ?? []), createMajorProjectSimpleRowDraft(nextIndex)];
      return draft;
    });
  };

  const duplicateMajorProjectSimpleRow = (rowId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.simpleRows) return draft;
      const row = option.simpleRows.find((entry) => entry.id === rowId);
      if (!row) return draft;
      option.simpleRows = [
        ...option.simpleRows,
        {
          ...row,
          id: `${row.id}-copy-${Date.now()}`,
          label: `${row.label || "Line item"} copy`,
        },
      ];
      return draft;
    });
  };

  const removeMajorProjectSimpleRow = (rowId: string) => {
    let attachmentToRelease: MajorProjectSpecAttachment | undefined;
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      attachmentToRelease = option.simpleRows?.find((row) => row.id === rowId)?.specSheetAttachment;
      option.simpleRows = (option.simpleRows ?? []).filter((row) => row.id !== rowId);
      return draft;
    });
    releaseMajorProjectSpecAttachmentIfUnused(attachmentToRelease);
  };

  const moveMajorProjectSimpleRow = (rowId: string, direction: -1 | 1) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.simpleRows) return draft;
      const index = option.simpleRows.findIndex((row) => row.id === rowId);
      if (index === -1) return draft;
      option.simpleRows = moveInList(option.simpleRows, index, direction);
      return draft;
    });
  };

  const moveMajorProjectSimpleRowToPosition = (rowId: string, targetPosition: number) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.simpleRows) return draft;
      const index = option.simpleRows.findIndex((row) => row.id === rowId);
      if (index === -1) return draft;
      option.simpleRows = moveToPositionInList(option.simpleRows, index, targetPosition);
      return draft;
    });
  };

  const moveMajorProjectComponent = (componentId: string, direction: -1 | 1) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      const index = option.components.findIndex((component) => component.id === componentId);
      if (index === -1) return draft;
      option.components = moveInList(option.components, index, direction);
      return draft;
    });
  };

  const moveMajorProjectComponentToPosition = (componentId: string, targetPosition: number) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      const index = option.components.findIndex((component) => component.id === componentId);
      if (index === -1) return draft;
      option.components = moveToPositionInList(option.components, index, targetPosition);
      return draft;
    });
  };

  const updateActiveMajorVendorQuote = (quoteId: string, updater: (entry: MajorProjectVendorQuoteImport) => MajorProjectVendorQuoteImport) => {
    updateMajorProjectQuote((draft) => {
      let updated = false;
      for (const option of draft.majorProject?.options ?? []) {
        if (!(option.vendorQuotes ?? []).some((entry) => entry.id === quoteId)) continue;
        option.vendorQuotes = (option.vendorQuotes ?? []).map((entry) => entry.id === quoteId ? updater(entry) : entry);
        updated = true;
      }
      if (!updated) return draft;
      return draft;
    });
  };

  const removeActiveMajorVendorQuote = (quoteId: string) => {
    updateMajorProjectQuote((draft) => {
      for (const option of draft.majorProject?.options ?? []) {
        if (!(option.vendorQuotes ?? []).some((entry) => entry.id === quoteId)) continue;
        option.vendorQuotes = (option.vendorQuotes ?? []).filter((entry) => entry.id !== quoteId);
      }
      return draft;
    });
  };

  const importMajorProjectVendorQuoteRows = (quoteId: string) => {
    let importedCount = 0;
    let switchedToQuickQuote = false;
    let blockedByMappedBuilderContent = false;

    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => (entry.vendorQuotes ?? []).some((vendorQuote) => vendorQuote.id === quoteId));
      const vendorQuote = option?.vendorQuotes?.find((entry) => entry.id === quoteId);
      if (!draft.majorProject || !option || !vendorQuote?.previewItems?.length) return draft;

      const hasMappedBuilderContent = (option.components?.length ?? 0) > 0
        || (option.bundles?.length ?? 0) > 0
        || (option.customerQuoteLines?.length ?? 0) > 0;

      if (draft.majorProject.builderMode === "advanced" && hasMappedBuilderContent) {
        blockedByMappedBuilderContent = true;
        return draft;
      }

      const nextIndex = (option.simpleRows?.length ?? 0) + 1;
      const vendorName = vendorQuote.vendorName?.trim() || undefined;
      const quoteLabel = vendorQuote.quoteLabel?.trim() || stripFileExtension(vendorQuote.fileName);
      const marginPercent = Math.min(Math.max(vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT, 0), 95);
      const nextRows = vendorQuote.previewItems.map((item, itemIndex) => {
        const quantity = Math.max(item.quantity, 0);
        const ourUnitCost = Math.max(item.unitCost ?? item.unitPrice, 0);
        const customerUnitPrice = applyMarginToCost(ourUnitCost, marginPercent);
        const customerExtendedPrice = Number(((quantity || 1) * customerUnitPrice).toFixed(2));
        const ourExtendedCost = Number((item.extendedCost ?? ((quantity || 1) * ourUnitCost)).toFixed(2));
        const sourceText = createMajorProjectVendorQuoteSourceText(vendorName, quoteLabel, item.rowNumber);
        const metadataSummary = buildVendorQuoteMetadataSummary(item);

        return {
          ...createMajorProjectSimpleRowDraft(nextIndex + itemIndex),
          label: item.rowKind === "charge" ? `Charge: ${item.label || `Vendor quote item ${nextIndex + itemIndex}`}` : item.label || `Vendor quote item ${nextIndex + itemIndex}`,
          description: [item.description, ...metadataSummary, sourceText, `Customer price seeded from vendor cost using ${marginPercent}% margin. Review before release approval.`].filter(Boolean).join("\n"),
          quantity: quantity || 1,
          unit: item.unit || "ea",
          customerUnitPrice,
          customerExtendedPrice,
          ourUnitCost,
          ourExtendedCost,
          bucket: item.bucket,
          importSource: {
            type: "vendor_quote" as const,
            importId: vendorQuote.id,
            fileName: vendorQuote.fileName,
            vendorName: vendorName || item.vendor,
            rowNumber: item.rowNumber,
          },
        };
      });

      importedCount = nextRows.length;
      option.simpleRows = [...(option.simpleRows ?? []), ...nextRows];
      option.vendorQuotes = (option.vendorQuotes ?? []).map((entry) => entry.id === quoteId
        ? {
            ...entry,
            importedRowIds: [
              ...(entry.importedRowIds ?? []),
              ...nextRows.map((row) => row.id),
            ],
            importedAt: new Date().toISOString(),
          }
        : entry);
      if (draft.majorProject.builderMode === "advanced") {
        draft.majorProject.builderMode = "simple";
        switchedToQuickQuote = true;
      }
      return draft;
    });

    if (blockedByMappedBuilderContent) {
      setWorkflowNotice("This option already has mapped builder content. Use Add components here to keep building from the structured component workflow.");
      return;
    }

    if (importedCount > 0) {
      setWorkflowNotice(
        switchedToQuickQuote
          ? `Added ${importedCount} draft line item${importedCount === 1 ? "" : "s"} from the vendor quote and switched this option to Quick Quote so the imported rows affect pricing immediately.`
          : `Added ${importedCount} draft line item${importedCount === 1 ? "" : "s"} from the vendor quote.`,
      );
    }
  };

  const importMajorProjectVendorQuoteComponents = (quoteId: string) => {
    let importedCount = 0;

    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => (entry.vendorQuotes ?? []).some((vendorQuote) => vendorQuote.id === quoteId));
      const vendorQuote = option?.vendorQuotes?.find((entry) => entry.id === quoteId);
      if (!draft.majorProject || !option || !vendorQuote?.previewItems?.length) return draft;

      const nextIndex = (option.components?.length ?? 0) + 1;
      const vendorName = vendorQuote.vendorName?.trim() || undefined;
      const quoteLabel = vendorQuote.quoteLabel?.trim() || stripFileExtension(vendorQuote.fileName);
      const marginPercent = Math.min(Math.max(vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT, 0), 95);
      const nextComponents = vendorQuote.previewItems.map((item, itemIndex) => {
        const quantity = Math.max(item.quantity, 0) || 1;
        const vendorUnitCost = Math.max(item.unitCost ?? item.unitPrice, 0);
        const customerUnitPrice = applyMarginToCost(vendorUnitCost, marginPercent);
        const customerExtendedPrice = Number(((quantity || 1) * customerUnitPrice).toFixed(2));
        const vendorExtendedCost = Number((item.extendedCost ?? ((quantity || 1) * vendorUnitCost)).toFixed(2));
        const lineType = majorProjectVendorQuoteLineType(item.bucket);
        const sourceText = createMajorProjectVendorQuoteSourceText(vendorName, quoteLabel, item.rowNumber);
        const draftComponent = createMajorProjectComponentDraft(nextIndex + itemIndex);
        const metadataSummary = buildVendorQuoteMetadataSummary(item);

        return {
          ...draftComponent,
          internalName: item.rowKind === "charge" ? `Charge - ${item.label || `Vendor quote component ${nextIndex + itemIndex}`}` : item.label || `Vendor quote component ${nextIndex + itemIndex}`,
          customerFacingLabel: item.label || draftComponent.customerFacingLabel,
          vendor: vendorName || item.vendor || draftComponent.vendor,
          manufacturer: item.manufacturer || draftComponent.manufacturer,
          category: majorProjectLineTypeLabel(lineType),
          lineType,
          quantity,
          unit: item.unit || "ea",
          customerUnitPrice,
          customerExtendedPrice,
          vendorUnitCost,
          vendorExtendedCost,
          schedule: majorProjectVendorQuoteSchedule(item.bucket),
          costBasis: "vendor_quote" as const,
          resaleBasis: "cost_plus" as const,
          notes: [
            item.description,
            ...metadataSummary,
            sourceText,
            `Imported from a vendor quote into the mapped builder. Customer price was seeded from vendor cost using ${marginPercent}% margin. Review sell, bundle placement, and proposal presentation before release approval.`,
          ].filter(Boolean).join("\n"),
          importSource: {
            type: "vendor_quote" as const,
            importId: vendorQuote.id,
            fileName: vendorQuote.fileName,
            vendorName: vendorName || item.vendor,
            rowNumber: item.rowNumber,
          },
        } satisfies MajorProjectComponent;
      });

      importedCount = nextComponents.length;
      option.components = [...(option.components ?? []), ...nextComponents];
      option.vendorQuotes = (option.vendorQuotes ?? []).map((entry) => entry.id === quoteId
        ? {
            ...entry,
            importedComponentIds: [
              ...(entry.importedComponentIds ?? []),
              ...nextComponents.map((component) => component.id),
            ],
            importedAt: new Date().toISOString(),
          }
        : entry);
      draft.majorProject.builderMode = "advanced";
      return draft;
    });

    if (importedCount > 0) {
      const loadedQuote = activeMajorOptionVendorQuotes.find((entry) => entry.id === quoteId);
      const costCapturedCount = loadedQuote?.previewItems?.filter((item) => Math.max(item.unitCost ?? item.unitPrice, 0) > 0).length ?? 0;
      const marginPercent = Math.min(Math.max(loadedQuote?.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT, 0), 95);
      setWorkflowNotice(
        `Added ${importedCount} mapped component${importedCount === 1 ? "" : "s"} from the vendor quote. Vendor cost came across on ${costCapturedCount} row${costCapturedCount === 1 ? "" : "s"}, and customer pricing was seeded at ${marginPercent}% margin.`,
      );
    }
  };

  const captureMajorProjectVendorQuotes = async (files: FileList | File[] | null | undefined, source: MajorProjectVendorQuoteSource) => {
    if (!files?.length) return;

    setMajorProjectVendorQuoteCaptureError(null);

    for (const file of Array.from(files)) {
      const validationError = validateMajorProjectVendorQuoteFile(file);
      if (validationError) {
        setMajorProjectVendorQuoteCaptureError({
          fileName: file.name,
          sizeBytes: file.size,
          extension: getFileExtension(file.name),
          mimeType: file.type || undefined,
          message: validationError,
          source,
        });
        continue;
      }

      const entryId = `major-vendor-quote-${Date.now()}-${Math.round(Math.random() * 1000)}`;

      updateMajorProjectQuote((draft) => {
        const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
        if (!option) return draft;
        option.vendorQuotes = [
          ...(option.vendorQuotes ?? []),
          {
            id: entryId,
            fileName: file.name,
            sizeBytes: file.size,
            mimeType: file.type || undefined,
            capturedAt: new Date().toISOString(),
            source,
            status: "reading",
            quoteLabel: stripFileExtension(file.name),
            pricingMarginPercent: 35,
            previewItems: [],
          },
        ];
        return draft;
      });

      try {
        const loadedEntry = await readMajorProjectVendorQuote(file, source);
        updateActiveMajorVendorQuote(entryId, (current) => ({
          ...current,
          ...loadedEntry,
          id: entryId,
          capturedAt: current.capturedAt,
          source: current.source,
        }));
        setWorkflowNotice(
          `Loaded ${file.name}. Review the preview, then choose Add components to bring the parsed items into Mapped Builder.`,
        );
      } catch (caughtError) {
        updateActiveMajorVendorQuote(entryId, (current) => ({
          ...current,
          status: "error",
          readError: caughtError instanceof Error ? caughtError.message : "Unable to read the vendor quote.",
          previewItems: [],
        }));
      }
    }
  };

  const renderMajorProjectVendorQuoteIntake = () => (
    <div className="rounded-[18px] border border-[#dce4ec] bg-[#f8fbfd] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-[#16202b]">Vendor quote intake</div>
          <div className="mt-1 text-[12px] text-[#60707f]">
            Drop one or more vendor quote files here to seed either draft line items or mapped components. Spreadsheet quotes become preview rows. PDF quotes create a traceable placeholder so the quote can still enter the builder review flow.
          </div>
        </div>
        <div className="rounded-full border border-[#d7e0e8] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">
          {activeMajorOptionVendorQuotes.length} quote{activeMajorOptionVendorQuotes.length === 1 ? "" : "s"}
        </div>
      </div>
      <label
        htmlFor={majorProjectVendorQuoteInputId}
        className={`mt-3 block w-full rounded-[18px] border border-dashed bg-white px-4 py-4 text-left transition ${
          isMajorProjectVendorQuoteDragging
            ? "border-[#2f6fed] bg-[#edf4ff]"
            : majorProjectVendorQuoteCaptureError
              ? "border-[#d35a5a] bg-[#fff4f4]"
              : "border-[#cfd7e0]"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsMajorProjectVendorQuoteDragging(true);
        }}
        onDragLeave={() => setIsMajorProjectVendorQuoteDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsMajorProjectVendorQuoteDragging(false);
          captureMajorProjectVendorQuotes(event.dataTransfer.files, "drop");
        }}
      >
        <input
          id={majorProjectVendorQuoteInputId}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
          className="hidden"
          onChange={(event) => {
            captureMajorProjectVendorQuotes(event.target.files, "picker");
            event.target.value = "";
          }}
        />
        <span className="block text-[14px] font-semibold text-[#17212c]">Drag and drop vendor quote files here</span>
        <span className="mt-1 block text-[12px] text-[#60707f]">Or click to choose multiple `.xlsx`, `.xls`, `.csv`, or `.pdf` files. Imported content becomes mapped builder components while preserving vendor and source-row traceability.</span>
        {majorProjectVendorQuoteCaptureError ? (
          <span className="mt-3 block rounded-[14px] border border-[#efc1c1] bg-[#fff1f1] px-3 py-3 text-[12px] text-[#7f1d1d]">
            <strong className="block text-[13px] text-[#8f2424]">File rejected</strong>
            <span className="mt-1 block">{majorProjectVendorQuoteCaptureError.message}</span>
            <span className="mt-2 block text-[11px] text-[#9b4b4b]">
              {majorProjectVendorQuoteCaptureError.fileName} • {formatAttachmentSize(majorProjectVendorQuoteCaptureError.sizeBytes)} • {formatMajorProjectVendorQuoteFileType(majorProjectVendorQuoteCaptureError.fileName, majorProjectVendorQuoteCaptureError.mimeType)}
            </span>
          </span>
        ) : null}
      </label>

      {activeMajorOptionVendorQuotes.length ? (
        <div className="mt-4 space-y-3">
          {activeMajorOptionVendorQuotes.map((vendorQuote) => (
            <div key={vendorQuote.id} className="rounded-[18px] border border-[#dfe6ed] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">{getMajorProjectVendorQuoteStatusLabel(vendorQuote.status)}</div>
                  <div className="mt-1 text-[16px] font-semibold text-[#16202b]">{vendorQuote.fileName}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#60707f]">
                    <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-3 py-1">{formatAttachmentSize(vendorQuote.sizeBytes)}</span>
                    <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-3 py-1">{formatMajorProjectVendorQuoteFileType(vendorQuote.fileName, vendorQuote.mimeType)}</span>
                    <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-3 py-1">{vendorQuote.previewItems?.length ?? 0} preview item{(vendorQuote.previewItems?.length ?? 0) === 1 ? "" : "s"}</span>
                    {vendorQuote.importedComponentIds?.length ? <span className="rounded-full border border-[#dce5fb] bg-[#f2f6ff] px-3 py-1 text-[#234d99]">{vendorQuote.importedComponentIds.length} component{vendorQuote.importedComponentIds.length === 1 ? "" : "s"} created</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="pill-button pill-button-active"
                    disabled={vendorQuote.status !== "loaded" || !(vendorQuote.previewItems?.length)}
                    onClick={() => importMajorProjectVendorQuoteComponents(vendorQuote.id)}
                  >
                    Add components
                  </button>
                  <button type="button" className="danger-button" onClick={() => removeActiveMajorVendorQuote(vendorQuote.id)}>Remove</button>
                </div>
              </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1.3fr_.7fr]">
                  <label className="builder-field compact lg:col-span-1">
                    <span>Vendor / source label</span>
                    <input
                    value={vendorQuote.vendorName ?? ""}
                    onChange={(event) => updateActiveMajorVendorQuote(vendorQuote.id, (current) => ({ ...current, vendorName: event.target.value }))}
                    placeholder="Enter vendor name"
                  />
                </label>
                <label className="builder-field compact lg:col-span-1">
                  <span>Quote reference</span>
                  <input
                    value={vendorQuote.quoteLabel ?? ""}
                    onChange={(event) => updateActiveMajorVendorQuote(vendorQuote.id, (current) => ({ ...current, quoteLabel: event.target.value }))}
                    placeholder="Internal quote label or file reference"
                  />
                  </label>
                <label className="builder-field compact">
                  <span>Margin %</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="95"
                    value={vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT}
                    onChange={(event) => updateActiveMajorVendorQuote(vendorQuote.id, (current) => ({
                      ...current,
                      pricingMarginPercent: Math.min(Math.max(parseNumber(event.target.value), 0), 95),
                    }))}
                  />
                </label>
                </div>
                <div className="mt-3 rounded-[12px] border border-[#dce5fb] bg-[#f5f8ff] px-3 py-3 text-[12px] text-[#28446c]">
                  <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#516a91]">Pricing default</strong>
                  <span className="mt-1 block">{buildMarginPricingSummary(vendorQuote.previewItems?.find((item) => Math.max(item.unitCost ?? item.unitPrice, 0) > 0)?.unitCost ?? vendorQuote.previewItems?.find((item) => Math.max(item.unitCost ?? item.unitPrice, 0) > 0)?.unitPrice, vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT, currencyCode)}</span>
                </div>

                {vendorQuote.status === "loaded" && !(vendorQuote.importedComponentIds?.length) ? (
                  <div className="mt-3 rounded-[14px] border border-[#dce5fb] bg-[#f5f8ff] px-3 py-3 text-[12px] text-[#28446c]">
                    This file is staged only. Choose <strong>Add components</strong>; RapidQuote will use vendor cost plus the margin % above to seed customer pricing.
                  </div>
                ) : null}

                {vendorQuote.readError ? (
                  <div className="mt-3 rounded-[14px] border border-[#efc1c1] bg-[#fff1f1] px-3 py-3 text-[12px] text-[#7f1d1d]">{vendorQuote.readError}</div>
                ) : null}

              {vendorQuote.previewItems?.length ? (
                <div className="mt-3 rounded-[16px] border border-[#e5ebf1] bg-[#fbfdff] p-3">
                  <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#60707f]">Import preview</div>
                  {vendorQuote.previewItems.length > MAJOR_PROJECT_VENDOR_QUOTE_PREVIEW_ITEM_COUNT ? (
                    <div className="mt-1 text-[12px] text-[#60707f]">Showing the first {MAJOR_PROJECT_VENDOR_QUOTE_PREVIEW_ITEM_COUNT} parsed rows. Import will create all {vendorQuote.previewItems.length} mapped components.</div>
                  ) : null}
                  <div className="mt-2 space-y-2">
                    {vendorQuote.previewItems.slice(0, MAJOR_PROJECT_VENDOR_QUOTE_PREVIEW_ITEM_COUNT).map((item) => (
                      <div key={item.id} className="rounded-[14px] border border-[#e6edf3] bg-white px-3 py-3 text-[12px] text-[#42515f]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <strong className="text-[13px] text-[#16202b]">{item.label}</strong>
                          <div className="flex flex-wrap gap-2">
                            {item.rowKind === "charge" ? <span className="rounded-full border border-[#f2ddba] bg-[#fff9ef] px-2 py-1 text-[#7a4b00]">Charge row</span> : null}
                            <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-2 py-1">{majorProjectBucketLabel(item.bucket)}</span>
                            <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-2 py-1">{item.quantity} {item.unit || "ea"}</span>
                            {item.rowNumber ? <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-2 py-1">Source row {item.rowNumber}</span> : null}
                          </div>
                        </div>
                        {item.description ? <div className="mt-2 text-[#5f6c78]">{item.description}</div> : null}
                        {buildVendorQuoteMetadataSummary(item).length ? <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#60707f]">{buildVendorQuoteMetadataSummary(item).map((detail) => <span key={`${item.id}-${detail}`} className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-2 py-1">{detail}</span>)}</div> : null}
                        <div className="mt-2 flex flex-wrap gap-4 text-[#5f6c78]">
                          <span>Vendor cost {formatCurrency(Math.max(item.unitCost ?? item.unitPrice, 0), currencyCode)}</span>
                          <span>Seeded sell {formatCurrency(applyMarginToCost(Math.max(item.unitCost ?? item.unitPrice, 0), vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT), currencyCode)}</span>
                          <span>Ext. {formatCurrency(item.extendedPrice, currencyCode)}</span>
                          {item.vendor ? <span>Vendor {item.vendor}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const addMajorProjectOption = () => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject) return draft;
      const nextIndex = draft.majorProject.options.length + 1;
      const cloneFrom = draft.majorProject.options.find((entry) => entry.id === draft.majorProject?.activeOptionId) ?? draft.majorProject.options[0];
      const nextOption = {
        ...(cloneFrom ?? {
          id: `major-option-${Date.now()}`,
          label: `Option ${nextIndex}`,
          description: "",
          siteCount: draft.majorProject.commercial.siteCount,
          monthlyRatePerSite: draft.majorProject.commercial.monthlyRatePerSite,
          hardwarePerSite: draft.majorProject.commercial.oneTimeHardwarePerSite,
          installPerSite: draft.majorProject.commercial.oneTimeInstallPerSite,
          otherOneTimePerSite: draft.majorProject.commercial.oneTimeOtherPerSite,
          vendorRecurringPerSite: draft.majorProject.commercial.recurringVendorPerSite,
          supportRecurringPerSite: draft.majorProject.commercial.recurringSupportPerSite,
          otherRecurringPerSite: draft.majorProject.commercial.recurringOtherPerSite,
        }),
        id: `major-option-${Date.now()}`,
        label: `Option ${nextIndex}`,
      };
      draft.majorProject.options.push(nextOption);
      draft.majorProject.activeOptionId = nextOption.id;
      return draft;
    });
  };

  const removeActiveMajorOption = () => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject || draft.majorProject.options.length <= 1) return draft;
      draft.majorProject.options = draft.majorProject.options.filter((entry) => entry.id !== draft.majorProject?.activeOptionId);
      draft.majorProject.activeOptionId = draft.majorProject.options[0]?.id ?? draft.majorProject.activeOptionId;
      return draft;
    });
  };

  const updateActiveMajorComponent = (componentId: string, updater: (component: MajorProjectComponent) => MajorProjectComponent) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      option.components = option.components.map((component) => component.id === componentId ? updater(component) : component);
      return draft;
    });
  };

  const addMajorProjectComponent = (bundleId = "") => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      const nextIndex = (option.components?.length ?? 0) + 1;
      option.components = [...(option.components ?? []), createMajorProjectComponentDraft(nextIndex, bundleId)];
      return draft;
    });
    setMajorProjectEditorTab("components");
  };

  const duplicateMajorProjectComponent = (componentId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      const component = option.components.find((entry) => entry.id === componentId);
      if (!component) return draft;
      option.components = [
        ...option.components,
        {
          ...component,
          id: `${component.id}-copy-${Date.now()}`,
          internalName: `${component.internalName || "Component"} copy`,
        },
      ];
      return draft;
    });
  };

  const removeMajorProjectComponent = (componentId: string) => {
    let attachmentToRelease: MajorProjectSpecAttachment | undefined;
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      attachmentToRelease = option.components?.find((component) => component.id === componentId)?.specSheetAttachment;
      option.components = (option.components ?? []).filter((component) => component.id !== componentId);
      option.bundles = (option.bundles ?? []).map((bundle) => ({
        ...bundle,
        componentIds: (bundle.componentIds ?? []).filter((id) => id !== componentId),
        includedCostComponentIds: (bundle.includedCostComponentIds ?? []).filter((id) => id !== componentId),
        includedRevenueComponentIds: (bundle.includedRevenueComponentIds ?? []).filter((id) => id !== componentId),
      }));
      option.customerQuoteLines = (option.customerQuoteLines ?? []).map((line) => ({
        ...line,
        includedCostComponentIds: (line.includedCostComponentIds ?? []).filter((id) => id !== componentId),
        includedRevenueComponentIds: (line.includedRevenueComponentIds ?? []).filter((id) => id !== componentId),
      }));
      return draft;
    });
    releaseMajorProjectSpecAttachmentIfUnused(attachmentToRelease);
  };

  const startMajorProjectComponentBundleDraft = (component: MajorProjectComponent) => {
    setMajorProjectEditorTab("components");
    setMajorProjectComponentBundleDraft({
      sourceComponentId: component.id,
      selectedComponentIds: [component.id],
    });
    setWorkflowNotice(null);
  };

  const toggleMajorProjectComponentBundleSelection = (componentId: string) => {
    setMajorProjectComponentBundleDraft((current) => {
      if (!current || current.sourceComponentId === componentId) return current;

      const selected = new Set(current.selectedComponentIds);
      if (selected.has(componentId)) {
        selected.delete(componentId);
      } else {
        selected.add(componentId);
      }

      return {
        ...current,
        selectedComponentIds: [current.sourceComponentId, ...Array.from(selected).filter((id) => id !== current.sourceComponentId)],
      };
    });
  };

  const cancelMajorProjectComponentBundleDraft = () => {
    setMajorProjectComponentBundleDraft(null);
  };

  const confirmMajorProjectComponentBundleDraft = () => {
    if (!majorProjectComponentBundleDraft) return;

    const selectedComponentIds = Array.from(new Set(majorProjectComponentBundleDraft.selectedComponentIds));
    let createdLineItemLabel = "";

    if (selectedComponentIds.length < 2) {
      setWorkflowNotice("Select at least one other component so the bundle includes more than the starting item.");
      return;
    }

    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;

      const selectedComponentIdSet = new Set(selectedComponentIds);
      const selectedComponents = (option.components ?? []).filter((component) => selectedComponentIdSet.has(component.id));
      if (selectedComponents.length < 2) return draft;

      const sourceComponent = selectedComponents.find((component) => component.id === majorProjectComponentBundleDraft.sourceComponentId) ?? selectedComponents[0];
      const resolvedSelectedIds = selectedComponents.map((component) => component.id);
      const nextBundle = createMajorProjectBundleDraft((option.bundles?.length ?? 0) + 1);
      const bundleSchedule = inferMajorProjectBundleSchedule(selectedComponents);

      nextBundle.internalName = createMajorProjectBundleInternalName(
        sourceComponent,
        sourceComponent.internalName?.trim() || nextBundle.internalName,
      );
      nextBundle.componentIds = resolvedSelectedIds;
      nextBundle.includedCostComponentIds = resolvedSelectedIds;
      nextBundle.includedRevenueComponentIds = resolvedSelectedIds;
      nextBundle.schedule = bundleSchedule;
      nextBundle.category = sourceComponent.category?.trim() || nextBundle.category;

      option.bundles = (option.bundles ?? []).map((bundle) => ({
        ...bundle,
        componentIds: (bundle.componentIds ?? []).filter((componentId) => !selectedComponentIdSet.has(componentId)),
        includedCostComponentIds: (bundle.includedCostComponentIds ?? []).filter((componentId) => !selectedComponentIdSet.has(componentId)),
        includedRevenueComponentIds: (bundle.includedRevenueComponentIds ?? []).filter((componentId) => !selectedComponentIdSet.has(componentId)),
      }));

      const cleanedQuoteLines = (option.customerQuoteLines ?? [])
        .map((line) => ({
          ...line,
          bundleIds: (line.bundleIds ?? []).filter((bundleId) => bundleId !== nextBundle.id),
          includedCostComponentIds: (line.includedCostComponentIds ?? []).filter((componentId) => !selectedComponentIdSet.has(componentId)),
          includedRevenueComponentIds: (line.includedRevenueComponentIds ?? []).filter((componentId) => !selectedComponentIdSet.has(componentId)),
        }))
        .filter((line) => (
          (line.bundleIds?.length ?? 0) > 0
          || (line.includedCostComponentIds?.length ?? 0) > 0
          || (line.includedRevenueComponentIds?.length ?? 0) > 0
        ));

      const nextLineItemNumber = getNextMajorProjectLineItemNumber(cleanedQuoteLines);
      const customerFacingLabel = createMajorProjectLineItemNumberLabel(nextLineItemNumber);
      const bundleDescription = createMajorProjectBundleDescription(selectedComponents, customerFacingLabel);
      createdLineItemLabel = customerFacingLabel;

      option.components = (option.components ?? []).map((component) => (
        selectedComponentIdSet.has(component.id)
          ? {
              ...component,
              bundleAssignmentId: nextBundle.id,
              customerFacingLabel,
            }
          : component
      ));

      option.bundles = [
        ...option.bundles.filter((bundle) => {
          const hasListedComponents = (bundle.componentIds ?? []).length > 0;
          const hasAssignedComponents = (option.components ?? []).some((component) => component.bundleAssignmentId === bundle.id);
          return hasListedComponents || hasAssignedComponents;
        }),
        nextBundle,
      ];

      nextBundle.customerFacingLabel = customerFacingLabel;
      nextBundle.description = bundleDescription;
      const nextQuoteLine = createMajorProjectQuoteLineDraft(nextLineItemNumber);
      nextQuoteLine.lineItemNumber = nextLineItemNumber;
      nextQuoteLine.label = customerFacingLabel;
      nextQuoteLine.description = bundleDescription;
      nextQuoteLine.bundleIds = [nextBundle.id];
      nextQuoteLine.includedCostComponentIds = resolvedSelectedIds;
      nextQuoteLine.includedRevenueComponentIds = resolvedSelectedIds;
      nextQuoteLine.schedule = bundleSchedule;
      nextQuoteLine.presentationCategory = inferMajorProjectQuoteLineCategory(selectedComponents);

      option.customerQuoteLines = [...cleanedQuoteLines, nextQuoteLine];
      return draft;
    });

    setMajorProjectComponentBundleDraft(null);
    setMajorProjectEditorTab("bundles");
    setWorkflowNotice(`Created bundle for line item ${createdLineItemLabel || "number"} with ${selectedComponentIds.length} components and a matching customer quote line.`);
  };

  const updateActiveMajorBundle = (bundleId: string, updater: (bundle: MajorProjectBundle) => MajorProjectBundle) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.bundles) return draft;
      const currentBundle = option.bundles.find((bundle) => bundle.id === bundleId);
      if (!currentBundle) return draft;
      const nextBundle = updater(currentBundle);
      option.bundles = option.bundles.map((bundle) => bundle.id === bundleId ? nextBundle : bundle);
      if (nextBundle.customerFacingLabel !== currentBundle.customerFacingLabel) {
        const synchronizedQuoteLine = findSynchronizedQuoteLineForBundle(option, bundleId);
        if (synchronizedQuoteLine) {
          option.customerQuoteLines = (option.customerQuoteLines ?? []).map((line) => (
            line.id === synchronizedQuoteLine.id
              ? { ...line, label: nextBundle.customerFacingLabel }
              : line
          ));
        }
      }
      return draft;
    });
  };

  const addMajorProjectBundle = () => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      const nextIndex = (option.bundles?.length ?? 0) + 1;
      const nextBundle = createMajorProjectBundleDraft(nextIndex);
      const unassignedComponentIds = (option.components ?? []).filter((component) => !component.bundleAssignmentId).map((component) => component.id);
      nextBundle.componentIds = unassignedComponentIds;
      nextBundle.includedCostComponentIds = unassignedComponentIds;
      nextBundle.includedRevenueComponentIds = unassignedComponentIds;
      option.components = (option.components ?? []).map((component) => component.bundleAssignmentId ? component : { ...component, bundleAssignmentId: nextBundle.id });
      option.bundles = [...(option.bundles ?? []), nextBundle];
      return draft;
    });
    setMajorProjectEditorTab("bundles");
  };

  const duplicateMajorProjectBundle = (bundleId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.bundles) return draft;
      const bundle = option.bundles.find((entry) => entry.id === bundleId);
      if (!bundle) return draft;
      option.bundles = [...option.bundles, {
        ...bundle,
        id: `${bundle.id}-copy-${Date.now()}`,
        internalName: `${bundle.internalName || "Bundle"} copy`,
        customerFacingLabel: `${bundle.customerFacingLabel || bundle.internalName || "Bundle"} copy`,
      }];
      return draft;
    });
  };

  const removeMajorProjectBundle = (bundleId: string) => {
    let attachmentToRelease: MajorProjectSpecAttachment | undefined;
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      attachmentToRelease = option.bundles?.find((bundle) => bundle.id === bundleId)?.specSheetAttachment;
      option.bundles = (option.bundles ?? []).filter((bundle) => bundle.id !== bundleId);
      option.components = (option.components ?? []).map((component) => component.bundleAssignmentId === bundleId ? { ...component, bundleAssignmentId: "" } : component);
      option.customerQuoteLines = (option.customerQuoteLines ?? []).map((line) => ({
        ...line,
        bundleIds: (line.bundleIds ?? []).filter((id) => id !== bundleId),
      }));
      return draft;
    });
    releaseMajorProjectSpecAttachmentIfUnused(attachmentToRelease);
  };

  const moveMajorProjectBundle = (bundleId: string, direction: -1 | 1) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.bundles) return draft;
      const index = option.bundles.findIndex((bundle) => bundle.id === bundleId);
      if (index === -1) return draft;
      option.bundles = moveInList(option.bundles, index, direction);
      return draft;
    });
  };

  const moveMajorProjectBundleToPosition = (bundleId: string, targetPosition: number) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.bundles) return draft;
      const index = option.bundles.findIndex((bundle) => bundle.id === bundleId);
      if (index === -1) return draft;
      option.bundles = moveToPositionInList(option.bundles, index, targetPosition);
      return draft;
    });
  };

  const updateActiveMajorQuoteLine = (quoteLineId: string, updater: (line: MajorProjectCustomerQuoteLine) => MajorProjectCustomerQuoteLine) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.customerQuoteLines) return draft;
      const currentQuoteLine = option.customerQuoteLines.find((line) => line.id === quoteLineId);
      if (!currentQuoteLine) return draft;
      const nextQuoteLine = updater(currentQuoteLine);
      option.customerQuoteLines = option.customerQuoteLines.map((line) => line.id === quoteLineId ? nextQuoteLine : line);
      if (nextQuoteLine.label !== currentQuoteLine.label) {
        const synchronizedBundle = findSynchronizedBundleForQuoteLine(option, quoteLineId);
        if (synchronizedBundle) {
          option.bundles = (option.bundles ?? []).map((bundle) => (
            bundle.id === synchronizedBundle.id
              ? { ...bundle, customerFacingLabel: nextQuoteLine.label }
              : bundle
          ));
        }
      }
      return draft;
    });
  };

  const addMajorProjectQuoteLine = () => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      const nextIndex = getNextMajorProjectLineItemNumber(option.customerQuoteLines ?? []);
      const nextLine = createMajorProjectQuoteLineDraft(nextIndex);
      const firstUnusedBundle = (option.bundles ?? []).find((bundle) => !(option.customerQuoteLines ?? []).some((line) => (line.bundleIds ?? []).includes(bundle.id)));
      if (firstUnusedBundle) {
        const bundleComponentIds = (firstUnusedBundle.componentIds ?? []).length
          ? firstUnusedBundle.componentIds
          : (option.components ?? [])
            .filter((component) => component.bundleAssignmentId === firstUnusedBundle.id)
            .map((component) => component.id);
        const bundledComponents = (option.components ?? []).filter((component) => bundleComponentIds.includes(component.id));
        const hasRecurring = bundledComponents.some((component) => component.schedule === "recurring");
        const hasOneTime = bundledComponents.some((component) => component.schedule === "one_time");

        nextLine.label = firstUnusedBundle.customerFacingLabel || firstUnusedBundle.internalName || nextLine.label;
        nextLine.bundleIds = [firstUnusedBundle.id];
        nextLine.includedCostComponentIds = (firstUnusedBundle.includedCostComponentIds?.length ? firstUnusedBundle.includedCostComponentIds : bundleComponentIds);
        nextLine.includedRevenueComponentIds = (firstUnusedBundle.includedRevenueComponentIds?.length ? firstUnusedBundle.includedRevenueComponentIds : bundleComponentIds);
        nextLine.schedule = hasRecurring && hasOneTime ? "mixed" : hasRecurring ? "recurring" : "one_time";
        nextLine.presentationCategory = hasRecurring && !hasOneTime ? "recurring" : "hardware";
      }
      option.customerQuoteLines = [...(option.customerQuoteLines ?? []), nextLine];
      return draft;
    });
    setMajorProjectEditorTab("quote_lines");
  };

  const duplicateMajorProjectQuoteLine = (quoteLineId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.customerQuoteLines) return draft;
      const line = option.customerQuoteLines.find((entry) => entry.id === quoteLineId);
      if (!line) return draft;
      const nextLineItemNumber = getNextMajorProjectLineItemNumber(option.customerQuoteLines);
      option.customerQuoteLines = [...option.customerQuoteLines, {
        ...line,
        id: `${line.id}-copy-${Date.now()}`,
        lineItemNumber: nextLineItemNumber,
        label: `${line.label || "Quote line"} copy`,
      }];
      return draft;
    });
  };

  const removeMajorProjectQuoteLine = (quoteLineId: string) => {
    let attachmentToRelease: MajorProjectSpecAttachment | undefined;
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      attachmentToRelease = option.customerQuoteLines?.find((line) => line.id === quoteLineId)?.specSheetAttachment;
      option.customerQuoteLines = (option.customerQuoteLines ?? []).filter((line) => line.id !== quoteLineId);
      return draft;
    });
    releaseMajorProjectSpecAttachmentIfUnused(attachmentToRelease);
  };

  const moveMajorProjectQuoteLine = (quoteLineId: string, direction: -1 | 1) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.customerQuoteLines) return draft;
      const index = option.customerQuoteLines.findIndex((line) => line.id === quoteLineId);
      if (index === -1) return draft;
      option.customerQuoteLines = moveInList(option.customerQuoteLines, index, direction);
      return draft;
    });
  };

  const moveMajorProjectQuoteLineToPosition = (quoteLineId: string, targetPosition: number) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.customerQuoteLines) return draft;
      const index = option.customerQuoteLines.findIndex((line) => line.id === quoteLineId);
      if (index === -1) return draft;
      option.customerQuoteLines = moveToPositionInList(option.customerQuoteLines, index, targetPosition);
      return draft;
    });
  };

  const updateActiveSectionARow = (rowId: string, field: string, value: string) => {
    updateQuote((draft) => {
      const rows = draft.sections.sectionA.mode === "pool" ? draft.sections.sectionA.poolRows : draft.sections.sectionA.perKitRows;
      const index = rows.findIndex((row) => row.id === rowId);
      if (index === -1) return draft;
      const row = { ...rows[index] } as PoolPricingRow | PerKitPricingRow;

      if (field === "description") row.description = value;
      if (field === "quantity") row.quantity = value === "" ? null : parseNumber(value);
      if (field === "unitPrice" || field === "monthlyRate") {
        const parsed = value === "" ? 0 : parseNumber(value);
        row.unitPrice = parsed;
        row.monthlyRate = parsed;
      }
      if (field === "unitLabel") row.unitLabel = value;
      if (field === "includedText") row.includedText = value.split("\n").filter(Boolean);

      rows[index] = computeSectionARow(row);
      return draft;
    });
  };

  const addSectionARowFromCatalog = (catalogId: string) => {
    const row = createSectionARowFromCatalog(catalogId, quote.sections.sectionA.mode);
    if (!row) return;

    updateQuote((draft) => {
      const target = draft.sections.sectionA.mode === "pool" ? draft.sections.sectionA.poolRows : draft.sections.sectionA.perKitRows;
      target.push(computeSectionARow(row));
      return draft;
    });
  };

  const addCustomDataRow = (options?: { value?: string; unit?: DataQuickAddUnit }) => {
    const quantitySource = options?.value ?? dataQuickAddValue;
    const unitSource = options?.unit ?? dataQuickAddUnit;
    const quantityValue = Math.max(parseNumber(quantitySource), 0);
    if (!quantityValue) return;
    const gbAmount = unitSource === "TB" ? quantityValue * 1000 : quantityValue;
    const labelAmount = unitSource === "TB" ? `${quantityValue} TB` : `${quantityValue} GB`;
    const monthlyRate = quote.sections.sectionA.mode === "pool"
      ? Number((gbAmount * 0.28).toFixed(2))
      : Number((gbAmount * 0.26).toFixed(2));

    updateQuote((draft) => {
      const rowId = `a_custom_${Date.now()}`;
      if (draft.sections.sectionA.mode === "pool") {
        draft.sections.sectionA.poolRows.push(
          computeSectionARow({
            id: rowId,
            rowType: "service",
            description: `${labelAmount} pooled data allowance`,
            quantity: 1,
            unitLabel: "pool",
            unitPrice: monthlyRate,
            monthlyRate,
            totalMonthlyRate: monthlyRate,
            sourceLabel: "Builder quick add",
          }),
        );
      } else {
        draft.sections.sectionA.perKitRows.push(
          computeSectionARow({
            id: rowId,
            rowType: "service",
            description: `${labelAmount} data block`,
            quantity: 1,
            unitLabel: "block",
            unitPrice: monthlyRate,
            monthlyRate,
            totalMonthlyRate: monthlyRate,
            sourceLabel: "Builder quick add",
          }),
        );
      }
      return draft;
    });
  };

  const removeActiveSectionARow = (rowId: string) => updateQuote((draft) => {
    if (draft.sections.sectionA.mode === "pool") {
      draft.sections.sectionA.poolRows = draft.sections.sectionA.poolRows.filter((row) => row.id !== rowId);
    } else {
      draft.sections.sectionA.perKitRows = draft.sections.sectionA.perKitRows.filter((row) => row.id !== rowId);
    }
    return draft;
  });

  const duplicateActiveSectionARow = (rowId: string) => updateQuote((draft) => {
    const rows = draft.sections.sectionA.mode === "pool" ? draft.sections.sectionA.poolRows : draft.sections.sectionA.perKitRows;
    const index = rows.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    rows.splice(index + 1, 0, { ...rows[index], id: `${rowId}_copy_${Date.now()}` } as typeof rows[number]);
    return draft;
  });

  const moveActiveSectionARow = (rowId: string, direction: -1 | 1) => updateQuote((draft) => {
    if (draft.sections.sectionA.mode === "pool") {
      const index = draft.sections.sectionA.poolRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.poolRows = moveInList(draft.sections.sectionA.poolRows, index, direction);
    } else {
      const index = draft.sections.sectionA.perKitRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.perKitRows = moveInList(draft.sections.sectionA.perKitRows, index, direction);
    }
    return draft;
  });

  const moveActiveSectionAToPosition = (rowId: string, targetPosition: number) => updateQuote((draft) => {
    if (draft.sections.sectionA.mode === "pool") {
      const index = draft.sections.sectionA.poolRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.poolRows = moveToPositionInList(draft.sections.sectionA.poolRows, index, targetPosition);
    } else {
      const index = draft.sections.sectionA.perKitRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.perKitRows = moveToPositionInList(draft.sections.sectionA.perKitRows, index, targetPosition);
    }
    return draft;
  });

  const addEquipmentRow = (catalogId: string) => {
    const row = createEquipmentRowFromCatalog(catalogId);
    if (!row) return;

    updateQuote((draft) => {
      draft.sections.sectionB.lineItems.push(computeEquipmentRow(row));
      return draft;
    });
  };

  const addCustomEquipmentRow = () => {
    const quantity = Math.max(parseNumber(customEquipmentDraft.quantity), 0);
    const unitPrice = Math.max(parseNumber(customEquipmentDraft.unitPrice), 0);
    updateQuote((draft) => {
      draft.sections.sectionB.lineItems.push(
        computeEquipmentRow({
          id: `b_custom_${Date.now()}`,
          sourceType: "custom",
          itemName: customEquipmentDraft.itemName || "Custom equipment item",
          imageUrl: customEquipmentDraft.imageUrl.trim() || undefined,
          itemCategory: customEquipmentDraft.itemCategory || "Custom",
          terminalType: customEquipmentDraft.terminalType || undefined,
          partNumber: customEquipmentDraft.partNumber || undefined,
          quantity,
          unitPrice,
          totalPrice: 0,
          description: customEquipmentDraft.description || "Manual row",
          sourceLabel: "User entry",
        }),
      );
      return draft;
    });
    setCustomEquipmentDraft(emptyEquipmentDraft);
  };

  const updateEquipmentRow = (rowId: string, field: string, value: string) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    const row = { ...draft.sections.sectionB.lineItems[index] };
    if (field === "itemName") row.itemName = value;
    if (field === "imageUrl") row.imageUrl = value.trim() || undefined;
    if (field === "itemCategory") row.itemCategory = value;
    if (field === "terminalType") row.terminalType = value;
    if (field === "partNumber") row.partNumber = value;
    if (field === "quantity") row.quantity = Math.max(parseNumber(value), 0);
    if (field === "unitPrice") row.unitPrice = Math.max(parseNumber(value), 0);
    if (field === "description") row.description = value;
    if (field === "sourceLabel") row.sourceLabel = value;
    draft.sections.sectionB.lineItems[index] = computeEquipmentRow(row);
    return draft;
  });

  const removeEquipmentRow = (rowId: string) => updateQuote((draft) => {
    draft.sections.sectionB.lineItems = draft.sections.sectionB.lineItems.filter((row) => row.id !== rowId);
    return draft;
  });

  const duplicateEquipmentRow = (rowId: string) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    draft.sections.sectionB.lineItems.splice(index + 1, 0, { ...draft.sections.sectionB.lineItems[index], id: `${rowId}_copy_${Date.now()}` });
    return draft;
  });

  const moveEquipmentRow = (rowId: string, direction: -1 | 1) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionB.lineItems = moveInList(draft.sections.sectionB.lineItems, index, direction);
    return draft;
  });

  const moveEquipmentRowToPosition = (rowId: string, targetPosition: number) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionB.lineItems = moveToPositionInList(draft.sections.sectionB.lineItems, index, targetPosition);
    return draft;
  });

  const updateServiceRow = (rowId: string, field: string, value: string) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    const row = { ...draft.sections.sectionC.lineItems[index] };
    if (field === "description") row.description = value;
    if (field === "quantity") row.quantity = Math.max(parseNumber(value), 0);
    if (field === "unitPrice") row.unitPrice = Math.max(parseNumber(value), 0);
    if (field === "notes") row.notes = value;
    if (field === "pricingStage") row.pricingStage = value as ServiceStage;
    draft.sections.sectionC.lineItems[index] = computeServiceRow(row);
    return draft;
  });

  const addServiceRow = () => updateQuote((draft) => {
    draft.sections.sectionC.lineItems.push(
      computeServiceRow({
        id: `c_${Date.now()}`,
        sourceType: "custom",
        description: "Optional service line",
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        serviceCategory: "custom",
        pricingStage: "budgetary",
        sourceLabel: "User entry",
      }),
    );
    return draft;
  });

  const addPresetServiceRow = (presetKey: string) => {
    const preset = servicePresetTemplates.find((entry) => entry.key === presetKey);
    if (!preset) return;
    updateQuote((draft) => {
      draft.sections.sectionC.enabled = true;
      draft.sections.sectionC.lineItems.push(
        computeServiceRow({
          id: `c_${presetKey}_${Date.now()}`,
          sourceType: "standard",
          description: preset.label,
          quantity: 1,
          unitPrice: preset.unitPrice,
          totalPrice: preset.unitPrice,
          notes: preset.description,
          serviceCategory: preset.category,
          pricingStage: preset.stage,
          sourceLabel: "Builder preset",
        }),
      );
      return draft;
    });
  };

  const removeServiceRow = (rowId: string) => updateQuote((draft) => {
    draft.sections.sectionC.lineItems = draft.sections.sectionC.lineItems.filter((row) => row.id !== rowId);
    return draft;
  });

  const duplicateServiceRow = (rowId: string) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    draft.sections.sectionC.lineItems.splice(index + 1, 0, { ...draft.sections.sectionC.lineItems[index], id: `${rowId}_copy_${Date.now()}` });
    return draft;
  });

  const moveServiceRow = (rowId: string, direction: -1 | 1) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionC.lineItems = moveInList(draft.sections.sectionC.lineItems, index, direction);
    return draft;
  });

  const moveServiceRowToPosition = (rowId: string, targetPosition: number) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionC.lineItems = moveToPositionInList(draft.sections.sectionC.lineItems, index, targetPosition);
    return draft;
  });

  const applyTermsPackage = (packageKey: (typeof TERMS_PACKAGES)[number]["key"]) => updateQuote((draft) => {
    draft.terms = buildTermsFromPackage(packageKey);
    return draft;
  });

  const addCustomSectionField = (visibility: QuoteCustomField["visibility"] = "customer") => {
    const nextField = {
      id: `field_${Date.now()}`,
      label: visibility === "customer" ? `Customer detail ${customSectionFields.length + 1}` : `Internal note ${customSectionFields.length + 1}`,
      value: "",
      visibility,
    };
    setCustomSectionFields((current) => [...current, nextField]);
    updateQuote((draft) => {
      draft.customFields = [...(draft.customFields ?? []), nextField];
      return draft;
    });
  };

  const saveCustomerProfile = (profileId?: string) => {
    if (!quote.customer.name.trim()) {
      setWorkflowNotice("Add a customer name before saving a reusable customer profile.");
      return null;
    }
    if (!quote.customer.addressLines[0]?.trim()) {
      setWorkflowNotice("Add the customer's primary/default address before saving a reusable customer profile.");
      return null;
    }

    const resolvedProfileId = profileId || selectedCustomerProfileId || undefined;
    const nextProfile = createCustomerProfileFromQuote(quote, resolvedProfileId);
    const nextProfiles = upsertCustomerProfile(customerProfiles, nextProfile);
    persistCustomerProfiles(nextProfiles);
    setCustomerProfiles(nextProfiles);
    setSelectedCustomerProfileId(nextProfile.id);
    setQuote((current) => ({
      ...current,
      internal: {
        ...current.internal,
        savedCustomerProfileId: nextProfile.id,
      },
    }));
    setWorkflowNotice(profileId || selectedCustomerProfileId ? "Saved customer profile updated." : "Saved customer profile created.");
    return nextProfile;
  };

  const applySelectedCustomerProfile = (profileId: string) => {
    const profile = customerProfiles.find((entry) => entry.id === profileId);
    if (!profile) return;

    setSelectedCustomerProfileId(profile.id);
    updateQuote((draft) => {
      applyCustomerProfileToQuote(draft, profile);
      return draft;
    });
    setCustomerEntryMode("review");
    setWorkflowNotice(`Autofilled proposal details from ${profile.companyName}.`);
  };

  const finishCustomerEntry = () => {
    if (!quote.customer.name.trim()) {
      setWorkflowNotice("Add a customer name before continuing into quote building.");
      setCustomerEntryMode("create");
      return;
    }
    if (!quote.customer.addressLines[0]?.trim()) {
      setWorkflowNotice("Add the customer's primary/default address before continuing into quote building.");
      setCustomerEntryMode("create");
      return;
    }

    updateQuote((draft) => {
      draft.metadata.accountName = draft.metadata.accountName?.trim() || draft.customer.name.trim();
      draft.customer.logoText = draft.metadata.customerShortName?.trim() || draft.customer.logoText || draft.customer.name.trim();
      return draft;
    });

    setCustomerEntryMode("review");
    setWorkflowNotice(`Customer locked in for this draft: ${quote.customer.name.trim()}.`);
  };

  const persistProposalState = () => {
    if (typeof window === "undefined") return null;

    if (!customerEntryComplete) {
      setWorkflowNotice("Finish customer intake before saving, previewing, or copying this proposal.");
      return null;
    }

    const preparedQuote = isMajorProject ? applyMajorProjectToQuote(quote) : quote;
    const nextQuote = {
      ...preparedQuote,
      metadata: {
        ...preparedQuote.metadata,
        lastTouchedAt: new Date().toISOString(),
      },
      internal: {
        ...preparedQuote.internal,
        savedProposalId: activeProposal?.id ?? preparedQuote.internal.savedProposalId ?? preparedQuote.internal.quoteId,
      },
    };

    persistQuoteRecord(nextQuote);

    const currentStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY)) ?? getDefaultProposalStore(
      createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }),
    );

    const proposalId = activeProposal?.id ?? nextQuote.internal.savedProposalId ?? nextQuote.internal.quoteId;
    const owner = currentStore.users.find((user) => user.id === (nextQuote.metadata.ownerUserId ?? activeProposal?.owner.id)) ?? currentStore.currentUser;
    const now = new Date().toISOString();
    const updatedProposal = createProposalFromQuote({ quote: nextQuote, owner, currentUser: currentStore.currentUser });
    updatedProposal.id = proposalId;
    updatedProposal.createdAt = activeProposal?.createdAt ?? now;
    updatedProposal.updatedAt = now;
    updatedProposal.status = nextQuote.metadata.status;
    updatedProposal.stageLabel = statusToStageLabel(nextQuote.metadata.status);
    updatedProposal.owner = owner;
    updatedProposal.createdBy = activeProposal?.createdBy ?? currentStore.currentUser;
    const previousStatus = activeProposal?.status ?? nextQuote.metadata.status;
    const statusChanged = previousStatus !== nextQuote.metadata.status;
    updatedProposal.activity = [
      ...(activeProposal?.activity ?? []),
      {
        id: `activity_${statusChanged ? "status" : "updated"}_${Date.now()}`,
        type: statusChanged ? "status_changed" : "updated",
        message: statusChanged
          ? `Proposal moved from ${statusToStageLabel(previousStatus)} to ${statusToStageLabel(nextQuote.metadata.status)}`
          : "Proposal saved from builder",
        at: now,
        by: { id: currentStore.currentUser.id, name: currentStore.currentUser.name },
      },
    ];
    updatedProposal.quote.internal.savedProposalId = proposalId;
    updatedProposal.quote.internal.workspaceOwnerId = owner.id;
    updatedProposal.quote.internal.workspaceOwnerName = owner.name;
    updatedProposal.quote.metadata.ownerUserId = owner.id;
    updatedProposal.quote.metadata.ownerName = owner.name;

    const nextStore = upsertProposal(currentStore, updatedProposal);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, proposalId);

    if (autoUpdateCustomerProfile && (selectedCustomerProfileId || nextQuote.customer.name.trim())) {
      const nextProfile = createCustomerProfileFromQuote(nextQuote, selectedCustomerProfileId || undefined);
      const nextProfiles = upsertCustomerProfile(customerProfiles, nextProfile);
      persistCustomerProfiles(nextProfiles);
      setCustomerProfiles(nextProfiles);
      nextQuote.internal.savedCustomerProfileId = nextProfile.id;
      updatedProposal.quote.internal.savedCustomerProfileId = nextProfile.id;
      setSelectedCustomerProfileId(nextProfile.id);
    }

    const nextUrl = `/new?proposalId=${proposalId}`;
    if (window.location.pathname !== "/new" || window.location.search !== `?proposalId=${proposalId}`) {
      window.history.replaceState({}, "", nextUrl);
    }

    setActiveProposal(updatedProposal);
    setQuote(nextQuote);
    const savedMessage = statusChanged
      ? `Draft saved. Quote is now ${statusToStageLabel(nextQuote.metadata.status)} on revision ${governanceState.revisionLabel}.`
      : `Draft saved for ${nextQuote.metadata.proposalNumber} on revision ${governanceState.revisionLabel}.`;
    setWorkflowNotice(
      majorProjectHasBlockingErrors
        ? `${savedMessage} Major Project validation still has ${majorProjectMetrics.validation.errorCount} blocking error${majorProjectMetrics.validation.errorCount === 1 ? "" : "s"}.`
        : savedMessage,
    );

    return { proposal: updatedProposal, store: nextStore };
  };

  const handlePreviewProposal = () => {
    const persisted = persistProposalState();
    if (!persisted) return;

    if (majorProjectHasBlockingErrors) {
      setWorkflowNotice(`Preview blocked until ${majorProjectMetrics.validation.errorCount} Major Project validation error${majorProjectMetrics.validation.errorCount === 1 ? " is" : "s are"} fixed.`);
      return;
    }

    router.push(buildProposalPreviewPath(persisted.proposal.id));
  };

  const copyProposalFromBuilder = () => {
    const persisted = persistProposalState();
    if (!persisted || typeof window === "undefined") return;

    const copiedProposal = createProposalCopy({
      proposal: persisted.proposal,
      owner: persisted.proposal.owner,
      currentUser: persisted.store.currentUser,
    });
    const nextStore = upsertProposal(persisted.store, copiedProposal);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, copiedProposal.id);
    window.history.replaceState({}, "", `/new?proposalId=${copiedProposal.id}`);
    persistQuoteRecord(copiedProposal.quote);
    setActiveProposal(copiedProposal);
    setQuote(copiedProposal.quote);
    setWorkflowNotice(`Created ${copiedProposal.quote.metadata.proposalNumber} as a new draft copy on revision ${copiedProposal.quote.governance?.revisionLabel || copiedProposal.quote.metadata.revisionVersion || "1.0"}. Review status, pricing, and customer-facing output before sending.`);
  };

  return isHydrated ? (
    <main className="proposal-editor-shell min-h-screen px-4 py-6 text-[#232a31] md:px-6 md:py-8">
      <div className="proposal-editor-container mx-auto max-w-[1380px] space-y-6">
        <section className="proposal-editor-hero">
          <div className="proposal-editor-hero-grid">
            <div className="proposal-editor-brand">
              <div className="proposal-editor-logo-shell">
                <ProductLogo width={168} height={48} className="workspace-brand-logo product-logo workspace-logo-inline shrink-0" priority />
              </div>
              <div className="proposal-editor-headline">
                <div className="builder-eyebrow proposal-editor-kicker">{isMajorProject ? "Major Project workspace" : "Quick Quote workspace"}</div>
                <h1 className="proposal-editor-title">{quote.metadata.documentTitle || "Proposal Editor"}</h1>
                <p className="proposal-editor-subtitle">Build, review, and release the quote from one workspace without losing track of pricing, status, or customer-facing output.</p>
                <div className="proposal-editor-meta-row">
                  <span className="proposal-editor-meta-chip">{proposalHeroSummary}</span>
                  <span className="proposal-editor-meta-chip proposal-editor-meta-chip-strong">{statusToStageLabel(quote.metadata.status)}</span>
                  {quoteLastTouchedLabel ? <span className="proposal-editor-meta-chip">Saved {quoteLastTouchedLabel}</span> : null}
                </div>
              </div>
            </div>

            <div className="proposal-editor-metric-grid">
              <div className="proposal-editor-metric-card">
                <div className="builder-stat-label">Recurring monthly</div>
                <div className="builder-stat-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div>
                <div className="builder-stat-note">Section A is driving the live recurring view.</div>
              </div>
              <div className="proposal-editor-metric-card">
                <div className="builder-stat-label">One-time equipment</div>
                <div className="builder-stat-value">{formatCurrency(equipmentTotal, currencyCode)}</div>
                <div className="builder-stat-note">Hardware and one-time scope ready for review.</div>
              </div>
              <div className="proposal-editor-metric-card">
                <div className="builder-stat-label">Optional services</div>
                <div className="builder-stat-value">{formatCurrency(sectionCTotal, currencyCode)}</div>
                <div className="builder-stat-note">Inspection, install, and service totals.</div>
              </div>
              <div className="proposal-editor-metric-card proposal-editor-metric-card-accent">
                <div className="builder-stat-label">Quote status</div>
                <div className="builder-stat-value">{statusToStageLabel(quote.metadata.status)}</div>
                <div className="builder-stat-note">Revision {governanceState.revisionLabel} • {isMajorProject ? "Mapped Builder" : "Quick Quote"}.</div>
              </div>
            </div>
          </div>

          <div className="proposal-editor-actionbar">
            <div className="proposal-editor-actioncopy">
              <div className="proposal-editor-actiontitle">Work in the builder. Export from Preview.</div>
              <div className="proposal-editor-actiontext">{proposalHeroActionCopy}</div>
            </div>
            <div className="proposal-editor-actionbuttons">
              <button type="button" className="pill-button" onClick={persistProposalState} disabled={!customerEntryComplete}>Save Draft</button>
              <button type="button" className="pill-button" onClick={copyProposalFromBuilder} disabled={!customerEntryComplete}>Copy Proposal</button>
              <button type="button" className="pill-button pill-button-active" onClick={handlePreviewProposal} disabled={!customerEntryComplete}>
                Preview Proposal
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-[#d8e0e8] bg-[#fbfcfe] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Terms package</div>
                <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#16202b]">Proposal terms and conditions package</div>
                <div className="mt-2 text-[13px] text-[#60707f]">Choose the legal/commercial terms set that should flow into the proposal output. Placeholder packages are supported until final legal text is ready.</div>
              </div>
              <label className="builder-field compact min-w-[260px]">
                <span>Applied package</span>
                <select value={quote.terms.selectedPackageKey ?? "starlink_only"} onChange={(e) => applyTermsPackage(e.target.value as (typeof TERMS_PACKAGES)[number]["key"])}>
                  {TERMS_PACKAGES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 rounded-[14px] border border-[#e3e8ee] bg-white px-3 py-3 text-[13px] text-[#435160]">
              {TERMS_PACKAGES.find((entry) => entry.key === (quote.terms.selectedPackageKey ?? "starlink_only"))?.description ?? TERMS_PACKAGES[0].description}
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-[#d8e0e8] bg-[#fbfcfe] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Warranty handling</div>
                <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#16202b]">Quote-level warranty reference</div>
                <div className="mt-2 text-[13px] text-[#60707f]">
                  Capture the manufacturer warranty reference and any quote-specific handling notes that should flow into the proposal. This keeps warranty language flexible by quote instead of assuming one standard block.
                </div>
              </div>
              <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-white px-4 py-3 text-[14px] font-medium text-[#24303b]">
                <input
                  type="checkbox"
                  checked={quote.warranty.enabled}
                  onChange={(e) => updateQuote((draft) => {
                    draft.warranty.enabled = e.target.checked;
                    return draft;
                  })}
                />
                Include in proposal
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="builder-field compact md:col-span-2">
                <span>Section heading</span>
                <input
                  value={quote.warranty.heading}
                  onChange={(e) => updateQuote((draft) => {
                    draft.warranty.heading = e.target.value;
                    return draft;
                  })}
                />
              </label>
              <label className="builder-field compact md:col-span-2">
                <span>Manufacturer / source reference</span>
                <input
                  value={quote.warranty.manufacturerReference}
                  onChange={(e) => updateQuote((draft) => {
                    draft.warranty.manufacturerReference = e.target.value;
                    return draft;
                  })}
                  placeholder="Quoted hardware follows the applicable manufacturer warranty coverage"
                />
              </label>
              <label className="builder-field compact md:col-span-2">
                <span>Coverage note</span>
                <textarea
                  rows={3}
                  value={quote.warranty.coverageNote}
                  onChange={(e) => updateQuote((draft) => {
                    draft.warranty.coverageNote = e.target.value;
                    return draft;
                  })}
                  placeholder="Note any quote-specific coverage limits, registration requirements, or manufacturer exceptions"
                />
              </label>
              <label className="builder-field compact md:col-span-2">
                <span>Claim / handling note</span>
                <textarea
                  rows={3}
                  value={quote.warranty.claimNote ?? ""}
                  onChange={(e) => updateQuote((draft) => {
                    draft.warranty.claimNote = e.target.value;
                    return draft;
                  })}
                  placeholder="Explain how warranty claims, labor, shipping, or exclusions should be handled for this quote"
                />
              </label>
            </div>
            <div className="mt-3 rounded-[14px] border border-[#e3e8ee] bg-white px-3 py-3 text-[13px] text-[#435160]">
              {quote.warranty.enabled
                ? `Proposal output will include ${quote.warranty.heading.toLowerCase()} with the manufacturer reference and any quote-specific coverage notes entered here.`
                : "Warranty guidance is saved on the quote but hidden from the customer-facing proposal until you enable it."}
            </div>
          </div>

          {(workflowNotice || majorProjectHasBlockingErrors) && (
            <div className={`mt-4 rounded-[18px] border px-4 py-3 text-[13px] ${majorProjectHasBlockingErrors ? "border-[#e7b7b7] bg-[#fff4f4] text-[#8d1f1f]" : "border-[#d8e0e8] bg-[#f7fafc] text-[#435160]"}`}>
              <div>
                {workflowNotice ?? `Major Project preview is blocked until ${majorProjectMetrics.validation.errorCount} validation error${majorProjectMetrics.validation.errorCount === 1 ? " is" : "s are"} fixed.`}
              </div>
              {majorProjectHasBlockingErrors && majorProjectBlockingIssues.length > 0 ? (
                <div className="mt-3 rounded-[14px] border border-[#efc1c1] bg-white/70 px-3 py-3 text-[#7f1d1d]">
                  <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8f2424]">Blocking validation issues</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {majorProjectBlockingIssues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="space-y-6">
            <section className="builder-panel">
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Step 1</div><h2 className="builder-title">Customer entry</h2></div></div>

              {customerEntryMode === "start" ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    className="rounded-[24px] border border-[#dde3e8] bg-white p-5 text-left shadow-[0_12px_28px_rgba(75,88,106,0.08)] transition hover:-translate-y-[1px] hover:border-[#c7d5e3]"
                    onClick={() => setCustomerEntryMode("select")}
                  >
                    <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Saved profile</div>
                    <div className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Choose Customer</div>
                    <div className="mt-4 text-[13px] font-medium text-[#2e5b85]">{customerProfiles.length} saved customer profile{customerProfiles.length === 1 ? "" : "s"} available</div>
                  </button>

                  <button
                    type="button"
                    className="rounded-[24px] border border-[#dde3e8] bg-white p-5 text-left shadow-[0_12px_28px_rgba(75,88,106,0.08)] transition hover:-translate-y-[1px] hover:border-[#c7d5e3]"
                    onClick={() => setCustomerEntryMode("create")}
                  >
                    <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">New draft</div>
                    <div className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Create Customer</div>
                    <div className="mt-4 text-[13px] font-medium text-[#2e5b85]">Lightweight by design — not a CRM detour</div>
                  </button>
                </div>
              ) : null}

              {customerEntryMode === "select" ? (
                <div className="customer-entry-shell mt-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="builder-eyebrow">Choose customer</div>
                      <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Choose a saved customer</h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("start")}>Back</button>
                      <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("create")}>Create instead</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_auto] lg:items-end">
                    <label className="builder-field">
                      <span>Saved customer</span>
                      <select value={selectedCustomerProfileId} onChange={(e) => setSelectedCustomerProfileId(e.target.value)}>
                        <option value="">Select a saved customer</option>
                        {customerProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.companyName}{profile.mainContactName ? ` — ${profile.mainContactName}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button type="button" className="pill-button pill-button-active" disabled={!selectedCustomerProfileId} onClick={() => applySelectedCustomerProfile(selectedCustomerProfileId)}>
                      Use selected customer
                    </button>
                  </div>

                  {selectedCustomerProfile ? (
                      <div className="customer-entry-insight-grid mt-4">
                        <div className="customer-entry-insight-card"><strong>Main contact</strong><span>{selectedCustomerProfile.mainContactName || "Not set"}</span><p>{selectedCustomerProfile.mainContactEmail || "No email"}<br />{selectedCustomerProfile.mainContactPhone || "No phone"}</p></div>
                        <div className="customer-entry-insight-card"><strong>Primary / default address</strong><span>{selectedCustomerProfile.primaryAddress.companyName || selectedCustomerProfile.companyName}</span><p>{selectedCustomerProfile.primaryAddress.lines.join(", ") || "No primary address"}</p></div>
                        <div className="customer-entry-insight-card"><strong>Billing / shipping defaults</strong><span>{selectedCustomerProfile.shippingSameAsBillTo ? "Shipping matches billing" : "Separate shipping saved"}</span><p>{selectedCustomerProfile.shippingSameAsBillTo ? "Billing address will also be used for shipping." : selectedCustomerProfile.shippingAddress.lines.join(", ") || "No shipping address"}<br />Owner default: {selectedCustomerProfile.defaultOwnerName || "Not set"}</p></div>
                        <div className="customer-entry-insight-card"><strong>Service pricing agreement</strong><span>{selectedCustomerServiceAgreement.agreementLabel || "No SLA name set"}</span><p>{hasSelectedCustomerServiceAgreement ? `${selectedCustomerServiceAgreement.categories.filter((category) => category.rateBasis !== "na").length} priced category defaults` : "No SLA pricing defaults saved yet"}</p></div>
                      </div>
                  ) : customerProfiles.length === 0 ? (
                    <div className="mt-4 rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No saved customer profiles yet. Create one from this draft, then reuse it next time.</div>
                  ) : null}
                </div>
              ) : null}

              {(customerEntryMode === "create" || customerEntryMode === "review") ? (
                <div className="customer-entry-shell mt-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className={customerEntryMode === "review" ? "customer-entry-selected-copy" : ""}>
                      <div className="builder-eyebrow">{customerEntryMode === "review" ? "Customer selected" : "Create customer"}</div>
                      <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">{customerEntryMode === "review" ? customerHeadline : "Customer details for this quote"}</h3>
                      {customerEntryMode === "review" ? (
                        <p className="customer-entry-selected-subtitle">
                          This customer is now attached to the quote. Review the defaults below, then move straight into quote setup and pricing.
                        </p>
                      ) : null}
                    </div>
                    <div className={`flex flex-wrap gap-3 ${customerEntryMode === "review" ? "customer-entry-selected-actions" : ""}`}>
                      {customerEntryMode === "review" ? (
                        <>
                          <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("select")}>Select different customer</button>
                          <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("create")}>Edit customer</button>
                        </>
                      ) : (
                        <>
                          {customerProfiles.length > 0 ? (
                            <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("select")}>Choose customer</button>
                          ) : null}
                          <button type="button" className="pill-button" onClick={() => setCustomerEntryMode(customerEntryComplete ? "review" : "start")}>Cancel</button>
                          <button type="button" className="pill-button pill-button-active" onClick={finishCustomerEntry}>Use this customer</button>
                        </>
                      )}
                    </div>
                  </div>

                  {customerEntryMode === "review" ? (
                      <div className="customer-entry-insight-grid mt-4">
                        <div className="customer-entry-insight-card"><strong>Contact</strong><span>{quote.customer.contactName || customerHeadline}</span><p>{customerSubline || "No contact details yet"}</p></div>
                        <div className="customer-entry-insight-card"><strong>Primary / default address</strong><span>{quote.customer.addressLines[0] || "No primary address yet"}</span><p>{customerServiceAddress || "No primary address yet"}</p></div>
                        <div className="customer-entry-insight-card"><strong>Saved profile</strong><span>{selectedCustomerProfile ? selectedCustomerProfile.companyName : "Not linked yet"}</span><p>{selectedCustomerProfileId ? "Auto-update available on save" : "Save this customer when ready"}</p></div>
                        <div className="customer-entry-insight-card"><strong>SLA defaults</strong><span>{quoteServiceAgreementProfile.agreementLabel || "No service agreement linked"}</span><p>{activeServiceAgreementCategories.length ? `${activeServiceAgreementCategories.length} active pricing categories ready` : "No customer pricing defaults applied yet"}</p></div>
                      </div>
                  ) : (
                    <>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <label className="builder-field"><span>Customer name</span><input value={quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.customer.name = e.target.value; draft.metadata.accountName = draft.metadata.accountName?.trim() ? draft.metadata.accountName : e.target.value; draft.billTo.companyName = draft.billTo.companyName?.trim() ? draft.billTo.companyName : e.target.value; if (draft.shippingSameAsBillTo) draft.shipTo.companyName = draft.billTo.companyName; return draft; })} /></label>
                        <label className="builder-field"><span>Contact name</span><input value={quote.customer.contactName} onChange={(e) => updateQuote((draft) => { draft.customer.contactName = e.target.value; draft.billTo.attention = draft.billTo.attention?.trim() ? draft.billTo.attention : e.target.value; if (draft.shippingSameAsBillTo) draft.shipTo.attention = draft.billTo.attention; return draft; })} /></label>
                        <label className="builder-field"><span>Contact phone</span><input value={quote.customer.contactPhone} onChange={(e) => updateQuote((draft) => { draft.customer.contactPhone = e.target.value; return draft; })} /></label>
                        <label className="builder-field"><span>Contact email</span><input value={quote.customer.contactEmail} onChange={(e) => updateQuote((draft) => { draft.customer.contactEmail = e.target.value; return draft; })} /></label>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                        <label className="builder-field"><span>Account name</span><input value={quote.metadata.accountName ?? quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.metadata.accountName = e.target.value; return draft; })} /></label>
                        <label className="builder-field"><span>Customer short name</span><input value={quote.metadata.customerShortName} onChange={(e) => updateQuote((draft) => { draft.metadata.customerShortName = e.target.value; draft.customer.logoText = e.target.value; return draft; })} /></label>
                      </div>


                      <div className="mt-4 rounded-[20px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                        <div className="builder-eyebrow">Primary / default address</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="builder-field compact md:col-span-2"><span>Address line 1</span><input value={quote.customer.addressLines[0] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[0] = e.target.value; return draft; })} /></label>
                          <label className="builder-field compact md:col-span-2"><span>Address line 2</span><input value={quote.customer.addressLines[1] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[1] = e.target.value; return draft; })} /></label>
                          <label className="builder-field compact md:col-span-2"><span>Address line 3</span><input value={quote.customer.addressLines[2] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[2] = e.target.value; return draft; })} /></label>
                        </div>
                        <div className="mt-3 text-[12px] leading-[1.5] text-[#66727d]">RapidQuote uses this as the account&apos;s default service address and the starting point for Bill To and Ship To.</div>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <AddressEditor
                          title="Bill To"
                          address={quote.billTo}
                          onChange={(next) => updateQuote((draft) => {
                            draft.billTo = next;
                            if (draft.shippingSameAsBillTo) draft.shipTo = JSON.parse(JSON.stringify(next));
                            return draft;
                          })}
                        />

                        <div className="space-y-4">
                          <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-white px-4 py-3 text-[14px] font-medium text-[#24303b]">
                            <input
                              type="checkbox"
                              checked={quote.shippingSameAsBillTo}
                              onChange={(e) => updateQuote((draft) => {
                                draft.shippingSameAsBillTo = e.target.checked;
                                if (e.target.checked) {
                                  draft.shipTo = JSON.parse(JSON.stringify(draft.billTo));
                                }
                                return draft;
                              })}
                            />
                            Ship to same as bill to
                          </label>

                          <AddressEditor
                            title="Ship To"
                            address={quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo}
                            disabled={quote.shippingSameAsBillTo}
                            onChange={(next) => updateQuote((draft) => {
                              draft.shipTo = next;
                              return draft;
                            })}
                          />
                        </div>
                      </div>

                      <div className="mt-4 rounded-[20px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="builder-eyebrow">Customer-level service pricing agreement</div>
                            <h4 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#16202b]">SLA defaults move with service pricing</h4>
                            <p className="mt-2 text-[13px] leading-[1.55] text-[#60707f]">
                              Review and edit SLA defaults in Quick Quote step 3 so the pricing defaults live next to install and site service rows.
                            </p>
                          </div>
                          {selectedCustomerProfile && hasSelectedCustomerServiceAgreement ? (
                            <button type="button" className="pill-button" onClick={applyCustomerServiceAgreementDefaults}>
                              Pull saved SLA defaults
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Agreement</strong>{quoteServiceAgreementProfile.agreementLabel || "No SLA name set"}<br />{quote.serviceAgreement.sourceCustomerProfileName || quote.customer.name || "Not linked to a saved customer"}</div>
                          <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Attachment</strong>{quoteServiceAgreementProfile.sourceDocument?.fileName || "No source document reference"}<br />{quoteServiceAgreementProfile.sourceDocument?.note || quoteServiceAgreementProfile.sourceDocument?.fileUrl || "Signed/source PDF can be referenced in step 3"}</div>
                          <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Accepted dates</strong>{quoteServiceAgreementProfile.signedDate || "No signed date"}<br />{quoteServiceAgreementProfile.acceptedDate || "No accepted date"}</div>
                          <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Ready categories</strong>{activeServiceAgreementCategories.length} pricing default{activeServiceAgreementCategories.length === 1 ? "" : "s"}<br />{quote.serviceAgreement.lastAppliedAt ? "Applied to this quote" : "Quote-level profile ready to use"}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" className="pill-button" onClick={() => saveCustomerProfile()}>
                          {selectedCustomerProfile ? "Update saved customer" : "Save customer profile"}
                        </button>

                        <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-[#f8fbfd] px-4 py-3 text-[13px] font-medium text-[#24303b]">
                          <input
                            type="checkbox"
                            checked={autoUpdateCustomerProfile && Boolean(selectedCustomerProfileId)}
                            disabled={!selectedCustomerProfileId}
                            onChange={(e) => setAutoUpdateCustomerProfile(e.target.checked)}
                          />
                          Update saved customer on draft save
                        </label>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </section>

            {builderLocked ? (
              <section className="builder-panel">
                <div className="builder-panel-header"><div><div className="builder-eyebrow">Step 2 locked</div><h2 className="builder-title">Finish customer intake first</h2></div></div>
                <div className="rounded-[22px] border border-dashed border-[#d7dde4] bg-[#fbfcfe] p-5 text-[14px] leading-[1.6] text-[#51606d]">
                  Select or create a customer to unlock quote setup, pricing, preview, and PDF output.
                </div>
              </section>
            ) : (
            <>
            <section className="builder-panel">
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Quote setup</div><h2 className="builder-title">Quote details</h2></div></div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-3 text-[13px] text-[#51606d]">
                  <span className="block text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Quote number</span>
                  <strong className="mt-1 block text-[16px] text-[#16202b]">{quote.metadata.proposalNumber}</strong>
                  <span className="mt-1 block">Assigned automatically for new quotes and preserved on saved drafts.</span>
                </div>
                <label className="builder-field"><span>Proposal date</span><input value={quote.metadata.proposalDate} onChange={(e) => updateQuote((draft) => { draft.metadata.proposalDate = e.target.value; draft.documentation.proposalDateLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Proposal title</span><input value={quote.metadata.documentTitle} onChange={(e) => updateQuote((draft) => { draft.metadata.documentTitle = e.target.value; draft.documentation.proposalTitle = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Status</span><select value={quote.metadata.status} onChange={(e) => updateQuote((draft) => { draft.metadata.status = e.target.value as QuoteRecord["metadata"]["status"]; draft.internal.quoteStatus = e.target.value as QuoteRecord["metadata"]["status"]; return draft; })}>{QUOTE_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="builder-field"><span>Proposal owner</span><select value={quote.metadata.ownerUserId ?? activeProposal?.owner.id ?? mockUsers[0].id} onChange={(e) => updateQuote((draft) => { const owner = mockUsers.find((user) => user.id === e.target.value) ?? mockUsers[0]; draft.metadata.ownerUserId = owner.id; draft.metadata.ownerName = owner.name; draft.internal.workspaceOwnerId = owner.id; draft.internal.workspaceOwnerName = owner.name; draft.internal.crmOwnerLabel = owner.name; return draft; })}>{mockUsers.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.role}</option>)}</select></label>
                <label className="builder-field"><span>Owner display name</span><input value={quote.metadata.ownerName ?? activeProposal?.owner.name ?? ""} onChange={(e) => updateQuote((draft) => { draft.metadata.ownerName = e.target.value; draft.internal.workspaceOwnerName = e.target.value; draft.internal.crmOwnerLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Account name</span><input value={quote.metadata.accountName ?? quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.metadata.accountName = e.target.value; return draft; })} /></label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                <label className="builder-field"><span>Proposal subtitle</span><input value={quote.metadata.documentSubtitle} onChange={(e) => updateQuote((draft) => { draft.metadata.documentSubtitle = e.target.value; return draft; })} /></label>
                <div className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-3 text-[13px] text-[#51606d]"><span className="block text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Customer on this draft</span><strong className="mt-1 block text-[16px] text-[#16202b]">{customerHeadline}</strong><span className="mt-1 block">{customerSubline || "Use Customer entry above to edit customer details."}</span></div>
              </div>

              <details className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] px-4 py-3 text-[13px] text-[#51606d]">
                <summary className="cursor-pointer list-none font-semibold text-[#16202b]">Internal record details</summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[14px] bg-white px-4 py-3">
                    <span className="block text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Internal proposal ID</span>
                    <strong className="mt-1 block text-[#16202b]">{activeProposal?.id ?? quote.internal.savedProposalId ?? quote.internal.quoteId}</strong>
                  </div>
                  <div className="rounded-[14px] bg-white px-4 py-3">
                    <span className="block text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Account ID</span>
                    <strong className="mt-1 block text-[#16202b]">{quote.metadata.accountId?.trim() || "Not set"}</strong>
                    <span className="mt-1 block">Hidden from the normal quoting surface and kept read-only here.</span>
                  </div>
                </div>
              </details>

              <details className="mt-5 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                <summary className="cursor-pointer list-none">
                  <div className="builder-eyebrow">Prepared by</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#16202b]">iNet contact and sender details</div>
                </summary>
                <div className="mt-4 space-y-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                  <div className="flex items-start gap-3">
                    <Image src="/inet-logo.png" alt="iNet logo" width={120} height={34} className="workspace-logo-inline h-auto w-auto object-contain" />
                    <div>
                      <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">iNet</div>
                      <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Sales contact</div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="builder-field compact"><span>Prepared by</span><input value={quote.inet.contactName} onChange={(e) => updateQuote((draft) => { draft.inet.contactName = e.target.value; return draft; })} /></label>
                    <label className="builder-field compact"><span>Sales team name</span><input value={quote.inet.name} onChange={(e) => updateQuote((draft) => { draft.inet.name = e.target.value; return draft; })} /></label>
                    <label className="builder-field compact"><span>Sales phone</span><input value={quote.inet.contactPhone} onChange={(e) => updateQuote((draft) => { draft.inet.contactPhone = e.target.value; return draft; })} /></label>
                    <label className="builder-field compact"><span>Sales email</span><input value={quote.inet.contactEmail} onChange={(e) => updateQuote((draft) => { draft.inet.contactEmail = e.target.value; return draft; })} /></label>
                  </div>
                </div>
              </details>

              <div className="mt-5 rounded-[22px] border border-[#d9e2ea] bg-[#f8fbfd] p-4 md:p-5">
                <div className="builder-eyebrow">Workflow mode</div>
                <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Quote path</h3>
                <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                  Keep Major Project visible here: switch modes at any time, or launch a new draft directly into the structured project workflow from the Start page or workspace.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ToggleCard
                    label="Quick Quote"
                    description="Best for Starlink/LTE service, router, install materials, and simple install or site-inspection rows."
                    active={!isMajorProject}
                    onClick={() => updateQuote((draft) => { draft.metadata.workflowMode = "quick_quote"; return draft; })}
                  />
                  <ToggleCard
                    label="Major Project"
                    description="Best for structured projects. Build from internal components, group into bundles, then choose the customer-facing quote lines."
                    active={isMajorProject}
                    onClick={() => updateMajorProjectQuote((draft) => { draft.metadata.workflowMode = "major_project"; if (draft.majorProject) draft.majorProject.enabled = true; return draft; })}
                  />
                </div>
              </div>


              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {([
                  { key: "purchase", label: "Purchase quote", description: "Show one-time hardware separately from recurring service pricing." },
                  { key: "lease", label: "Lease quote", description: "Blend hardware into a term-based monthly view without losing line items." },
                ] as { key: QuoteType; label: string; description: string }[]).map((option) => (
                  <ToggleCard
                    key={option.key}
                    label={option.label}
                    description={option.description}
                    active={quote.metadata.quoteType === option.key}
                    onClick={() => updateQuote((draft) => {
                      draft.metadata.quoteType = option.key;
                      if (option.key === "lease") {
                        draft.metadata.leaseTermMonths = draft.metadata.leaseTermMonths ?? 12;
                        draft.metadata.hasActiveDataAgreement = draft.metadata.hasActiveDataAgreement ?? false;
                      }
                      return draft;
                    })}
                  />
                ))}
              </div>

              {quote.metadata.quoteType === "lease" && (
                <div className="mt-5 rounded-[22px] border border-[#ead9db] bg-[#fff7f7] p-4 md:p-5">
                  <div className="builder-eyebrow">Lease calculator</div>
                  <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Lease pricing builder</h3>
                  <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                    {isMajorProject
                      ? "Lease pricing is gated by an active data agreement. Hardware margin is editable and spread across the selected lease term."
                      : "Lease pricing is gated by an active data agreement. Quick Quote spreads the hardware total across the selected term, then adds monthly service."}
                  </p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
                    <div className="space-y-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                      <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-white px-4 py-3 text-[14px] font-medium text-[#24303b]">
                        <input
                          type="checkbox"
                          checked={hasActiveDataAgreement}
                          onChange={(e) => updateQuote((draft) => {
                            draft.metadata.hasActiveDataAgreement = e.target.checked;
                            return draft;
                          })}
                        />
                        Active data agreement is in place
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="builder-field compact">
                          <span>Lease term</span>
                          <select
                            value={selectedLeaseTerm}
                            onChange={(e) => updateQuote((draft) => {
                              draft.metadata.leaseTermMonths = Number(e.target.value) as 12 | 24 | 36;
                              return draft;
                            })}
                          >
                            <option value={12}>12 months</option>
                            <option value={24}>24 months</option>
                            <option value={36}>36 months</option>
                          </select>
                        </label>

                        {isMajorProject && (
                          <label className="builder-field compact">
                            <span>Lease margin %</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={leaseMarginPercent}
                              onChange={(e) => updateQuote((draft) => {
                                draft.metadata.leaseMarginPercent = Math.max(parseNumber(e.target.value), 0);
                                return draft;
                              })}
                            />
                          </label>
                        )}
                      </div>

                      <div className={`rounded-[18px] border px-4 py-3 text-[13px] leading-[1.5] ${hasActiveDataAgreement ? "border-[#d9e7dd] bg-[#f5fbf6] text-[#365444]" : "border-[#f0d1d1] bg-[#fff1f1] text-[#7d4b4b]"}`}>
                        {hasActiveDataAgreement
                          ? isMajorProject
                            ? `Lease pricing is active. The monthly lease total below now includes the ${leaseMarginPercent}% hardware margin spread across the selected term.`
                            : "Lease pricing is active. The monthly lease total below spreads hardware across the selected term and adds recurring monthly service."
                          : "Lease pricing is locked until an active data agreement is confirmed. Turn this on to enable the lease monthly number."}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Purchase hardware total</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>
                      {isMajorProject && <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Lease margin ({leaseMarginPercent}%)</span><strong>{formatCurrency(leaseMarginAmount, currencyCode)}</strong></div>}
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Lease hardware base</span><strong>{formatCurrency(leaseEquipmentBase, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Selected term</span><strong>{selectedLeaseTerm} months</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Hardware per month</span><strong>{formatCurrency(leaseEquipmentMonthly, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Recurring monthly service</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>
                      <div className="rounded-[16px] border border-[#e8edf2] bg-[#fafcfd] px-4 py-3 text-[13px] text-[#5d6874]">
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Calculation breakdown</div>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between gap-3"><span>1. Equipment total</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>
                          {isMajorProject && <div className="flex items-center justify-between gap-3"><span>2. + Margin ({leaseMarginPercent}%)</span><strong>+ {formatCurrency(leaseMarginAmount, currencyCode)}</strong></div>}
                          <div className="flex items-center justify-between gap-3"><span>{isMajorProject ? "3." : "2."} Lease hardware base</span><strong>{formatCurrency(leaseEquipmentBase, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>{isMajorProject ? "4." : "3."} ÷ Term ({selectedLeaseTerm})</span><strong>{formatCurrency(leaseEquipmentMonthly, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>{isMajorProject ? "5." : "4."} + Recurring monthly service</span><strong>+ {formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>
                        </div>
                      </div>
                      <div className="border-t border-[#e8edf2] pt-3">
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Lease monthly</div>
                        <div className={`mt-1 text-[28px] font-semibold tracking-[-0.03em] ${hasActiveDataAgreement ? "text-[#b00000]" : "text-[#7f8a96]"}`}>
                          {hasActiveDataAgreement ? formatCurrency(leaseMonthly, currencyCode) : "Data agreement required"}
                        </div>
                        <div className="mt-1 text-[13px] text-[#60707f]">
                          {hasActiveDataAgreement
                            ? isMajorProject
                              ? `Formula: ${formatCurrency(equipmentTotal, currencyCode)} + ${leaseMarginPercent}% margin = ${formatCurrency(leaseEquipmentBase, currencyCode)}; then ${formatCurrency(leaseEquipmentBase, currencyCode)} ÷ ${selectedLeaseTerm} = ${formatCurrency(leaseEquipmentMonthly, currencyCode)}; then + ${formatCurrency(recurringMonthlyTotal, currencyCode)} recurring monthly service.`
                              : `Formula: ${formatCurrency(equipmentTotal, currencyCode)} ÷ ${selectedLeaseTerm} = ${formatCurrency(leaseEquipmentMonthly, currencyCode)}; then + ${formatCurrency(recurringMonthlyTotal, currencyCode)} recurring monthly service.`
                            : "This lease calculator stays disabled until the active data agreement box is checked."}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isMajorProject && majorProjectState && (
                <div id="major-project-workflow" className="major-project-workspace">
                  <div className="major-project-shell-header">
                    <div className="major-project-shell-copy">
                      <div className="builder-eyebrow">Major Project mode</div>
                      <h3 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#16202b]">Build the project once. Package it only when you need to.</h3>
                      <p className="mt-2 text-[13px] leading-[1.6] text-[#60707f]">
                        Components are the main work area. Bundles and customer quote lines stay available when you want a curated presentation layer, but they should not slow down the core quoting path.
                      </p>
                    </div>
                    <div className="major-project-shell-actions">
                      <button type="button" className="pill-button" onClick={addMajorProjectOption}>Add option</button>
                      <button type="button" className="pill-button" onClick={removeActiveMajorOption} disabled={(majorProjectState.options?.length ?? 0) <= 1}>Remove option</button>
                    </div>
                  </div>

                  <div className="major-project-overview-grid">
                    <div className="major-project-overview-primary">
                      <div className="major-project-overview-kicker">Recommended path</div>
                      <h4>Start in Components, then stop there if direct output is enough.</h4>
                      <p>
                        RapidQuote keeps Major Project on the mapped builder. Review imported items, confirm cost and sell logic, then flow them straight into proposal output unless the customer really needs extra packaging.
                      </p>
                      <div className="major-project-chip-row">
                        <span className="major-project-chip">{majorProjectUsesDirectComponentPath ? "Direct component output active" : "Structured output path available"}</span>
                        <span className="major-project-chip">{majorProjectMetrics.validation.errorCount} validation blocker{majorProjectMetrics.validation.errorCount === 1 ? "" : "s"}</span>
                        <span className="major-project-chip">{majorProjectState.commercial.termMonths} month term</span>
                      </div>
                    </div>
                    <div className="major-project-overview-stat">
                      <span>Mapped components</span>
                      <strong>{activeMajorOptionComponents.length}</strong>
                      <p>Internal items currently staged for pricing, specs, and output.</p>
                    </div>
                    <div className="major-project-overview-stat">
                      <span>Sites in scope</span>
                      <strong>{activeMajorOption?.siteCount ?? 0}</strong>
                      <p>Project footprint tied to the active option and workbook imports.</p>
                    </div>
                    <div className="major-project-overview-stat">
                      <span>Workflow state</span>
                      <strong>{majorProjectMetrics.validation.errorCount === 0 ? "Ready" : "Needs review"}</strong>
                      <p>{majorProjectMetrics.validation.errorCount === 0 ? "Preview and export are unblocked once commercial review is complete." : `${majorProjectMetrics.validation.errorCount} blocking validation item${majorProjectMetrics.validation.errorCount === 1 ? "" : "s"} still need cleanup.`}</p>
                    </div>
                  </div>

                  <div className="major-project-path-grid">
                    <button type="button" className={`major-project-path-card ${componentsStepStatus === "current" ? "major-project-path-card-current" : componentsStepStatus === "complete" ? "major-project-path-card-complete" : "major-project-path-card-locked"}`} onClick={() => setMajorProjectEditorTab("components")}>
                      <div className="major-project-path-step">Step 1</div>
                      <div className="major-project-path-title">Components</div>
                      <div className="major-project-path-copy">Required. Review imported items, clean up names, specs, and confirm cost and sell logic.</div>
                      <div className="major-project-path-meta">
                        <span>{componentsStepStatus === "current" ? "In progress" : "Ready"}</span>
                        <span>{activeMajorOptionComponents.length} item{activeMajorOptionComponents.length === 1 ? "" : "s"}</span>
                      </div>
                    </button>
                    <button type="button" className={`major-project-path-card ${bundlesStepStatus === "current" ? "major-project-path-card-current" : bundlesStepStatus === "complete" ? "major-project-path-card-complete" : "major-project-path-card-locked"}`} onClick={() => setMajorProjectEditorTab("bundles")} disabled={bundlesStepStatus === "locked"}>
                      <div className="major-project-path-step">Step 2</div>
                      <div className="major-project-path-title">Bundles</div>
                      <div className="major-project-path-copy">Optional. Group related components into priced packages only when the customer needs packaged presentation.</div>
                      <div className="major-project-path-meta">
                        <span>{bundlesStepStatus === "locked" ? "Later" : majorProjectCanSkipPackagingSteps ? "Optional" : bundlesStepStatus === "current" ? "Open" : "Ready"}</span>
                        <span>{activeMajorOptionBundles.length} bundle{activeMajorOptionBundles.length === 1 ? "" : "s"}</span>
                      </div>
                    </button>
                    <button type="button" className={`major-project-path-card ${quoteLinesStepStatus === "current" ? "major-project-path-card-current" : quoteLinesStepStatus === "complete" ? "major-project-path-card-complete" : "major-project-path-card-locked"}`} onClick={() => setMajorProjectEditorTab("quote_lines")} disabled={quoteLinesStepStatus === "locked"}>
                      <div className="major-project-path-step">Step 3</div>
                      <div className="major-project-path-title">Customer quote lines</div>
                      <div className="major-project-path-copy">Optional. Curate how Sections A, B, and C present when direct component output is not enough.</div>
                      <div className="major-project-path-meta">
                        <span>{quoteLinesStepStatus === "locked" ? "Later" : majorProjectCanSkipPackagingSteps ? "Optional" : quoteLinesStepStatus === "current" ? "Open" : "Ready"}</span>
                        <span>{activeMajorOptionQuoteLines.length} line{activeMajorOptionQuoteLines.length === 1 ? "" : "s"}</span>
                      </div>
                    </button>
                  </div>

                  <div className="major-project-shell-panel">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <label className="builder-field compact"><span>Project name</span><input value={majorProjectState.summary.projectName} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.projectName = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Active option</span><select value={majorProjectState.activeOptionId} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.activeOptionId = e.target.value; return draft; })}>{majorProjectState.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                      <label className="builder-field compact"><span>Sites</span><input type="number" value={activeMajorOption?.siteCount ?? 0} onChange={(e) => updateActiveMajorOption("siteCount", Math.max(parseNumber(e.target.value), 0))} /></label>
                      <label className="builder-field compact"><span>Term (months)</span><input type="number" min="1" value={majorProjectState.commercial.termMonths} onChange={(e) => updateMajorCommercialField("termMonths", Math.max(parseNumber(e.target.value), 1))} /></label>
                      <label className="builder-field compact"><span>Payment terms</span><input value={majorProjectState.summary.paymentTerms} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.paymentTerms = e.target.value; return draft; })} /></label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="builder-field compact"><span>Option label</span><input value={activeMajorOption?.label ?? ""} onChange={(e) => updateActiveMajorOption("label", e.target.value)} /></label>
                      <label className="builder-field"><span>Option description</span><input value={activeMajorOption?.description ?? ""} onChange={(e) => updateActiveMajorOption("description", e.target.value)} /></label>
                    </div>
                    <label className="builder-field"><span>Project description</span><textarea rows={3} value={majorProjectState.summary.projectDescription} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.projectDescription = e.target.value; return draft; })} /></label>
                    <MajorProjectSystemDrawingsField
                      attachments={majorProjectState.summary.systemDrawings ?? []}
                      onChange={(attachments) => updateMajorProjectQuote((draft) => {
                        if (draft.majorProject) {
                          draft.majorProject.summary.systemDrawings = attachments;
                        }
                        return draft;
                      })}
                    />
                    <div className="major-project-intake-shell">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-semibold text-[#16202b]">BOM workbook import</div>
                          <div className="mt-1 text-[12px] text-[#60707f]">Capture a workbook tab, review the extracted rows, and import draft components into the Major Project item list.</div>
                        </div>
                        {majorProjectState.bomImport ? <button type="button" className="rounded-full border border-[#d5dde6] bg-white px-3 py-1 text-[12px] font-semibold text-[#334150]" onClick={clearMajorProjectBomImport}>Remove workbook</button> : null}
                      </div>
                      <label
                        htmlFor={majorProjectBomInputId}
                        className={`mt-3 block w-full cursor-pointer rounded-[18px] border border-dashed bg-white px-4 py-4 text-left transition ${
                          isMajorProjectBomDragging
                            ? "border-[#2f6fed] bg-[#edf4ff]"
                            : majorProjectBomCaptureError
                              ? "border-[#d35a5a] bg-[#fff4f4]"
                              : "border-[#cfd7e0]"
                        }`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setIsMajorProjectBomDragging(true);
                        }}
                        onDragLeave={() => setIsMajorProjectBomDragging(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          setIsMajorProjectBomDragging(false);
                          const file = event.dataTransfer.files?.[0];
                          if (!file) return;
                          captureMajorProjectBomImport(file, "drop");
                        }}
                      >
                        <input
                          id={majorProjectBomInputId}
                          type="file"
                          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) captureMajorProjectBomImport(file, "picker");
                            event.target.value = "";
                          }}
                        />
                        <span className="block text-[14px] font-semibold text-[#17212c]">Drag and drop a BOM workbook here</span>
                        <span className="mt-1 block text-[12px] text-[#60707f]">Or click to choose an `.xlsx`, `.xls`, or `.csv` workbook.</span>
                        {majorProjectBomCaptureError ? (
                          <span className="mt-3 block rounded-[14px] border border-[#efc1c1] bg-[#fff1f1] px-3 py-3 text-[12px] text-[#7f1d1d]">
                            <strong className="block text-[13px] text-[#8f2424]">File rejected</strong>
                            <span className="mt-1 block">{majorProjectBomCaptureError.message}</span>
                            <span className="mt-2 block"><strong>File name:</strong> {majorProjectBomCaptureError.fileName}</span>
                            <span className="mt-1 block"><strong>File size:</strong> {formatAttachmentSize(majorProjectBomCaptureError.sizeBytes)}</span>
                            <span className="mt-1 block"><strong>File type:</strong> {formatMajorProjectBomFileType(majorProjectBomCaptureError.fileName, majorProjectBomCaptureError.mimeType)}</span>
                            {majorProjectBomCaptureError.mimeType ? <span className="mt-1 block"><strong>MIME type:</strong> {majorProjectBomCaptureError.mimeType}</span> : null}
                            <span className="mt-1 block">Rejected from {majorProjectBomCaptureError.source === "drop" ? "drag and drop" : "file picker"}.</span>
                          </span>
                        ) : null}
                        {majorProjectState.bomImport ? (
                          <span className="mt-3 block rounded-[14px] border border-[#e4ebf2] bg-[#f8fbfd] px-3 py-3 text-[12px] text-[#334150]">
                            <strong className="block text-[13px] text-[#16202b]">Captured workbook</strong>
                            <span className="mt-1 block">{formatAttachmentSize(majorProjectState.bomImport.sizeBytes)}{majorProjectState.bomImport.mimeType ? ` • ${majorProjectState.bomImport.mimeType}` : ""}</span>
                            <span className="mt-1 block">Review state: {getMajorProjectBomStatusLabel(majorProjectState.bomImport.status)}</span>
                            {formatAttachmentUpdatedAt(majorProjectState.bomImport.capturedAt) ? <span className="mt-1 block">Captured {formatAttachmentUpdatedAt(majorProjectState.bomImport.capturedAt)} via {majorProjectState.bomImport.source === "drop" ? "drag and drop" : "file picker"}</span> : null}
                            {majorProjectState.bomImport.sheetNames?.length ? (
                              <span className="mt-3 block rounded-[12px] border border-[#d9e6ef] bg-white px-3 py-3 text-[#334150]">
                                <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#60707f]">Workbook tabs</strong>
                                <span className="mt-2 block text-[12px]">{majorProjectState.bomImport.sheetNames.join(", ")}</span>
                              </span>
                            ) : null}
                            {majorProjectState.bomImport.readError ? (
                              <span className="mt-3 block rounded-[12px] border border-[#efc1c1] bg-[#fff1f1] px-3 py-3 text-[#7f1d1d]">
                                <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#8f2424]">Workbook read error</strong>
                                <span className="mt-2 block">{majorProjectState.bomImport.readError}</span>
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="mt-3 block rounded-[14px] border border-[#e4ebf2] bg-[#fdfefe] px-3 py-3 text-[12px] text-[#5f6d7a]">
                            Supported now: capture one workbook tab, confirm the mapped columns, and import the reviewed rows as draft components.
                          </span>
                        )}
                      </label>
                      {selectedMajorProjectBomSheet ? (
                        <div className="major-project-import-review-shell">
                          <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#60707f]">Draft component import</strong>
                          <label className="builder-field compact mt-3 block">
                            <span>Workbook tab</span>
                            <select value={majorProjectState.bomImport?.selectedSheetName ?? selectedMajorProjectBomSheet.name} onChange={(e) => setMajorProjectBomSelectedSheet(e.target.value)}>
                              {(majorProjectState.bomImport?.sheets ?? []).map((sheet) => (
                                <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                              ))}
                            </select>
                          </label>
                          <div className="mt-2 text-[12px]">
                            Showing {previewMajorProjectBomRows.length} preview row{previewMajorProjectBomRows.length === 1 ? "" : "s"} from the detected item table in the selected tab.
                            {selectedMajorProjectBomSheet.rowCount > selectedMajorProjectBomSheet.rows.length ? ` ${selectedMajorProjectBomSheet.rowCount} non-empty rows were captured in total.` : ""}
                          </div>
                          {previewMajorProjectBomRows.length === 0 ? (
                            <div className="mt-3 rounded-[12px] border border-[#f2d3b5] bg-[#fff8ef] px-3 py-3 text-[12px] text-[#8a4b16]">
                              No extracted workbook rows are available for this tab. If this workbook was captured before the latest BOM import update, remove it and upload it again in this same quote.
                            </div>
                          ) : null}
                          <div className="mt-3 rounded-[12px] border border-[#e4ebf2] bg-[#fbfdff] px-3 py-3 text-[12px] text-[#334150]">
                            <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#60707f]">Column mapping</strong>
                            <div className="mt-2 text-[12px] text-[#60707f]">
                              {selectedMajorProjectBomHeaderRowIndex >= 0
                                ? `Detected header row ${selectedMajorProjectBomSheet.rows[selectedMajorProjectBomHeaderRowIndex]?.rowNumber ?? selectedMajorProjectBomHeaderRowIndex + 1}. RapidQuote can import the visible line items directly${selectedMajorProjectBomDetectedFieldLabels.length ? ` using ${selectedMajorProjectBomDetectedFieldLabels.join(", ")}` : ""}. Adjust mapping only if you need to override it.`
                                : "No obvious header row was detected. You can still map the preview columns manually if this tab looks usable."}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className="pill-button pill-button-active" onClick={importDraftMajorProjectBomComponents}>
                              Import draft components
                            </button>
                            {!shouldForceMajorProjectBomColumnMapping ? (
                              <button
                                type="button"
                                className="pill-button"
                                onClick={() => setShowMajorProjectBomColumnMapping((current) => !current)}
                              >
                                {showMajorProjectBomColumnMapping ? "Hide mapping" : "Adjust mapping"}
                              </button>
                            ) : null}
                          </div>
                          {(showMajorProjectBomColumnMapping || shouldForceMajorProjectBomColumnMapping) ? (
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {MAJOR_PROJECT_BOM_REVIEW_FIELDS.map((field) => (
                                <label key={field.key} className="builder-field compact">
                                  <span>{field.label}</span>
                                  <select
                                    value={selectedMajorProjectBomReviewedColumnMap[field.key] ?? ""}
                                    onChange={(e) => setMajorProjectBomReviewedColumn(
                                      selectedMajorProjectBomSheet.name,
                                      field.key,
                                      e.target.value === "" ? null : Number(e.target.value),
                                    )}
                                  >
                                    <option value="">Not mapped</option>
                                    {selectedMajorProjectBomColumnOptions.map((option) => (
                                      <option key={`${field.key}-${option.value}`} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                              ))}
                            </div>
                          ) : null}
                          {majorProjectState.bomImport?.importedAt ? (
                            <div className="mt-2 space-y-3">
                              <div className="text-[12px] text-[#60707f]">
                                Last import: {majorProjectState.bomImport.importedComponentCount ?? 0} component{majorProjectState.bomImport.importedComponentCount === 1 ? "" : "s"}
                                {formatAttachmentUpdatedAt(majorProjectState.bomImport.importedAt) ? ` • ${formatAttachmentUpdatedAt(majorProjectState.bomImport.importedAt)}` : ""}
                              </div>
                              <div className="major-project-post-import-shell">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="text-[13px] font-semibold text-[#16202b]">Post-import review and optional packaging</div>
                                      <div className="mt-1 text-[12px] leading-[1.6] text-[#5f6d7a]">
                                        The BOM import feeds the internal component list first. Review those items, then either send them straight to proposal output or optionally package them into bundles and quote lines.
                                      </div>
                                    </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button type="button" className="pill-button" onClick={() => setMajorProjectEditorTab("components")}>Open Components</button>
                                    <button type="button" className="pill-button" onClick={beginImportedMajorProjectBundling}>Start bundling (optional)</button>
                                    <button type="button" className="pill-button" onClick={() => setMajorProjectEditorTab("quote_lines")}>Open Quote Lines (optional)</button>
                                  </div>
                                </div>
                                <div className="mt-3 rounded-[14px] border border-[#dce5fb] bg-[#f5f8ff] px-4 py-4 text-[13px] text-[#28446c]">
                                  <div className="text-[13px] font-semibold text-[#16202b]">Import results</div>
                                  <div className="mt-1 text-[12px] leading-[1.6] text-[#4f5e6d]">
                                    RapidQuote created {importedMajorProjectComponents.length} internal component{importedMajorProjectComponents.length === 1 ? "" : "s"} from this workbook.
                                    Vendor cost came across on {importedMajorProjectWithVendorCostCount} item{importedMajorProjectWithVendorCostCount === 1 ? "" : "s"}, customer pricing is seeded on {importedMajorProjectWithCustomerPricingCount},
                                    and {importedMajorProjectNeedsReviewCount} imported component{importedMajorProjectNeedsReviewCount === 1 ? "" : "s"} still need review before release.
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                  <WorkflowSummaryStat
                                    label="Components created"
                                    value={importedMajorProjectComponents.length}
                                    detail="Operations input is staged in the internal component list and ready for review."
                                    tone="success"
                                  />
                                  <WorkflowSummaryStat
                                    label="Vendor costs captured"
                                    value={importedMajorProjectWithVendorCostCount}
                                    detail="These items already have source cost available for margin and pricing decisions."
                                    tone={importedMajorProjectWithVendorCostCount === importedMajorProjectComponents.length ? "success" : "neutral"}
                                  />
                                  <WorkflowSummaryStat
                                    label="Customer pricing seeded"
                                    value={importedMajorProjectWithCustomerPricingCount}
                                    detail="Starter sell pricing is already on these imported items."
                                    tone={importedMajorProjectNeedsCustomerPricingCount === 0 ? "success" : "neutral"}
                                  />
                                  <WorkflowSummaryStat
                                    label="Still needs attention"
                                    value={importedMajorProjectNeedsReviewCount}
                                    detail="Missing labels, missing sell pricing, or output placement still need a pass."
                                    tone={importedMajorProjectNeedsReviewCount > 0 ? "warn" : "success"}
                                  />
                                </div>
                                <div className="mt-3 rounded-[12px] border border-[#d7e0e8] bg-white px-3 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">Next best review</div>
                                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-[1.6] text-[#435262]">
                                    {importedMajorProjectNextActions.map((item) => <li key={item}>{item}</li>)}
                                  </ul>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" className="pill-button" onClick={seedImportedMajorProjectCustomerLabels} disabled={importedMajorProjectNeedsCustomerLabelCount === 0}>Seed blank customer labels</button>
                                  <button type="button" className="pill-button" onClick={seedImportedMajorProjectPricingFromCost} disabled={importedMajorProjectNeedsCustomerPricingCount === 0}>Seed customer pricing from cost</button>
                                  <label className="builder-field compact min-w-[120px]">
                                    <span>Margin %</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="95"
                                      value={majorProjectImportedMarginPercent}
                                      onChange={(e) => setMajorProjectImportedMarginPercent(e.target.value)}
                                    />
                                  </label>
                                  <button type="button" className="pill-button" onClick={applyImportedMajorProjectMarginFromCost} disabled={importedMajorProjectNeedsCustomerPricingCount === 0}>Apply margin from cost</button>
                                  <div className="rounded-full border border-[#d7e0e8] bg-white px-3 py-2 text-[12px] font-medium text-[#435262]">
                                    {importedMajorProjectUnbundledCount} component{importedMajorProjectUnbundledCount === 1 ? "" : "s"} are still unbundled if you want optional packaging
                                  </div>
                                </div>
                                <div className="mt-3 rounded-[12px] border border-[#dce5fb] bg-[#f5f8ff] px-3 py-3 text-[12px] text-[#28446c]">
                                  <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#516a91]">Pricing default</strong>
                                  <span className="mt-1 block">{bomImportedPricingSummary}</span>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-3">
                                  <div className="rounded-[12px] border border-[#d7e0e8] bg-white px-3 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">1. Review components</div>
                                    <div className="mt-2 text-[12px] text-[#435262]">Clean up raw names, quantities, vendors, manufacturers, and cost basis on the imported rows before they become customer-ready.</div>
                                  </div>
                                  <div className="rounded-[12px] border border-[#d7e0e8] bg-white px-3 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">2. Adjust pricing only if needed</div>
                                    <div className="mt-2 text-[12px] text-[#435262]">Starter sell pricing is seeded automatically. Only change margin logic or supporting specs when the default output is not enough.</div>
                                  </div>
                                  <div className="rounded-[12px] border border-[#d7e0e8] bg-white px-3 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">3. Package only if needed</div>
                                    <div className="mt-2 text-[12px] text-[#435262]">You can stop after Components for direct output, or group items into bundles and quote lines when you want a curated presentation layer.</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {previewMajorProjectBomRows.length ? (
                            <div className="mt-3 rounded-[12px] border border-[#e4ebf2] bg-[#fbfdff] px-3 py-3 text-[12px] text-[#334150]">
                              <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#60707f]">Preview rows</strong>
                              {previewMajorProjectBomRows.map((row) => (
                                <div key={`${selectedMajorProjectBomSheet.name}-${row.rowNumber}`} className="mt-2">
                                  <strong>Row {row.rowNumber}:</strong> {row.cells.filter((cell) => cell.trim().length > 0).join(" | ")}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                  </div>

                    <div className="major-project-builder-shell">
                    <div className="major-project-panel-intro">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[14px] font-semibold text-[#16202b]">Mapped Builder</div>
                            <div className="mt-1 text-[12px] text-[#627181]">Major Project now uses the mapped builder only. Start with components, then add optional bundles and customer quote lines when you need them.</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="rounded-full border border-[#d7e0e8] bg-[#f8fbfd] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">
                              Single workflow
                            </span>
                            <span
                              aria-hidden="true"
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7e0e8] bg-[#f8fbfd] text-[16px] text-[#435262] transition-transform group-open:rotate-180"
                            >
                              ▾
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-[16px] border border-[#ead7da] bg-white px-4 py-3 text-[13px] text-[#5d6772]">
                        Existing Major Project options are normalized into mapped components automatically, so this workflow stays focused on the structured builder.
                      </div>
                    </div>

                    {renderMajorProjectVendorQuoteIntake()}

                      {majorProjectState.builderMode !== "advanced" ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                          <div>
                            <strong className="text-[#16202b]">Quick Quote with quote rows.</strong>
                            <div className="mt-1">Each row carries its own sell price, our cost, margin, and downstream bucket assignment.</div>
                          </div>
                          <button type="button" className="pill-button pill-button-active" onClick={addMajorProjectSimpleRow}>Add row</button>
                        </div>

                        <div className="rounded-[18px] border border-[#dce4ec] bg-[#f8fbfd] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-[14px] font-semibold text-[#16202b]">Vendor quote intake</div>
                              <div className="mt-1 text-[12px] text-[#60707f]">
                                Drop one or more vendor quote files here to seed draft line items. Spreadsheet quotes become preview rows. PDF quotes create a traceable placeholder row so the file can still drive the review workflow.
                              </div>
                            </div>
                            <div className="rounded-full border border-[#d7e0e8] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#60707f]">
                              {activeMajorOptionVendorQuotes.length} quote{activeMajorOptionVendorQuotes.length === 1 ? "" : "s"}
                            </div>
                          </div>
                          <label
                            htmlFor={majorProjectVendorQuoteInputId}
                            className={`mt-3 block w-full rounded-[18px] border border-dashed bg-white px-4 py-4 text-left transition ${
                              isMajorProjectVendorQuoteDragging
                                ? "border-[#2f6fed] bg-[#edf4ff]"
                                : majorProjectVendorQuoteCaptureError
                                  ? "border-[#d35a5a] bg-[#fff4f4]"
                                  : "border-[#cfd7e0]"
                            }`}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setIsMajorProjectVendorQuoteDragging(true);
                            }}
                            onDragLeave={() => setIsMajorProjectVendorQuoteDragging(false)}
                            onDrop={(event) => {
                              event.preventDefault();
                              setIsMajorProjectVendorQuoteDragging(false);
                              captureMajorProjectVendorQuotes(event.dataTransfer.files, "drop");
                            }}
                          >
                            <input
                              id={majorProjectVendorQuoteInputId}
                              type="file"
                              multiple
                              accept=".xlsx,.xls,.csv,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
                              className="hidden"
                              onChange={(event) => {
                                captureMajorProjectVendorQuotes(event.target.files, "picker");
                                event.target.value = "";
                              }}
                            />
                            <span className="block text-[14px] font-semibold text-[#17212c]">Drag and drop vendor quote files here</span>
                            <span className="mt-1 block text-[12px] text-[#60707f]">Or click to choose multiple `.xlsx`, `.xls`, `.csv`, or `.pdf` files. Imported draft rows keep vendor cost from the quote and can seed customer pricing from a margin %.</span>
                            {majorProjectVendorQuoteCaptureError ? (
                              <span className="mt-3 block rounded-[14px] border border-[#efc1c1] bg-[#fff1f1] px-3 py-3 text-[12px] text-[#7f1d1d]">
                                <strong className="block text-[13px] text-[#8f2424]">File rejected</strong>
                                <span className="mt-1 block">{majorProjectVendorQuoteCaptureError.message}</span>
                                <span className="mt-2 block text-[11px] text-[#9b4b4b]">
                                  {majorProjectVendorQuoteCaptureError.fileName} • {formatAttachmentSize(majorProjectVendorQuoteCaptureError.sizeBytes)} • {formatMajorProjectVendorQuoteFileType(majorProjectVendorQuoteCaptureError.fileName, majorProjectVendorQuoteCaptureError.mimeType)}
                                </span>
                              </span>
                            ) : null}
                          </label>

                          {activeMajorOptionVendorQuotes.length ? (
                            <div className="mt-4 space-y-3">
                              {activeMajorOptionVendorQuotes.map((vendorQuote) => (
                                <div key={vendorQuote.id} className="rounded-[18px] border border-[#dfe6ed] bg-white p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">{getMajorProjectVendorQuoteStatusLabel(vendorQuote.status)}</div>
                                      <div className="mt-1 text-[16px] font-semibold text-[#16202b]">{vendorQuote.fileName}</div>
                                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#60707f]">
                                        <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-3 py-1">{formatAttachmentSize(vendorQuote.sizeBytes)}</span>
                                        <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-3 py-1">{formatMajorProjectVendorQuoteFileType(vendorQuote.fileName, vendorQuote.mimeType)}</span>
                                        <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-3 py-1">{vendorQuote.previewItems?.length ?? 0} preview item{(vendorQuote.previewItems?.length ?? 0) === 1 ? "" : "s"}</span>
                                        {vendorQuote.importedRowIds?.length ? <span className="rounded-full border border-[#dbe7df] bg-[#f5fbf6] px-3 py-1 text-[#215a36]">{vendorQuote.importedRowIds.length} draft row{vendorQuote.importedRowIds.length === 1 ? "" : "s"} created</span> : null}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className="pill-button pill-button-active"
                                        disabled={vendorQuote.status !== "loaded" || !(vendorQuote.previewItems?.length)}
                                        onClick={() => importMajorProjectVendorQuoteRows(vendorQuote.id)}
                                      >
                                        Add draft rows
                                      </button>
                                      <button type="button" className="danger-button" onClick={() => removeActiveMajorVendorQuote(vendorQuote.id)}>Remove</button>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1.3fr_.7fr]">
                                    <label className="builder-field compact">
                                      <span>Vendor / source label</span>
                                      <input
                                        value={vendorQuote.vendorName ?? ""}
                                        onChange={(event) => updateActiveMajorVendorQuote(vendorQuote.id, (current) => ({ ...current, vendorName: event.target.value }))}
                                        placeholder="Enter vendor name"
                                      />
                                    </label>
                                    <label className="builder-field compact">
                                      <span>Quote reference</span>
                                      <input
                                        value={vendorQuote.quoteLabel ?? ""}
                                        onChange={(event) => updateActiveMajorVendorQuote(vendorQuote.id, (current) => ({ ...current, quoteLabel: event.target.value }))}
                                        placeholder="Internal quote label or file reference"
                                      />
                                    </label>
                                    <label className="builder-field compact">
                                      <span>Margin %</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="95"
                                        value={vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT}
                                        onChange={(event) => updateActiveMajorVendorQuote(vendorQuote.id, (current) => ({
                                          ...current,
                                          pricingMarginPercent: Math.min(Math.max(parseNumber(event.target.value), 0), 95),
                                        }))}
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-3 rounded-[12px] border border-[#dce5fb] bg-[#f5f8ff] px-3 py-3 text-[12px] text-[#28446c]">
                                    <strong className="block text-[12px] uppercase tracking-[0.12em] text-[#516a91]">Pricing default</strong>
                                    <span className="mt-1 block">{buildMarginPricingSummary(vendorQuote.previewItems?.find((item) => Math.max(item.unitCost ?? item.unitPrice, 0) > 0)?.unitCost ?? vendorQuote.previewItems?.find((item) => Math.max(item.unitCost ?? item.unitPrice, 0) > 0)?.unitPrice, vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT, currencyCode)}</span>
                                  </div>

                                  {vendorQuote.status === "loaded" && !(vendorQuote.importedRowIds?.length) ? (
                                    <div className="mt-3 rounded-[14px] border border-[#dce5fb] bg-[#f5f8ff] px-3 py-3 text-[12px] text-[#28446c]">
                                      This file is staged only. Choose <strong>Add draft rows</strong> to apply the parsed rows to the live quote using vendor cost plus the margin % above for customer pricing.
                                    </div>
                                  ) : null}

                {vendorQuote.readError ? (
                  <div className="mt-3 rounded-[14px] border border-[#efc1c1] bg-[#fff1f1] px-3 py-3 text-[12px] text-[#7f1d1d]">{vendorQuote.readError}</div>
                ) : null}

              {vendorQuote.previewItems?.length ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <WorkflowSummaryStat
                    label="Parsed items"
                    value={vendorQuote.previewItems.length}
                    detail="RapidQuote found these rows and staged them for builder review."
                    tone="success"
                  />
                  <WorkflowSummaryStat
                    label="Vendor costs captured"
                    value={vendorQuote.previewItems.filter((item) => Math.max(item.unitCost ?? item.unitPrice, 0) > 0).length}
                    detail="These preview rows already have usable cost for seeded pricing."
                    tone="neutral"
                  />
                  <WorkflowSummaryStat
                    label="Charge rows"
                    value={vendorQuote.previewItems.filter((item) => item.rowKind === "charge").length}
                    detail="Charges are kept visible so you can decide whether they belong in the quote."
                    tone="neutral"
                  />
                  <WorkflowSummaryStat
                    label="Needs review"
                    value={vendorQuote.previewItems.filter((item) => !(item.label ?? "").trim() || Math.max(item.unitCost ?? item.unitPrice, 0) <= 0).length}
                    detail="These rows still need cleanup because label or cost confidence is weak."
                    tone={vendorQuote.previewItems.some((item) => !(item.label ?? "").trim() || Math.max(item.unitCost ?? item.unitPrice, 0) <= 0) ? "warn" : "success"}
                  />
                </div>
              ) : null}

              {vendorQuote.previewItems?.length ? (
                <div className="mt-3 rounded-[16px] border border-[#e5ebf1] bg-[#fbfdff] p-3">
                                      <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#60707f]">Draft row preview</div>
                                      {vendorQuote.previewItems.length > MAJOR_PROJECT_VENDOR_QUOTE_PREVIEW_ITEM_COUNT ? (
                                        <div className="mt-1 text-[12px] text-[#60707f]">Showing the first {MAJOR_PROJECT_VENDOR_QUOTE_PREVIEW_ITEM_COUNT} parsed rows. Import will create all {vendorQuote.previewItems.length} draft rows.</div>
                                      ) : null}
                                      <div className="mt-2 space-y-2">
                                        {vendorQuote.previewItems.slice(0, MAJOR_PROJECT_VENDOR_QUOTE_PREVIEW_ITEM_COUNT).map((item) => (
                                          <div key={item.id} className="rounded-[14px] border border-[#e6edf3] bg-white px-3 py-3 text-[12px] text-[#42515f]">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                              <strong className="text-[13px] text-[#16202b]">{item.label}</strong>
                                              <div className="flex flex-wrap gap-2">
                                                <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-2 py-1">{majorProjectBucketLabel(item.bucket)}</span>
                                                <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-2 py-1">{item.quantity} {item.unit || "ea"}</span>
                                                {item.rowNumber ? <span className="rounded-full border border-[#e1e7ed] bg-[#f8fbfd] px-2 py-1">Source row {item.rowNumber}</span> : null}
                                              </div>
                                            </div>
                                            {item.description ? <div className="mt-2 text-[#5f6c78]">{item.description}</div> : null}
                                            <div className="mt-2 flex flex-wrap gap-4 text-[#5f6c78]">
                                              <span>Vendor cost {formatCurrency(Math.max(item.unitCost ?? item.unitPrice, 0), currencyCode)}</span>
                                              <span>Seeded sell {formatCurrency(applyMarginToCost(Math.max(item.unitCost ?? item.unitPrice, 0), vendorQuote.pricingMarginPercent ?? DEFAULT_IMPORTED_MARGIN_PERCENT), currencyCode)}</span>
                                              <span>Ext. {formatCurrency(item.extendedPrice, currencyCode)}</span>
                                              {item.vendor ? <span>Vendor {item.vendor}</span> : null}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {activeMajorOptionSimpleRows.length > 0 ? (
                          <details className="rounded-[18px] border border-[#e1e7ed] bg-[#fbfcfe] p-4">
                            <summary className="cursor-pointer list-none text-[14px] font-semibold text-[#16202b]">Show bucket totals</summary>
                            <div className="mt-4 grid gap-4 xl:grid-cols-3">
                              {majorProjectBucketOptions.map((bucket) => {
                                const bucketTotals = majorProjectSimpleBucketSummary[bucket.value] ?? { revenue: 0, cost: 0 };
                                return (
                                  <div key={bucket.value} className="rounded-[18px] border border-[#e1e7ed] bg-white p-4">
                                    <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">{bucket.label}</div>
                                    <div className="mt-1 text-[13px] text-[#60707f]">{bucket.note}</div>
                                    <div className="mt-3 space-y-2 text-[13px] text-[#51606d]">
                                      <div className="flex items-center justify-between gap-3"><span>Revenue</span><strong>{formatCurrency(bucketTotals.revenue, currencyCode)}</strong></div>
                                      <div className="flex items-center justify-between gap-3"><span>Cost</span><strong>{formatCurrency(bucketTotals.cost, currencyCode)}</strong></div>
                                      <div className="flex items-center justify-between gap-3"><span>Margin</span><strong>{formatPercent(majorProjectMarginPercent(bucketTotals.revenue, bucketTotals.cost))}</strong></div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        ) : null}

                        {activeMajorOptionSimpleRows.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No rows yet. Add the first Major Project row to start building pricing, cost, and margin directly.</div>
                        ) : (
                          <div className="space-y-3">
                            {activeMajorOptionSimpleRows.map((row, index) => {
                              const rowRevenue = row.customerExtendedPrice;
                              const rowCost = row.ourExtendedCost;
                              const rowGrossProfit = rowRevenue - rowCost;
                              const rowMargin = majorProjectMarginPercent(rowRevenue, rowCost);
                              return (
                                <div key={row.id} className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Major Project row {index + 1}</div>
                                      <div className="mt-1 text-[18px] font-semibold text-[#16202b]">{row.label}</div>
                                      <div className="major-project-chip-row mt-2">
                                        <span className="major-project-chip">{majorProjectBucketLabel(row.bucket)}</span>
                                        <span className="major-project-chip">{row.quantity} {row.unit || "ea"}</span>
                                        {row.importSource ? <span className="major-project-chip">Vendor quote: {row.importSource.vendorName || row.importSource.fileName}</span> : null}
                                        {row.importSource?.rowNumber ? <span className="major-project-chip">Source row {row.importSource.rowNumber}</span> : null}
                                      </div>
                                    </div>
                                    <RowActions
                                      totalRows={activeMajorOptionSimpleRows.length}
                                      rowNumber={index + 1}
                                      onMoveUp={() => moveMajorProjectSimpleRow(row.id, -1)}
                                      onMoveDown={() => moveMajorProjectSimpleRow(row.id, 1)}
                                      onMoveTo={(targetPosition) => moveMajorProjectSimpleRowToPosition(row.id, targetPosition)}
                                      onDuplicate={() => duplicateMajorProjectSimpleRow(row.id)}
                                      onRemove={() => removeMajorProjectSimpleRow(row.id)}
                                    />
                                  </div>
                                  {row.bucket === "hardware" ? (
                                    <div className="mt-3 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
                                      <NormalizedHardwarePreviewCard
                                        imageUrl={row.imageUrl}
                                        altText={row.label || row.description || `Major Project row ${index + 1}`}
                                      />
                                      <label className="builder-field compact">
                                        <span>Image URL</span>
                                        <input
                                          value={row.imageUrl ?? ""}
                                          onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, imageUrl: e.target.value.trim() || undefined }))}
                                          placeholder="https://..."
                                        />
                                      </label>
                                    </div>
                                  ) : null}
                                  <div className="grid gap-3 lg:grid-cols-[1.3fr_1.1fr_.7fr_1fr_1fr_1fr]">
                                    <label className="builder-field compact"><span>Label / name</span><input value={row.label} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, label: e.target.value }))} /></label>
                                    <label className="builder-field compact"><span>Bucket</span><select value={row.bucket} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, bucket: e.target.value as MajorProjectSimpleBucket }))}>{majorProjectBucketOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                                    <label className="builder-field compact"><span>Qty</span><input type="number" step="0.01" value={row.quantity} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => { const quantity = Math.max(parseNumber(e.target.value), 0); return { ...current, quantity, customerExtendedPrice: Number((quantity * current.customerUnitPrice).toFixed(2)), ourExtendedCost: Number((quantity * current.ourUnitCost).toFixed(2)) }; })} /></label>
                                    <label className="builder-field compact"><span>Unit</span><input value={row.unit ?? ""} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, unit: e.target.value }))} /></label>
                                    <label className="builder-field compact"><span>Customer price</span><input type="number" step="0.01" value={row.customerUnitPrice} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => { const customerUnitPrice = Math.max(parseNumber(e.target.value), 0); return { ...current, customerUnitPrice, customerExtendedPrice: Number((current.quantity * customerUnitPrice).toFixed(2)) }; })} /></label>
                                    <label className="builder-field compact"><span>Our cost</span><input type="number" step="0.01" value={row.ourUnitCost} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => { const ourUnitCost = Math.max(parseNumber(e.target.value), 0); return { ...current, ourUnitCost, ourExtendedCost: Number((current.quantity * ourUnitCost).toFixed(2)) }; })} /></label>
                                  </div>
                                  <label className="builder-field compact mt-3"><span>Description</span><textarea rows={2} value={row.description ?? ""} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, description: e.target.value }))} /></label>
                                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                    <label className="builder-field compact"><span>Supporting spec label</span><input value={row.specSheetLabel ?? ""} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, specSheetLabel: e.target.value }))} placeholder="Starlink Performance dish spec" /></label>
                                    <label className="builder-field compact"><span>Internal spec location</span><input value={row.specSheetLocation ?? ""} onChange={(e) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, specSheetLocation: e.target.value }))} placeholder="SharePoint / vendor folder / PDF name" /></label>
                                  </div>
                                  <MajorProjectSpecAttachmentField
                                    itemId={row.id}
                                    attachment={row.specSheetAttachment}
                                    specSheetLabel={row.specSheetLabel}
                                    onAttachmentChange={(attachment) => {
                                      const previousAttachment = row.specSheetAttachment;
                                      updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, specSheetAttachment: attachment }));
                                      if (previousAttachment?.storageKey !== attachment?.storageKey) {
                                        releaseMajorProjectSpecAttachmentIfUnused(previousAttachment);
                                      }
                                    }}
                                    onSpecSheetLabelChange={(value) => updateActiveMajorSimpleRow(row.id, (current) => ({ ...current, specSheetLabel: value }))}
                                  />
                                  <div className="mt-3 grid gap-3 md:grid-cols-5 text-[12px] text-[#5f6c78]">
                                    <div className="rounded-[14px] bg-white px-3 py-2">Ext. revenue {formatCurrency(rowRevenue, currencyCode)}</div>
                                    <div className="rounded-[14px] bg-white px-3 py-2">Ext. cost {formatCurrency(rowCost, currencyCode)}</div>
                                    <div className="rounded-[14px] bg-white px-3 py-2">GP {formatCurrency(rowGrossProfit, currencyCode)}</div>
                                    <div className="rounded-[14px] bg-white px-3 py-2">Margin {formatPercent(rowMargin)}</div>
                                    <div className="rounded-[14px] bg-white px-3 py-2">Proposal section {row.bucket === "hardware" ? "Section B" : row.bucket === "install" ? "Section C" : "Section A"}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      ) : null}

                    {majorProjectState.builderMode === "advanced" && (
                    <>
                    <MajorProjectStepCard
                      step="1"
                      title="Components"
                      count={activeMajorOptionComponents.length}
                      status={componentsStepStatus}
                      summary="Build the priced project scope with the parts, services, labor, cost, and sell price you need."
                      detail="This is the item/spec setup home. Bundles and proposal quote lines are optional downstream packaging layers."
                      onOpen={() => setMajorProjectEditorTab("components")}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                          <div>
                            <strong className="text-[#16202b]">Components are the foundation for this workflow.</strong>
                            <div className="mt-1">Set pricing, cost, schedule, and supporting specs here first. Leave items unassigned when they should flow straight to output.</div>
                          </div>
                          <button type="button" className="pill-button pill-button-active" onClick={() => addMajorProjectComponent()}>Add component</button>
                        </div>
                        {majorProjectComponentBundleDraft ? (
                          <div className="rounded-[18px] border border-[#ead9db] bg-[#fff7f7] p-4 text-[13px] text-[#5d6772]">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <strong className="text-[#16202b]">Bundle with this</strong>
                                <div className="mt-1">Select the other components that belong with this item. The generated bundle and customer quote line will use the next line item number automatically.</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="pill-button pill-button-active"
                                  onClick={confirmMajorProjectComponentBundleDraft}
                                  disabled={majorProjectComponentBundleDraft.selectedComponentIds.length < 2}
                                >
                                  Create bundle
                                </button>
                                <button type="button" className="pill-button" onClick={cancelMajorProjectComponentBundleDraft}>Cancel</button>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-3">
                              <div className="rounded-[16px] border border-[#eadfe2] bg-white px-4 py-3">
                                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Starting item</div>
                                <div className="mt-1 font-semibold text-[#16202b]">
                                  {activeMajorOptionComponents.find((component) => component.id === majorProjectComponentBundleDraft.sourceComponentId)?.internalName || "Selected component"}
                                </div>
                              </div>
                              <div className="rounded-[16px] border border-[#eadfe2] bg-white px-4 py-3">
                                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Items selected</div>
                                <div className="mt-1 font-semibold text-[#16202b]">{majorProjectComponentBundleDraft.selectedComponentIds.length}</div>
                              </div>
                              <div className="rounded-[16px] border border-[#eadfe2] bg-white px-4 py-3">
                                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Customer label</div>
                                <div className="mt-1 font-semibold text-[#16202b]">Next line item number</div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="major-project-toolbar">
                          <label className="builder-field compact major-project-toolbar-search"><span>Find component</span><input value={majorProjectComponentSearch} onChange={(e) => setMajorProjectComponentSearch(e.target.value)} placeholder="Search name, vendor, line type, notes" /></label>
                          <label className="builder-field compact"><span>Schedule</span><select value={majorProjectComponentScheduleFilter} onChange={(e) => setMajorProjectComponentScheduleFilter(e.target.value as MajorProjectScheduleFilter)}><option value="all">All schedules</option><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                          <div className="major-project-toolbar-stat"><strong>{filteredMajorProjectComponents.length}</strong><span>showing</span></div>
                          <div className="major-project-toolbar-stat"><strong>{activeMajorOptionComponents.length}</strong><span>total</span></div>
                        </div>

                        {activeMajorOptionComponents.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No components yet. Add the first component so there is real pricing behind the project.</div>
                        ) : filteredMajorProjectComponents.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No components match the current filter. Clear the search or schedule filter to see everything again.</div>
                        ) : filteredMajorProjectComponents.map((component) => {
                          const index = activeMajorOptionComponents.findIndex((entry) => entry.id === component.id);
                          const componentRevenue = component.customerExtendedPrice;
                          const componentCost = component.vendorExtendedCost;
                          const componentGrossProfit = componentRevenue - componentCost;
                          const componentMargin = majorProjectMarginPercent(componentRevenue, componentCost);
                          const assignedBundleLabel = bundleOptions.find((bundle) => bundle.id === component.bundleAssignmentId)?.label ?? "Unassigned";
                          const isSelectedForBundle = majorProjectComponentBundleDraft?.selectedComponentIds.includes(component.id) ?? false;
                          const isBundleSource = majorProjectComponentBundleDraft?.sourceComponentId === component.id;
                          return (
                          <div key={component.id} className={`rounded-[18px] border bg-[#fbfcfe] p-4 ${isSelectedForBundle ? "border-[#c75b5b] bg-[#fff8f8]" : "border-[#dde3e8]"}`}>
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Component {index + 1}</div>
                                <div className="mt-1 text-[18px] font-semibold text-[#16202b]">{component.internalName || `Component ${index + 1}`}</div>
                                <div className="major-project-chip-row mt-2">
                                  <span className="major-project-chip">{component.schedule === "recurring" ? "Recurring" : "One-time"}</span>
                                  <span className="major-project-chip">{component.vendor || "No vendor"}</span>
                                  <span className="major-project-chip">{assignedBundleLabel}</span>
                                  {component.importSource ? <span className="major-project-chip">Vendor quote: {component.importSource.vendorName || component.importSource.fileName}</span> : null}
                                  {component.importSource?.rowNumber ? <span className="major-project-chip">Source row {component.importSource.rowNumber}</span> : null}
                                  {isBundleSource ? <span className="major-project-chip">Bundle anchor</span> : null}
                                </div>
                              </div>
                              <div className="flex max-w-full flex-col items-stretch gap-2">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {majorProjectComponentBundleDraft ? (
                                    <label className="inline-flex items-center gap-2 rounded-full border border-[#d7dde4] bg-white px-3 py-2 text-[12px] font-semibold text-[#24303b]">
                                      <input
                                        type="checkbox"
                                        checked={isSelectedForBundle}
                                        onChange={() => toggleMajorProjectComponentBundleSelection(component.id)}
                                        disabled={isBundleSource}
                                      />
                                      {isBundleSource ? "Starting item" : "Include in bundle"}
                                    </label>
                                  ) : (
                                    <button type="button" className="pill-button" onClick={() => startMajorProjectComponentBundleDraft(component)}>Bundle with this</button>
                                  )}
                                  <button type="button" className="pill-button" onClick={() => addMajorProjectComponent(component.bundleAssignmentId ?? "")}>Add similar</button>
                                </div>
                                <RowActions
                                  rowNumber={index + 1}
                                  totalRows={activeMajorOptionComponents.length}
                                  onMoveUp={() => moveMajorProjectComponent(component.id, -1)}
                                  onMoveDown={() => moveMajorProjectComponent(component.id, 1)}
                                  onMoveTo={(targetPosition) => moveMajorProjectComponentToPosition(component.id, targetPosition)}
                                  onDuplicate={() => duplicateMajorProjectComponent(component.id)}
                                  onRemove={() => removeMajorProjectComponent(component.id)}
                                />
                              </div>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                              <label className="builder-field compact lg:col-span-2 xl:col-span-2"><span>Component name</span><input value={component.internalName} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, internalName: e.target.value }))} /></label>
                              <label className="builder-field compact lg:col-span-2 xl:col-span-2"><span>Customer label (optional)</span><input value={component.customerFacingLabel ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, customerFacingLabel: e.target.value }))} /></label>
                              <label className="builder-field compact">
                                <span>Vendor</span>
                                <select
                                  value={resolvePresetOrCustomSelection(component.vendor, majorProjectVendorOptions)}
                                  onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({
                                    ...current,
                                    vendor: e.target.value === MAJOR_PROJECT_CUSTOM_OPTION ? MAJOR_PROJECT_CUSTOM_OPTION : e.target.value,
                                  }))}
                                >
                                  <option value="">Select vendor</option>
                                  {majorProjectVendorOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                  <option value={MAJOR_PROJECT_CUSTOM_OPTION}>{MAJOR_PROJECT_CUSTOM_OPTION}</option>
                                </select>
                                {resolvePresetOrCustomSelection(component.vendor, majorProjectVendorOptions) === MAJOR_PROJECT_CUSTOM_OPTION ? (
                                  <input
                                    className="mt-2"
                                    value={component.vendor === MAJOR_PROJECT_CUSTOM_OPTION ? "" : component.vendor}
                                    onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, vendor: e.target.value }))}
                                    placeholder="Enter custom vendor"
                                  />
                                ) : null}
                              </label>
                              <label className="builder-field compact">
                                <span>Manufacturer / Service Provider</span>
                                <select
                                  value={resolvePresetOrCustomSelection(component.manufacturer ?? "", majorProjectManufacturerOptions)}
                                  onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({
                                    ...current,
                                    manufacturer: e.target.value === MAJOR_PROJECT_CUSTOM_OPTION ? MAJOR_PROJECT_CUSTOM_OPTION : e.target.value,
                                  }))}
                                >
                                  <option value="">Select manufacturer / service provider</option>
                                  {majorProjectManufacturerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                  <option value={MAJOR_PROJECT_CUSTOM_OPTION}>{MAJOR_PROJECT_CUSTOM_OPTION}</option>
                                </select>
                                {resolvePresetOrCustomSelection(component.manufacturer ?? "", majorProjectManufacturerOptions) === MAJOR_PROJECT_CUSTOM_OPTION ? (
                                  <input
                                    className="mt-2"
                                    value={component.manufacturer === MAJOR_PROJECT_CUSTOM_OPTION ? "" : component.manufacturer ?? ""}
                                    onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, manufacturer: e.target.value }))}
                                    placeholder="Enter custom manufacturer or service provider"
                                  />
                                ) : null}
                              </label>
                              <label className="builder-field compact"><span>Line type</span><select value={component.lineType} onChange={(e) => updateActiveMajorComponent(component.id, (current) => { const lineType = e.target.value as MajorProjectComponent["lineType"]; return { ...current, lineType, category: majorProjectLineTypeLabel(lineType) }; })}><option value="hardware">Hardware</option><option value="software">Software</option><option value="subscription">Subscription</option><option value="installation">Installation</option><option value="service">Service</option><option value="support">Support</option><option value="managed_service">Managed service</option><option value="optional_service">Optional service</option><option value="internal_labor">Internal labor</option><option value="shipping">Shipping</option><option value="tax">Tax</option><option value="other">Other</option></select></label>
                              <label className="builder-field compact"><span>Schedule</span><select value={component.schedule} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, schedule: e.target.value as MajorProjectComponent["schedule"] }))}><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                              <label className="builder-field compact"><span>Bundle assignment</span><select value={component.bundleAssignmentId ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, bundleAssignmentId: e.target.value }))}><option value="">Unassigned</option>{bundleOptions.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.label}</option>)}</select></label>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                              <label className="builder-field compact"><span>Qty</span><input type="number" step="0.01" value={component.quantity} onChange={(e) => updateActiveMajorComponent(component.id, (current) => { const quantity = Math.max(parseNumber(e.target.value), 0); return { ...current, quantity, customerExtendedPrice: Number((quantity * current.customerUnitPrice).toFixed(2)), vendorExtendedCost: Number((quantity * current.vendorUnitCost).toFixed(2)) }; })} /></label>
                              <label className="builder-field compact"><span>Unit</span><input value={component.unit} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, unit: e.target.value }))} /></label>
                              <label className="builder-field compact"><span>Customer unit price</span><input type="number" step="0.01" value={component.customerUnitPrice} onChange={(e) => updateActiveMajorComponent(component.id, (current) => { const customerUnitPrice = Math.max(parseNumber(e.target.value), 0); return { ...current, customerUnitPrice, customerExtendedPrice: Number((current.quantity * customerUnitPrice).toFixed(2)) }; })} /></label>
                              <label className="builder-field compact"><span>Vendor unit cost</span><input type="number" step="0.01" value={component.vendorUnitCost} onChange={(e) => updateActiveMajorComponent(component.id, (current) => { const vendorUnitCost = Math.max(parseNumber(e.target.value), 0); return { ...current, vendorUnitCost, vendorExtendedCost: Number((current.quantity * vendorUnitCost).toFixed(2)) }; })} /></label>
                            </div>
                            {component.lineType === "hardware" ? (
                              <div className="mt-3 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
                                <NormalizedHardwarePreviewCard
                                  imageUrl={component.imageUrl}
                                  altText={component.customerFacingLabel || component.internalName || "Major Project component"}
                                />
                                <label className="builder-field compact">
                                  <span>Image URL</span>
                                  <input
                                    value={component.imageUrl ?? ""}
                                    onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, imageUrl: e.target.value.trim() || undefined }))}
                                    placeholder="https://..."
                                  />
                                </label>
                              </div>
                            ) : null}
                            <label className="builder-field compact mt-3">
                              <span>Line item description</span>
                              <textarea rows={2} value={component.notes ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, notes: e.target.value }))} placeholder="Customer-facing description that should travel with this line item" />
                            </label>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              <label className="builder-field compact"><span>Supporting spec label</span><input value={component.specSheetLabel ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, specSheetLabel: e.target.value }))} placeholder="Optional customer-facing spec label" /></label>
                              <label className="builder-field compact"><span>Internal spec location</span><input value={component.specSheetLocation ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, specSheetLocation: e.target.value }))} placeholder="SharePoint / vendor folder / PDF name" /></label>
                            </div>
                            <MajorProjectSpecAttachmentField
                              itemId={component.id}
                              attachment={component.specSheetAttachment}
                              specSheetLabel={component.specSheetLabel}
                              onAttachmentChange={(attachment) => {
                                const previousAttachment = component.specSheetAttachment;
                                updateActiveMajorComponent(component.id, (current) => ({ ...current, specSheetAttachment: attachment }));
                                if (previousAttachment?.storageKey !== attachment?.storageKey) {
                                  releaseMajorProjectSpecAttachmentIfUnused(previousAttachment);
                                }
                              }}
                              onSpecSheetLabelChange={(value) => updateActiveMajorComponent(component.id, (current) => ({ ...current, specSheetLabel: value }))}
                            />
                            <div className="mt-3 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                              <div className="text-[14px] font-semibold text-[#16202b]">Pricing controls</div>
                              <div className="mt-1 text-[12px] text-[#6a7682]">Keep commercial basis and pass-through settings available without hiding the line item description.</div>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                                <label className="builder-field compact"><span>Cost basis</span><select value={component.costBasis} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, costBasis: e.target.value as MajorProjectComponent["costBasis"] }))}><option value="vendor_quote">Vendor quote</option><option value="msrp">MSRP</option><option value="estimate">Estimate</option><option value="internal_labor">Internal labor</option><option value="blended">Blended</option><option value="other">Other</option></select></label>
                                <label className="builder-field compact"><span>Resale basis</span><select value={component.resaleBasis} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, resaleBasis: e.target.value as MajorProjectComponent["resaleBasis"] }))}><option value="fixed_fee">Fixed fee</option><option value="cost_plus">Cost plus</option><option value="target_margin">Target margin</option><option value="pass_through">Pass through</option><option value="bundle">Bundle</option><option value="other">Other</option></select></label>
                                <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-white px-4 py-3 text-[14px] font-medium text-[#24303b]"><input type="checkbox" checked={component.passThrough} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, passThrough: e.target.checked }))} /> Pass-through</label>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-4 text-[12px] text-[#5f6c78]">
                              <div className="rounded-[14px] bg-white px-3 py-2">Revenue {formatCurrency(componentRevenue, currencyCode)}</div>
                              <div className="rounded-[14px] bg-white px-3 py-2">Cost {formatCurrency(componentCost, currencyCode)}</div>
                              <div className="rounded-[14px] bg-white px-3 py-2">GP {formatCurrency(componentGrossProfit, currencyCode)}</div>
                              <div className="rounded-[14px] bg-white px-3 py-2">Margin {formatPercent(componentMargin)}</div>
                            </div>
                          </div>
                        );})}
                      </div>
                    </MajorProjectStepCard>

                    <MajorProjectStepCard
                      step="2"
                      title="Bundles"
                      count={activeMajorOptionBundles.length}
                      status={bundlesStepStatus}
                      summary="Optional: group related components into priced packages you want to carry forward."
                      detail={majorProjectCanSkipPackagingSteps ? "Optional. Skip this step when direct component output is enough." : "Use bundles when you want a curated packaging layer before proposal output."}
                      optional
                      onOpen={() => setMajorProjectEditorTab("bundles")}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                          <div><strong className="text-[#16202b]">Bundles organize how the solution is packaged.</strong><div className="mt-1">Use them only when multiple components should price and appear together downstream.</div></div>
                          <button type="button" className="pill-button pill-button-active" onClick={addMajorProjectBundle}>Add bundle</button>
                        </div>
                        <div className="major-project-toolbar">
                          <label className="builder-field compact major-project-toolbar-search"><span>Find bundle</span><input value={majorProjectBundleSearch} onChange={(e) => setMajorProjectBundleSearch(e.target.value)} placeholder="Search bundle name, label, category" /></label>
                          <div className="major-project-toolbar-stat"><strong>{filteredMajorProjectBundles.length}</strong><span>showing</span></div>
                          <div className="major-project-toolbar-stat"><strong>{activeMajorOptionBundles.length}</strong><span>total</span></div>
                        </div>

                        {activeMajorOptionBundles.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No bundles yet. Add one so related components can move forward as a packaged solution.</div> : filteredMajorProjectBundles.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No bundles match that search right now.</div> : filteredMajorProjectBundles.map((bundle) => {
                          const index = activeMajorOptionBundles.findIndex((entry) => entry.id === bundle.id);
                          const bundleMetrics = majorProjectMetrics.bundles.find((entry) => entry.id === bundle.id);
                          const selectedIds = new Set(bundle.componentIds ?? []);
                          return (
                            <div key={bundle.id} className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div><div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Bundle {index + 1}</div><div className="mt-1 text-[18px] font-semibold text-[#16202b]">{bundle.internalName}</div><div className="major-project-chip-row mt-2"><span className="major-project-chip">{bundle.schedule ?? "mixed"}</span><span className="major-project-chip">{bundle.customerFacingLabel || "No customer label"}</span><span className="major-project-chip">{bundleMetrics?.resolvedComponentIds.length ?? 0} mapped</span></div>{bundle.description ? <div className="mt-2 text-[13px] leading-[1.5] text-[#5d6772]">{bundle.description}</div> : null}</div>
                                <div className="flex max-w-full flex-col items-stretch gap-2">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <button type="button" className="pill-button" onClick={() => addMajorProjectComponent(bundle.id)}>Add component into bundle</button>
                                  </div>
                                  <RowActions
                                    rowNumber={index + 1}
                                    totalRows={activeMajorOptionBundles.length}
                                    onMoveUp={() => moveMajorProjectBundle(bundle.id, -1)}
                                    onMoveDown={() => moveMajorProjectBundle(bundle.id, 1)}
                                    onMoveTo={(targetPosition) => moveMajorProjectBundleToPosition(bundle.id, targetPosition)}
                                    onDuplicate={() => duplicateMajorProjectBundle(bundle.id)}
                                    onRemove={() => removeMajorProjectBundle(bundle.id)}
                                  />
                                </div>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                <label className="builder-field compact lg:col-span-2 xl:col-span-2"><span>Bundle name</span><input value={bundle.internalName} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, internalName: e.target.value }))} /></label>
                                <label className="builder-field compact lg:col-span-2 xl:col-span-2"><span>Customer-facing label</span><input value={bundle.customerFacingLabel} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, customerFacingLabel: e.target.value }))} /></label>
                                <label className="builder-field compact"><span>Category</span><input value={bundle.category ?? ""} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, category: e.target.value }))} /></label>
                                <label className="builder-field compact"><span>Schedule</span><select value={bundle.schedule ?? "mixed"} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, schedule: e.target.value as MajorProjectBundle["schedule"] }))}><option value="mixed">Mixed</option><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                              </div>
                              <label className="builder-field compact mt-3"><span>Description</span><textarea rows={2} value={bundle.description ?? ""} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, description: e.target.value }))} /></label>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <label className="builder-field compact"><span>Supporting spec label</span><input value={bundle.specSheetLabel ?? ""} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, specSheetLabel: e.target.value }))} placeholder="VSAT outdoor unit spec" /></label>
                                <label className="builder-field compact"><span>Spec file location</span><input value={bundle.specSheetLocation ?? ""} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, specSheetLocation: e.target.value }))} placeholder="SharePoint / vendor folder / PDF name" /></label>
                              </div>
                              <MajorProjectSpecAttachmentField
                                itemId={bundle.id}
                                attachment={bundle.specSheetAttachment}
                                specSheetLabel={bundle.specSheetLabel}
                                onAttachmentChange={(attachment) => {
                                  const previousAttachment = bundle.specSheetAttachment;
                                  updateActiveMajorBundle(bundle.id, (current) => ({ ...current, specSheetAttachment: attachment }));
                                  if (previousAttachment?.storageKey !== attachment?.storageKey) {
                                    releaseMajorProjectSpecAttachmentIfUnused(previousAttachment);
                                  }
                                }}
                                onSpecSheetLabelChange={(value) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, specSheetLabel: value }))}
                              />
                              <div className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                                <div className="flex items-center justify-between gap-3"><div className="text-[14px] font-semibold text-[#16202b]">Included components</div><div className="text-[12px] text-[#7a8793]">{bundleMetrics?.resolvedComponentIds.length ?? 0} mapped</div></div>
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {componentOptions.map((component) => (
                                    <label key={component.id} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={selectedIds.has(component.id)} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, componentIds: e.target.checked ? [...new Set([...(current.componentIds ?? []), component.id])] : (current.componentIds ?? []).filter((id) => id !== component.id), includedCostComponentIds: e.target.checked ? current.includedCostComponentIds : (current.includedCostComponentIds ?? []).filter((id) => id !== component.id), includedRevenueComponentIds: e.target.checked ? current.includedRevenueComponentIds : (current.includedRevenueComponentIds ?? []).filter((id) => id !== component.id) }))} /> {component.label}</label>
                                  ))}
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-4 text-[12px] text-[#5f6c78]">
                                {(() => {
                                  const rollup = buildMajorProjectContractRollup({
                                    oneTimeRevenue: bundleMetrics?.oneTimeRevenue ?? 0,
                                    recurringRevenue: bundleMetrics?.recurringRevenue ?? 0,
                                    oneTimeCost: bundleMetrics?.oneTimeCost ?? 0,
                                    recurringCost: bundleMetrics?.recurringCost ?? 0,
                                    termMonths: majorProjectTermMonths,
                                  });
                                  return (
                                    <>
                                      <div className="rounded-[14px] bg-white px-3 py-2">Recurring MRR {formatCurrency(bundleMetrics?.recurringRevenue ?? 0, currencyCode)}</div>
                                      <div className="rounded-[14px] bg-white px-3 py-2">One-time revenue {formatCurrency(bundleMetrics?.oneTimeRevenue ?? 0, currencyCode)}</div>
                                      <div className="rounded-[14px] bg-white px-3 py-2">Contract value ({majorProjectTermMonths} mo) {formatCurrency(rollup.totalContractRevenue, currencyCode)}</div>
                                      <div className="rounded-[14px] bg-white px-3 py-2">Contract cost ({majorProjectTermMonths} mo) {formatCurrency(rollup.totalContractCost, currencyCode)}</div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </MajorProjectStepCard>

                    <MajorProjectStepCard
                      step="3"
                      title="Customer quote lines"
                      count={activeMajorOptionQuoteLines.length}
                      status={quoteLinesStepStatus}
                      summary="Optional: choose which bundles appear in the proposal and where they land."
                      detail={majorProjectCanSkipPackagingSteps ? "Optional. Skip this step when components should flow straight to proposal output." : "Use quote lines when you want a separate presentation layer for Sections A, B, and C."}
                      optional
                      onOpen={() => setMajorProjectEditorTab("quote_lines")}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                          <div><strong className="text-[#16202b]">Customer quote lines are the optional presentation layer.</strong><div className="mt-1">Pick which bundles and any explicit component overrides should feed Section A, B, or C when you need a curated downstream structure.</div></div>
                          <button type="button" className="pill-button pill-button-active" onClick={addMajorProjectQuoteLine}>Add quote line</button>
                        </div>
                        <div className="major-project-toolbar">
                          <label className="builder-field compact major-project-toolbar-search"><span>Find quote line</span><input value={majorProjectQuoteLineSearch} onChange={(e) => setMajorProjectQuoteLineSearch(e.target.value)} placeholder="Search customer-facing labels and notes" /></label>
                          <div className="major-project-toolbar-stat"><strong>{filteredMajorProjectQuoteLines.length}</strong><span>showing</span></div>
                          <div className="major-project-toolbar-stat"><strong>{activeMajorOptionQuoteLines.length}</strong><span>total</span></div>
                        </div>
                        <div className="major-project-preview-handoff">
                          <div className="major-project-preview-handoff-card"><span>Section A / MRR</span><strong>{formatCurrency(majorProjectPreviewCategorySummary.recurring, currencyCode)}</strong></div>
                          <div className="major-project-preview-handoff-card"><span>Section B / hardware</span><strong>{formatCurrency(majorProjectPreviewCategorySummary.hardware, currencyCode)}</strong></div>
                          <div className="major-project-preview-handoff-card"><span>Section C / services</span><strong>{formatCurrency(majorProjectPreviewCategorySummary.services, currencyCode)}</strong></div>
                        </div>

                        {activeMajorOptionQuoteLines.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No customer quote lines yet. That is fine if this option should flow directly from components; add quote lines when you want a curated presentation layer.</div> : filteredMajorProjectQuoteLines.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No customer quote lines match that search right now.</div> : filteredMajorProjectQuoteLines.map((line) => {
                          const index = activeMajorOptionQuoteLines.findIndex((entry) => entry.id === line.id);
                          const metrics = majorProjectMetrics.customerQuoteLines.find((entry) => entry.id === line.id);
                          const selectedBundles = new Set(line.bundleIds ?? []);
                          const explicitRevenueIds = new Set(line.includedRevenueComponentIds ?? []);
                          const explicitCostIds = new Set(line.includedCostComponentIds ?? []);
                          return (
                            <div key={line.id} className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div><div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Customer quote line {index + 1}</div><div className="mt-1 text-[18px] font-semibold text-[#16202b]">{line.label}</div><div className="major-project-chip-row mt-2"><span className="major-project-chip">{line.presentationCategory ?? "other"}</span><span className="major-project-chip">{line.schedule ?? "mixed"}</span><span className="major-project-chip">{metrics?.resolvedBundleIds.length ?? 0} bundle feeds</span></div>{line.description ? <div className="mt-2 text-[13px] leading-[1.5] text-[#5d6772]">{line.description}</div> : null}</div>
                                <RowActions
                                  rowNumber={index + 1}
                                  totalRows={activeMajorOptionQuoteLines.length}
                                  onMoveUp={() => moveMajorProjectQuoteLine(line.id, -1)}
                                  onMoveDown={() => moveMajorProjectQuoteLine(line.id, 1)}
                                  onMoveTo={(targetPosition) => moveMajorProjectQuoteLineToPosition(line.id, targetPosition)}
                                  onDuplicate={() => duplicateMajorProjectQuoteLine(line.id)}
                                  onRemove={() => removeMajorProjectQuoteLine(line.id)}
                                />
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                <label className="builder-field compact lg:col-span-2 xl:col-span-2"><span>Quote line label</span><input value={line.label} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, label: e.target.value }))} /></label>
                                <label className="builder-field compact"><span>Presentation category</span><select value={line.presentationCategory ?? "other"} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, presentationCategory: e.target.value as MajorProjectCustomerQuoteLine["presentationCategory"] }))}><option value="recurring">Section A / recurring</option><option value="hardware">Section B / hardware</option><option value="services">Section C / services</option><option value="other">Section C / other</option></select></label>
                                <label className="builder-field compact"><span>Schedule</span><select value={line.schedule ?? "mixed"} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, schedule: e.target.value as MajorProjectCustomerQuoteLine["schedule"] }))}><option value="mixed">Mixed</option><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                                <div className="rounded-[16px] border border-[#e2e7ec] bg-white px-4 py-3 text-[13px] text-[#5e6975]"><div className="font-semibold text-[#16202b]">{line.presentationCategory === "recurring" ? "Downstream MRR" : "Downstream total"}</div><div className="mt-1">{formatCurrency((metrics?.oneTimeRevenue ?? 0) + (metrics?.recurringRevenue ?? 0), currencyCode)}</div></div>
                              </div>
                              <label className="builder-field compact mt-3"><span>Description / proposal note</span><textarea rows={2} value={line.description ?? ""} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, description: e.target.value }))} /></label>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <label className="builder-field compact"><span>Supporting spec label</span><input value={line.specSheetLabel ?? ""} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, specSheetLabel: e.target.value }))} placeholder="Optional customer-facing spec label" /></label>
                                <label className="builder-field compact"><span>Internal spec location</span><input value={line.specSheetLocation ?? ""} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, specSheetLocation: e.target.value }))} placeholder="SharePoint / vendor folder / PDF name" /></label>
                              </div>
                              <MajorProjectSpecAttachmentField
                                itemId={line.id}
                                attachment={line.specSheetAttachment}
                                specSheetLabel={line.specSheetLabel}
                                onAttachmentChange={(attachment) => {
                                  const previousAttachment = line.specSheetAttachment;
                                  updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, specSheetAttachment: attachment }));
                                  if (previousAttachment?.storageKey !== attachment?.storageKey) {
                                    releaseMajorProjectSpecAttachmentIfUnused(previousAttachment);
                                  }
                                }}
                                onSpecSheetLabelChange={(value) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, specSheetLabel: value }))}
                              />
                              <div className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                                <div className="text-[14px] font-semibold text-[#16202b]">Bundles shown on this quote line</div>
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {bundleOptions.map((bundle) => (
                                    <label key={bundle.id} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={selectedBundles.has(bundle.id)} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, bundleIds: e.target.checked ? [...new Set([...(current.bundleIds ?? []), bundle.id])] : (current.bundleIds ?? []).filter((id) => id !== bundle.id) }))} /> {bundle.label}</label>
                                  ))}
                                </div>
                              </div>
                              <details className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                                <summary className="cursor-pointer list-none text-[14px] font-semibold text-[#16202b]">
                                  Advanced overrides
                                  <span className="ml-2 text-[12px] font-normal text-[#6a7682]">Use only when the normal bundle rollup needs a manual exception.</span>
                                </summary>
                                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                  <div>
                                    <div className="text-[13px] font-semibold text-[#16202b]">Revenue overrides</div>
                                    <div className="mt-3 grid gap-2">
                                      {componentOptions.map((component) => (
                                        <label key={`${line.id}-rev-${component.id}`} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={explicitRevenueIds.has(component.id)} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, includedRevenueComponentIds: e.target.checked ? [...new Set([...(current.includedRevenueComponentIds ?? []), component.id])] : (current.includedRevenueComponentIds ?? []).filter((id) => id !== component.id) }))} /> {component.label}</label>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[13px] font-semibold text-[#16202b]">Cost overrides</div>
                                    <div className="mt-3 grid gap-2">
                                      {componentOptions.map((component) => (
                                        <label key={`${line.id}-cost-${component.id}`} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={explicitCostIds.has(component.id)} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, includedCostComponentIds: e.target.checked ? [...new Set([...(current.includedCostComponentIds ?? []), component.id])] : (current.includedCostComponentIds ?? []).filter((id) => id !== component.id) }))} /> {component.label}</label>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </details>
                              <div className="mt-3 grid gap-3 md:grid-cols-4 text-[12px] text-[#5f6c78]">
                                {(() => {
                                  const rollup = buildMajorProjectContractRollup({
                                    oneTimeRevenue: metrics?.oneTimeRevenue ?? 0,
                                    recurringRevenue: metrics?.recurringRevenue ?? 0,
                                    oneTimeCost: metrics?.oneTimeCost ?? 0,
                                    recurringCost: metrics?.recurringCost ?? 0,
                                    termMonths: majorProjectTermMonths,
                                  });
                                  return (
                                    <>
                                      <div className="rounded-[14px] bg-white px-3 py-2">Recurring MRR {formatCurrency(metrics?.recurringRevenue ?? 0, currencyCode)}</div>
                                      <div className="rounded-[14px] bg-white px-3 py-2">One-time revenue {formatCurrency(metrics?.oneTimeRevenue ?? 0, currencyCode)}</div>
                                      <div className="rounded-[14px] bg-white px-3 py-2">Contract value ({majorProjectTermMonths} mo) {formatCurrency(rollup.totalContractRevenue, currencyCode)}</div>
                                      <div className="rounded-[14px] bg-white px-3 py-2">Contract cost ({majorProjectTermMonths} mo) {formatCurrency(rollup.totalContractCost, currencyCode)}</div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </MajorProjectStepCard>
                    </>
                    )}
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[#dbe3ea] bg-[#f8fafc] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Project rollup</div>
                        <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Live totals</div>
                      </div>
                      <div className="text-[12px] text-[#5d6976]">Visible recurring output stays MRR-only; internal totals below use the active month driver for contract-value math.</div>
                    </div>
                    <div className="mt-4 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Major Project rollup</div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3"><span>Sites in active option</span><strong>{majorProjectMetrics.siteCount}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>Recurring month driver</span><strong>{majorProjectTermMonths} months</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>Recurring MRR</span><strong>{formatCurrency(majorProjectMetrics.recurringRevenue, currencyCode)}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>One-time revenue</span><strong>{formatCurrency(majorProjectMetrics.oneTimeRevenue, currencyCode)}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>Recurring contract value</span><strong>{formatCurrency(majorProjectMetrics.recurringContractRevenue, currencyCode)}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>Total contract value</span><strong>{formatCurrency(majorProjectMetrics.totalContractRevenue, currencyCode)}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>Total contract cost</span><strong>{formatCurrency(majorProjectMetrics.totalContractCost, currencyCode)}</strong></div>
                        <div className="flex items-center justify-between gap-3 text-[#b00000]"><span>Contract gross margin</span><strong>{formatPercent(majorProjectMetrics.totalContractGrossMarginPercent)}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </section>

            <section className="builder-panel">
              <div className="builder-panel-header">
                <div><div className="builder-eyebrow">Section controls</div><h2 className="builder-title">Turn proposal sections on only when they are needed</h2></div>
                <div className="flex flex-wrap gap-2">
                  <SectionToggle label="Executive Summary" enabled={quote.executiveSummary.enabled} onChange={(next) => updateQuote((draft) => { draft.executiveSummary.enabled = next; return draft; })} />
                  <SectionToggle label="Connectivity service" enabled={quote.sections.sectionA.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionA.enabled = next; return draft; })} />
                  <SectionToggle label="Hardware" enabled={quote.sections.sectionB.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionB.enabled = next; return draft; })} />
                  <SectionToggle label="Install / site services" enabled={quote.sections.sectionC.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionC.enabled = next; return draft; })} />
                </div>
              </div>
              <details className="mt-4 rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                <summary className="cursor-pointer list-none text-[14px] font-semibold text-[#16202b]">Advanced section labels and extra fields</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="builder-field"><span>Section A label</span><input value={quote.sections.sectionA.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.builderLabel = e.target.value; return draft; })} /></label>
                  <label className="builder-field"><span>Section B label</span><input value={quote.sections.sectionB.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionB.builderLabel = e.target.value; return draft; })} /></label>
                  <label className="builder-field"><span>Section C label</span><input value={quote.sections.sectionC.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.builderLabel = e.target.value; return draft; })} /></label>
                </div>
                <div className="mt-4 space-y-3">
                {customSectionFields.map((field, index) => (
                  <div key={field.id} className="rounded-[18px] border border-[#dde3e8] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[13px] font-semibold text-[#16202b]">
                        {field.visibility === "customer" ? `Customer detail ${index + 1}` : `Internal note ${index + 1}`}
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[12px] font-semibold ${field.visibility === "customer" ? "bg-[#ecf7ee] text-[#25643b]" : "bg-[#eef2f7] text-[#51606f]"}`}>
                        {field.visibility === "customer" ? "Appears in proposal" : "Builder only"}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_.8fr_auto]">
                      <label className="builder-field compact"><span>{field.visibility === "customer" ? "Customer-facing label" : "Internal label"}</span><input value={field.label} onChange={(e) => {
                        const nextValue = e.target.value;
                        setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, label: nextValue } : item));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).map((item) => item.id === field.id ? { ...item, label: nextValue } : item);
                          return draft;
                        });
                      }} /></label>
                      <label className="builder-field compact"><span>{field.visibility === "customer" ? "Customer-facing value" : "Internal note"}</span><input value={field.value} onChange={(e) => {
                        const nextValue = e.target.value;
                        setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, value: nextValue } : item));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).map((item) => item.id === field.id ? { ...item, value: nextValue } : item);
                          return draft;
                        });
                      }} /></label>
                      <label className="builder-field compact"><span>Visibility</span><select value={field.visibility} onChange={(e) => {
                        const nextVisibility = e.target.value as QuoteCustomField["visibility"];
                        setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, visibility: nextVisibility } : item));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).map((item) => item.id === field.id ? { ...item, visibility: nextVisibility } : item);
                          return draft;
                        });
                      }}><option value="customer">Customer detail</option><option value="internal">Internal note</option></select></label>
                      <button type="button" className="danger-button self-end" onClick={() => {
                        setCustomSectionFields((current) => current.filter((item) => item.id !== field.id));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).filter((item) => item.id !== field.id);
                          return draft;
                        });
                      }}>Remove</button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="pill-button pill-button-active" onClick={() => addCustomSectionField("customer")}>Add customer detail</button>
                  <button type="button" className="pill-button" onClick={() => addCustomSectionField("internal")}>Add internal note</button>
                </div>
                </div>
              </details>
            </section>

            <section className="builder-panel">
              <div className="builder-panel-header">
                <div><div className="builder-eyebrow">Executive Summary</div><h2 className="builder-title">Summary for the proposal intro page</h2></div>
                <div className="flex flex-wrap gap-2">
                  <SectionToggle label="Include in proposal" enabled={quote.executiveSummary.enabled} onChange={(next) => updateQuote((draft) => { draft.executiveSummary.enabled = next; return draft; })} />
                  <button type="button" className="pill-button pill-button-active" onClick={generateExecutiveSummary}>Generate draft summary</button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="builder-field"><span>Summary heading</span><input value={quote.executiveSummary.heading ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.heading = e.target.value; return draft; })} /></label>
              </div>
              <div className="mt-4 grid gap-4">
                <label className="builder-field"><span>Customer context</span><textarea rows={3} value={quote.executiveSummary.customerContext ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.customerContext = e.target.value; syncExecutiveSummaryStructure(draft); return draft; })} /></label>
                <div className="builder-field">
                  <span>Structured summary blocks</span>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button type="button" className="pill-button pill-button-active" onClick={() => addExecutiveSummaryBlock("paragraph")}>Add paragraph</button>
                    <button type="button" className="pill-button" onClick={() => addExecutiveSummaryBlock("heading")}>Add heading</button>
                    <button type="button" className="pill-button" onClick={() => addExecutiveSummaryBlock("bullet_list")}>Add bullets</button>
                    <button type="button" className="pill-button" onClick={() => addExecutiveSummaryBlock("numbered_list")}>Add numbered list</button>
                  </div>
                  <div className="space-y-3">
                    {executiveSummaryEditorBlocks.length ? executiveSummaryEditorBlocks.map((block, index) => (
                      <div key={block.id} className="rounded-[18px] border border-[#dde3e8] bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-[13px] font-semibold text-[#16202b]">{EXECUTIVE_SUMMARY_BLOCK_LABELS[block.type]}</div>
                            <div className="text-[12px] text-[#6b7683]">Block {index + 1} of {executiveSummaryEditorBlocks.length}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="pill-button" onClick={() => moveExecutiveSummaryBlock(block.id, -1)} disabled={index === 0}>Move up</button>
                            <button type="button" className="pill-button" onClick={() => moveExecutiveSummaryBlock(block.id, 1)} disabled={index === executiveSummaryEditorBlocks.length - 1}>Move down</button>
                            <button type="button" className="danger-button" onClick={() => removeExecutiveSummaryBlock(block.id)}>Remove</button>
                          </div>
                        </div>
                        <div className="grid gap-3">
                          <label className="builder-field compact">
                            <span>Block type</span>
                            <select value={block.type} onChange={(e) => changeExecutiveSummaryBlockType(block.id, e.target.value as QuoteStructuredTextBlock["type"])}>
                              <option value="paragraph">Paragraph</option>
                              <option value="heading">Heading</option>
                              <option value="bullet_list">Bullets</option>
                              <option value="numbered_list">Numbered list</option>
                            </select>
                          </label>
                          {block.type === "heading" || block.type === "paragraph" ? (
                            <label className="builder-field compact">
                              <span>{block.type === "heading" ? "Heading text" : "Paragraph text"}</span>
                              <textarea
                                rows={block.type === "heading" ? 2 : 5}
                                value={block.text ?? ""}
                                onChange={(e) => updateExecutiveSummaryBlock(block.id, (current) => ({ ...current, text: e.target.value }))}
                              />
                            </label>
                          ) : (
                            <div className="space-y-3">
                              {(block.items ?? []).map((item, itemIndex) => (
                                <div key={`${block.id}-${itemIndex}`} className="rounded-[16px] border border-[#e1e6ec] bg-[#fbfcfe] p-3">
                                  <div className="mb-2 flex items-center justify-between gap-3 text-[12px] font-semibold text-[#56616d]">
                                    <span>{block.type === "numbered_list" ? `Item ${itemIndex + 1}` : `Bullet ${itemIndex + 1}`}</span>
                                    <button type="button" className="text-[#b00000]" onClick={() => removeExecutiveSummaryListItem(block.id, itemIndex)}>Remove item</button>
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={item}
                                    onChange={(e) => updateExecutiveSummaryListItem(block.id, itemIndex, e.target.value)}
                                  />
                                </div>
                              ))}
                              <button type="button" className="pill-button" onClick={() => addExecutiveSummaryListItem(block.id)}>
                                {block.type === "numbered_list" ? "Add numbered item" : "Add bullet item"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[18px] border border-dashed border-[#d5dbe2] bg-[#f8fafc] px-4 py-5 text-[13px] leading-[1.5] text-[#5e6974]">
                        Start with a paragraph or heading, then add bullet or numbered blocks as needed. The same structure will carry into the proposal HTML, PDF, and workbook summary text.
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[12px] text-[#6b7683]">
                    Headings, paragraphs, bullets, and numbered lists now persist as structured content so the proposal intro reads more like a managed document instead of a raw text blob.
                  </div>
                </div>
              </div>
            </section>

            {!isMajorProject && quote.sections.sectionA.enabled && (
              <section className="builder-panel">
                <div className="builder-panel-header">
                  <div><div className="builder-eyebrow">Quick Quote step 1</div><h2 className="builder-title">Connectivity service line items</h2></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`pill-button ${quote.sections.sectionA.mode === "pool" ? "pill-button-active" : ""}`} onClick={() => updateQuote((draft) => { draft.sections.sectionA.mode = "pool"; return draft; })}>Pool pricing</button>
                    <button type="button" className={`pill-button ${quote.sections.sectionA.mode === "per_kit" ? "pill-button-active" : ""}`} onClick={() => updateQuote((draft) => { draft.sections.sectionA.mode = "per_kit"; return draft; })}>Per-kit pricing</button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="builder-field"><span>Section title</span><input value={quote.sections.sectionA.title} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.title = e.target.value; return draft; })} /></label>
                  <label className="builder-field"><span>Term (months)</span><input type="number" value={quote.sections.sectionA.termMonths} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.termMonths = parseNumber(e.target.value); return draft; })} /></label>
                  <label className="builder-field"><span>Quick add service row</span><select defaultValue="" onChange={(e) => { if (e.target.value) { addSectionARowFromCatalog(e.target.value); e.target.value = ""; } }}><option value="">Choose an item…</option>{filteredSectionACatalog.map((item) => <option key={item.id} value={item.id}>{item.label} — {formatCurrency(item.defaultUnitPrice, currencyCode)}</option>)}</select></label>
                </div>

                <div className="mt-4 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                  <div className="builder-eyebrow">Fast data add</div>
                  <h3 className="mt-1 text-[18px] font-semibold text-[#16202b]">Better quick-add options</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-[.9fr_.8fr_auto_auto]">
                    <label className="builder-field compact"><span>Amount</span><input type="number" min="0" step="0.1" value={dataQuickAddValue} onChange={(e) => setDataQuickAddValue(e.target.value)} /></label>
                    <label className="builder-field compact"><span>Unit</span><select value={dataQuickAddUnit} onChange={(e) => setDataQuickAddUnit(e.target.value as DataQuickAddUnit)}><option value="GB">GB</option><option value="TB">TB</option></select></label>
                    <button type="button" className="pill-button" onClick={() => { setDataQuickAddValue("1"); setDataQuickAddUnit("TB"); addCustomDataRow({ value: "1", unit: "TB" }); }}>Quick add 1 TB</button>
                    <button type="button" className="pill-button pill-button-active" onClick={() => addCustomDataRow()}>Add custom data row</button>
                  </div>
                </div>

                <label className="builder-field mt-4"><span>Section intro</span><textarea value={quote.sections.sectionA.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.introText = e.target.value; return draft; })} rows={3} /></label>

                <div className="mt-5 space-y-3">
                  {activeSectionARows.map((row, index) => (
                    <div key={row.id} className="line-editor-card">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Section A row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">{row.rowType === "support" ? "Support and portal access" : "Monthly service line"}</div></div>
                        <RowActions totalRows={activeSectionARows.length} rowNumber={index + 1} onMoveUp={() => moveActiveSectionARow(row.id, -1)} onMoveDown={() => moveActiveSectionARow(row.id, 1)} onMoveTo={(targetPosition) => moveActiveSectionAToPosition(row.id, targetPosition)} onDuplicate={() => duplicateActiveSectionARow(row.id)} onRemove={() => removeActiveSectionARow(row.id)} />
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[2fr_.8fr_.8fr_1fr]">
                        <label className="builder-field compact"><span>Description</span><input value={row.description} onChange={(e) => updateActiveSectionARow(row.id, "description", e.target.value)} /></label>
                        <label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "quantity", e.target.value)} disabled={row.rowType === "support"} /></label>
                        <label className="builder-field compact"><span>Unit label</span><input value={row.unitLabel ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "unitLabel", e.target.value)} disabled={row.rowType === "support"} /></label>
                        <label className="builder-field compact"><span>{row.rowType === "overage" ? "Rate / GB" : "Monthly rate"}</span><input type="number" step="0.01" value={row.monthlyRate ?? row.unitPrice ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "monthlyRate", e.target.value)} disabled={row.rowType === "support"} /></label>
                      </div>
                      {row.rowType === "support" && <label className="builder-field compact mt-3"><span>Support details (one per line)</span><textarea rows={3} value={(row.includedText ?? []).join("\n")} onChange={(e) => updateActiveSectionARow(row.id, "includedText", e.target.value)} /></label>}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.rowType === "support" ? "Included support and portal access" : "Monthly service line"}</span><span>{row.rowType === "support" ? "Included with service" : `Subtotal: ${formatCurrency(row.totalMonthlyRate ?? row.monthlyRate ?? 0, currencyCode)}`}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!isMajorProject && quote.sections.sectionB.enabled && (
              <section className="builder-panel">
                <div className="builder-panel-header">
                  <div><div className="builder-eyebrow">Quick Quote step 2</div><h2 className="builder-title">Hardware</h2></div>
                </div>

                <label className="builder-field"><span>Section note</span><textarea rows={3} value={quote.sections.sectionB.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionB.introText = e.target.value; return draft; })} /></label>

                {suggestedAccessories.length > 0 && (
                  <div className="mt-4 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                    <div className="builder-eyebrow">Smart suggestions</div>
                    <h3 className="mt-1 text-[18px] font-semibold text-[#16202b]">Accessory suggestions based on selected Starlink device</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {suggestedAccessories.map(({ terminalType, item }) => (
                        <div key={item.id} className="rounded-[18px] border border-[#d9e0e7] bg-white p-4">
                          <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">For {terminalType}</div>
                          <div className="mt-1 text-[16px] font-semibold text-[#16202b]">{item.label}</div>
                          <div className="mt-1 text-[13px] text-[#60707f]">{item.description}</div>
                          <button type="button" className="mt-3 pill-button pill-button-active" onClick={() => addEquipmentRow(item.id)}>Add suggested accessory</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr_.9fr]">
                  <div className="rounded-[24px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="builder-eyebrow">Recommended items</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Hardware picker</h3></div><div className="text-[13px] text-[#66717d]">{filteredEquipmentCatalog.length} match(es)</div></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_.8fr]"><label className="builder-field compact"><span>Search Hardware</span><input placeholder="router, mini, mount, cable..." value={equipmentSearch} onChange={(e) => setEquipmentSearch(e.target.value)} /></label><label className="builder-field compact"><span>Category</span><select value={equipmentCategoryFilter} onChange={(e) => setEquipmentCategoryFilter(e.target.value)}>{equipmentCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">{filteredEquipmentCatalog.map((item) => <div key={item.id} className="rounded-[20px] border border-[#d9e0e7] bg-white p-4 shadow-[0_8px_20px_rgba(31,42,52,0.05)]"><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">{item.category}</div><h4 className="mt-1 text-[16px] font-semibold text-[#16202b]">{item.label}</h4></div></div><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">{item.description ?? "Recommended equipment item."}</p><div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#66717d]">{item.terminalType && <span className="rounded-full bg-[#f6f8fb] px-3 py-1">Type: {item.terminalType}</span>}<span className="rounded-full bg-[#f6f8fb] px-3 py-1">Recommended</span></div><button type="button" className="mt-4 pill-button pill-button-active w-full" onClick={() => addEquipmentRow(item.id)}>Add to Hardware Rows</button></div>)}</div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                      <div className="builder-eyebrow">Custom item</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Manual Hardware Row</h3>
                      <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="builder-field compact"><span>Item name</span><input value={customEquipmentDraft.itemName} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, itemName: e.target.value }))} /></label><label className="builder-field compact"><span>Image URL</span><input value={customEquipmentDraft.imageUrl} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, imageUrl: e.target.value }))} placeholder="https://..." /></label><label className="builder-field compact"><span>Category</span><input value={customEquipmentDraft.itemCategory} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, itemCategory: e.target.value }))} /></label><label className="builder-field compact"><span>Terminal type</span><input value={customEquipmentDraft.terminalType} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, terminalType: e.target.value }))} /></label><label className="builder-field compact"><span>Part #</span><input value={customEquipmentDraft.partNumber} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, partNumber: e.target.value }))} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={customEquipmentDraft.quantity} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, quantity: e.target.value }))} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={customEquipmentDraft.unitPrice} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, unitPrice: e.target.value }))} /></label></div>
                      <label className="builder-field compact mt-3"><span>Description / notes</span><textarea rows={3} value={customEquipmentDraft.description} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, description: e.target.value }))} /></label>
                      <button type="button" className="mt-4 pill-button pill-button-active w-full" onClick={addCustomEquipmentRow}>Add Custom Hardware Row</button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">{quote.sections.sectionB.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Hardware row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">{row.sourceType === "standard" ? "Recommended line" : "Custom line"}</div></div><RowActions totalRows={quote.sections.sectionB.lineItems.length} rowNumber={index + 1} onMoveUp={() => moveEquipmentRow(row.id, -1)} onMoveDown={() => moveEquipmentRow(row.id, 1)} onMoveTo={(targetPosition) => moveEquipmentRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateEquipmentRow(row.id)} onRemove={() => removeEquipmentRow(row.id)} /></div><div className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]"><div className="rounded-[18px] border border-[#dce3ea] bg-[#f8fbfd] p-3">{row.imageUrl ? <img src={row.imageUrl} alt={row.itemName} className="h-[132px] w-full rounded-[12px] bg-white object-contain" /> : <div className="flex h-[132px] items-center justify-center rounded-[12px] border border-dashed border-[#d8e1e8] bg-white px-3 text-center text-[12px] text-[#7a8794]">Add an image URL to show a normalized hardware preview.</div>}</div><div><div className="grid gap-3 lg:grid-cols-[1.7fr_1fr_.7fr_.8fr]"><label className="builder-field compact"><span>Item</span><input value={row.itemName} onChange={(e) => updateEquipmentRow(row.id, "itemName", e.target.value)} /></label><label className="builder-field compact"><span>Category</span><input value={row.itemCategory ?? ""} onChange={(e) => updateEquipmentRow(row.id, "itemCategory", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateEquipmentRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit Price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateEquipmentRow(row.id, "unitPrice", e.target.value)} /></label></div><div className="mt-3 grid gap-3 lg:grid-cols-3"><label className="builder-field compact"><span>Image URL</span><input value={row.imageUrl ?? ""} onChange={(e) => updateEquipmentRow(row.id, "imageUrl", e.target.value)} placeholder="https://..." /></label><label className="builder-field compact"><span>Terminal Type</span><input value={row.terminalType ?? ""} onChange={(e) => updateEquipmentRow(row.id, "terminalType", e.target.value)} /></label><label className="builder-field compact"><span>Part #</span><input value={row.partNumber ?? ""} onChange={(e) => updateEquipmentRow(row.id, "partNumber", e.target.value)} /></label></div><div className="mt-3 grid gap-3 lg:grid-cols-2"><label className="builder-field compact"><span>Reference</span><input value={row.sourceLabel ?? ""} onChange={(e) => updateEquipmentRow(row.id, "sourceLabel", e.target.value)} /></label><label className="builder-field compact"><span>Description / Notes</span><input value={row.description ?? ""} onChange={(e) => updateEquipmentRow(row.id, "description", e.target.value)} /></label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.sourceType === "custom" ? "Custom hardware line" : "Recommended hardware line"}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div></div></div>)}</div>
              </section>
            )}

            {!isMajorProject && quote.sections.sectionC.enabled && (
              <section className="builder-panel">
                <div className="builder-panel-header"><div><div className="builder-eyebrow">Quick Quote step 3</div><h2 className="builder-title">Install and site service line items</h2></div><button type="button" className="pill-button pill-button-active" onClick={addServiceRow}>Add service row</button></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="builder-field"><span>Section title</span><input value={quote.sections.sectionC.title} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.title = e.target.value; draft.sections.sectionC.builderLabel = e.target.value; return draft; })} /></label>
                  <label className="builder-field"><span>Section intro / note</span><textarea rows={3} value={quote.sections.sectionC.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.introText = e.target.value; return draft; })} /></label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{servicePresetTemplates.map((preset) => <button key={preset.key} type="button" className="pill-button" onClick={() => addPresetServiceRow(preset.key)}>{preset.label}</button>)}</div>

                <div className="mt-5 rounded-[20px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="builder-eyebrow">Service agreement defaults</div>
                      <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">
                        {quoteServiceAgreementProfile.agreementLabel || "Customer SLA pricing profile"}
                      </h3>
                      <p className="mt-2 text-[13px] leading-[1.55] text-[#60707f]">
                        Keep SLA pricing defaults with the install and site service workflow, then add the categories you need into Section C.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="pill-button" onClick={() => void handleExportServiceAgreement()}>
                        Export SLA Document
                      </button>
                      {selectedCustomerProfile && hasSelectedCustomerServiceAgreement ? (
                        <button type="button" className="pill-button" onClick={applyCustomerServiceAgreementDefaults}>
                          Refresh from customer defaults
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Agreement</strong>{quoteServiceAgreementProfile.agreementLabel || "No SLA name set"}<br />{quote.serviceAgreement.sourceCustomerProfileName || quote.customer.name || "Not linked to a saved customer"}</div>
                    <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Attachment</strong>{quoteServiceAgreementProfile.sourceDocument?.fileName || "No source document reference"}<br />{quoteServiceAgreementProfile.sourceDocument?.note || quoteServiceAgreementProfile.sourceDocument?.fileUrl || "Signed/source PDF can be referenced here"}</div>
                    <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Accepted dates</strong>{quoteServiceAgreementProfile.signedDate || "No signed date"}<br />{quoteServiceAgreementProfile.acceptedDate || "No accepted date"}</div>
                    <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Ready categories</strong>{activeServiceAgreementCategories.length} pricing default{activeServiceAgreementCategories.length === 1 ? "" : "s"}<br />{quote.serviceAgreement.lastAppliedAt ? "Applied to this quote" : "Quote-level profile ready to use"}</div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="builder-field compact xl:col-span-2"><span>Agreement name</span><input value={quoteServiceAgreementProfile.agreementLabel} onChange={(e) => updateAgreementProfileField("agreementLabel", e.target.value)} placeholder="Customer service pricing agreement" /></label>
                    <label className="builder-field compact"><span>Signed date</span><input type="date" value={quoteServiceAgreementProfile.signedDate ?? ""} onChange={(e) => updateAgreementProfileField("signedDate", e.target.value)} /></label>
                    <label className="builder-field compact"><span>Accepted date</span><input type="date" value={quoteServiceAgreementProfile.acceptedDate ?? ""} onChange={(e) => updateAgreementProfileField("acceptedDate", e.target.value)} /></label>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="builder-field compact"><span>SLA PDF / file name</span><input value={quoteServiceAgreementProfile.sourceDocument?.fileName ?? ""} onChange={(e) => updateAgreementAttachmentField("fileName", e.target.value)} placeholder="signed-service-agreement.pdf" /></label>
                    <label className="builder-field compact"><span>Document reference / URL</span><input value={quoteServiceAgreementProfile.sourceDocument?.fileUrl ?? ""} onChange={(e) => updateAgreementAttachmentField("fileUrl", e.target.value)} placeholder="Internal link or storage reference" /></label>
                    <label className="builder-field compact"><span>Attachment note</span><input value={quoteServiceAgreementProfile.sourceDocument?.note ?? ""} onChange={(e) => updateAgreementAttachmentField("note", e.target.value)} placeholder="Where the signed PDF lives" /></label>
                  </div>

                  <label className="builder-field compact mt-4"><span>Agreement notes</span><textarea rows={3} value={quoteServiceAgreementProfile.notes ?? ""} onChange={(e) => updateAgreementProfileField("notes", e.target.value)} placeholder="Internal guidance or exceptions for using this customer's service pricing defaults" /></label>

                  <div className="mt-4 space-y-3">
                    {quoteServiceAgreementProfile.categories.map((category) => (
                      <div key={category.key} className={`rounded-[18px] border p-4 ${serviceAgreementCategoryTone(category.rateBasis)}`}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-[16px] font-semibold text-[#16202b]">{category.label}</div>
                            <div className="mt-1 text-[12px] font-medium uppercase tracking-[0.14em] text-[#7a8793]">{serviceAgreementRateBasisLabel(category.rateBasis)}</div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3 lg:min-w-[620px]">
                            <label className="builder-field compact"><span>Rate basis</span><select value={category.rateBasis} onChange={(e) => updateAgreementCategoryField(category.key, "rateBasis", e.target.value)}><option value="na">N/A</option><option value="standard">Standard</option><option value="non_standard">Non-standard</option></select></label>
                            <label className="builder-field compact"><span>Labor rate</span><input type="number" step="0.01" value={category.laborRate ?? ""} onChange={(e) => updateAgreementCategoryField(category.key, "laborRate", e.target.value)} placeholder="0.00" /></label>
                            <label className="builder-field compact"><span>Mileage rate</span><input type="number" step="0.01" value={category.mileageRate ?? ""} onChange={(e) => updateAgreementCategoryField(category.key, "mileageRate", e.target.value)} placeholder="0.00" /></label>
                          </div>
                        </div>
                        <label className="builder-field compact mt-3"><span>Notes</span><input value={category.notes ?? ""} onChange={(e) => updateAgreementCategoryField(category.key, "notes", e.target.value)} placeholder="Scope note, exception, or dispatch guidance" /></label>
                        {category.rateBasis !== "na" ? (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#51606d]">
                            <div>
                              Labor {category.laborRate !== null ? formatCurrency(category.laborRate, currencyCode) : "Not set"} • Mileage {category.mileageRate !== null ? formatCurrency(category.mileageRate, currencyCode) : "Not set"}
                            </div>
                            <button type="button" className="pill-button pill-button-active" onClick={() => addAgreementCategoryToSectionC(category)}>
                              Add to Section C
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {!activeServiceAgreementCategories.length ? (
                    <div className="mt-4 rounded-[18px] border border-dashed border-[#d9e0e7] bg-white p-4 text-[13px] leading-[1.55] text-[#5d6772]">
                      No active SLA pricing defaults are loaded on this quote yet. Turn on the categories you need here, or keep using manual service rows.
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 space-y-3">{quote.sections.sectionC.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Service row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">Optional field service</div></div><RowActions totalRows={quote.sections.sectionC.lineItems.length} rowNumber={index + 1} onMoveUp={() => moveServiceRow(row.id, -1)} onMoveDown={() => moveServiceRow(row.id, 1)} onMoveTo={(targetPosition) => moveServiceRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateServiceRow(row.id)} onRemove={() => removeServiceRow(row.id)} /></div><div className="grid gap-3 lg:grid-cols-[2fr_.7fr_.8fr_1fr]"><label className="builder-field compact"><span>Description</span><input value={row.description} onChange={(e) => updateServiceRow(row.id, "description", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateServiceRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateServiceRow(row.id, "unitPrice", e.target.value)} /></label><label className="builder-field compact"><span>Pricing stage</span><select value={row.pricingStage ?? "budgetary"} onChange={(e) => updateServiceRow(row.id, "pricingStage", e.target.value)}><option value="budgetary">Budgetary</option><option value="final">Final</option></select></label></div><label className="builder-field compact mt-3"><span>Notes</span><input value={row.notes ?? ""} onChange={(e) => updateServiceRow(row.id, "notes", e.target.value)} /></label><div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.serviceCategory === "site_inspection" ? "Site inspection" : row.serviceCategory === "installation" ? "Installation" : "Custom service"}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div>)}</div>
              </section>
            )}
            </>
            )}
          </div>

          <aside className="space-y-6">
            {builderLocked ? (
              <section className="builder-panel sticky top-6">
                <div className="builder-panel-header"><div><div className="builder-eyebrow">Customer intake</div><h2 className="builder-title">What’s ready so far</h2></div></div>
                <div className="space-y-4 text-[14px] text-[#32404c]">
                  <div className="summary-block"><div className="summary-label">Customer</div><div className="summary-value">{customerHeadline}</div><div className="summary-subvalue">{customerSubline || "No customer selected yet"}</div></div>
                  <div className="summary-block"><div className="summary-label">Service address</div><div className="summary-value">{customerServiceAddress || "Not set yet"}</div><div className="summary-subvalue">Complete the intake card on the left to continue.</div></div>
                  <div className="rounded-[18px] border border-dashed border-[#d5dbe2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-[1.5] text-[#5e6974]">Once the customer is selected, RapidQuote unlocks quote setup, pricing, preview, and PDF output.</div>
                </div>
              </section>
            ) : (
            <section className="builder-panel sticky top-6 proposal-editor-summary-rail">
              <div className="builder-panel-header proposal-editor-summary-header">
                <div>
                  <div className="builder-eyebrow">Review rail</div>
                  <h2 className="builder-title">Release confidence</h2>
                  <p className="proposal-editor-summary-copy">Keep setup and pricing on the left. Use this rail to understand readiness, revision confidence, and final handoff before you preview or export.</p>
                </div>
                <div className="proposal-editor-summary-status">
                  <span className="proposal-editor-meta-chip proposal-editor-meta-chip-strong">{statusToStageLabel(quote.metadata.status)}</span>
                  <span className="proposal-editor-meta-chip">Revision {governanceState.revisionLabel}</span>
                </div>
              </div>
              <div className="proposal-editor-summary-glance">
                <div className="proposal-editor-summary-glance-card">
                  <span>Needs attention</span>
                  <strong>{editorNeedsAttention.length}</strong>
                  <p>{editorNeedsAttention.length ? "Review items still queued before release." : "No major blockers are queued right now."}</p>
                </div>
                <div className="proposal-editor-summary-glance-card">
                  <span>Preview status</span>
                  <strong>{outputReadiness[0]?.state || "Ready"}</strong>
                  <p>{outputReadiness[0]?.detail || "Customer-facing preview is ready to open."}</p>
                </div>
                <div className="proposal-editor-summary-glance-card">
                  <span>Last saved</span>
                  <strong>{quoteLastTouchedLabel || "Not saved yet"}</strong>
                  <p>{latestProposalActivity?.message || "Save from the builder to keep the draft and activity history in sync."}</p>
                </div>
              </div>
              <div className="space-y-5 text-[14px] text-[#32404c]">
                <div className="summary-block"><div className="summary-label">Customer</div><div className="summary-value">{quote.customer.name}</div><div className="summary-subvalue">{quote.customer.contactName} • {quote.metadata.proposalNumber} • {quote.metadata.proposalDate}</div></div>
                <div className="summary-block"><div className="summary-label">Proposal info</div><div className="summary-value">{quote.metadata.documentTitle}</div><div className="summary-subvalue">Prepared by {quote.inet.contactName} • {quote.inet.contactPhone}</div></div>
                <div className="summary-block"><div className="summary-label">Bill To / Ship To</div><div className="summary-value">{quote.billTo.companyName || quote.customer.name}</div><div className="summary-subvalue">{quote.shippingSameAsBillTo ? "Ship To matches Bill To" : `${quote.shipTo.companyName || "Custom Ship To"} configured separately`}</div></div>
                <div className="summary-block"><div className="summary-label">Executive Summary</div><div className="summary-value">{quote.executiveSummary.enabled && contentPresence.hasExecutiveSummaryContent ? (quote.executiveSummary.heading?.trim() || "Executive Summary") : "Hidden"}</div><div className="summary-subvalue">{quote.executiveSummary.enabled && contentPresence.hasExecutiveSummaryContent ? `${executiveSummaryRenderBlocks.length} structured block(s) ready for output` : "Not included in proposal output"}</div></div>
                <div className="summary-block"><div className="summary-label">Workflow</div><div className="summary-value">{isMajorProject ? "Major Project" : "Quick Quote"}</div><div className="summary-subvalue">{isMajorProject ? "Commercial model is driving downstream proposal sections" : "Builder rows are driving proposal sections directly"}</div></div>
                <div className="summary-block"><div className="summary-label">Quote type</div><div className="summary-value">{quote.metadata.quoteType === "purchase" ? "Purchase" : "Lease"}</div><div className="summary-subvalue">{quote.metadata.quoteType === "purchase" ? "Separate one-time and recurring outputs" : hasActiveDataAgreement ? `Estimated monthly blended total over ${selectedLeaseTerm} months` : "Lease pricing blocked until active data agreement is confirmed"}</div></div>
                <div className="summary-block">
                  <div className="summary-label">Revision confidence</div>
                  <div className="summary-value">Revision {governanceState.revisionLabel}</div>
                  <div className="summary-subvalue">
                    {governanceState.sourceMode === "crm_attached" ? "CRM-attached lineage" : "Standalone-first lineage"}
                    {` • Family ${governanceState.quoteFamilyId}`}
                    {quoteLastTouchedLabel ? ` • Saved ${quoteLastTouchedLabel}` : ""}
                  </div>
                  <div className="mt-2 rounded-[14px] border border-[#e2e7ec] bg-white px-3 py-3 text-[12px] leading-[1.6] text-[#51606d]">
                    <strong className="block text-[#16202b]">Latest recorded change</strong>
                    <span className="mt-1 block">{latestRevisionEntry?.changeDetails || latestProposalActivity?.message || "This draft is using the current saved proposal state."}</span>
                    {governanceState.basedOnRevisionId ? <span className="mt-1 block text-[#6d7782]">Based on {governanceState.basedOnRevisionId}</span> : null}
                  </div>
                </div>
                <div className="summary-block">
                  <div className="summary-label">Current pricing</div>
                  <div className="summary-value">{isMajorProject ? "Imported cost + margin aware" : "Current proposal data"}</div>
                  <div className="summary-subvalue">{isMajorProject ? `Imported BOM and vendor quote defaults seed customer pricing from vendor cost at ${DEFAULT_IMPORTED_MARGIN_PERCENT}% margin unless you override it.` : "Recommended defaults plus any edits you made in this proposal."}</div>
                </div>
                <div className="summary-block"><div className="summary-label">Customer SLA profile</div><div className="summary-value">{quoteServiceAgreementProfile.agreementLabel || "No SLA profile name set"}</div><div className="summary-subvalue">{activeServiceAgreementCategories.length ? `${activeServiceAgreementCategories.length} active pricing categories on this quote` : "No active SLA defaults loaded on this quote"}{quoteServiceAgreementProfile.sourceDocument?.fileName ? ` • ${quoteServiceAgreementProfile.sourceDocument.fileName}` : ""}</div></div>
                <div className="summary-block"><div className="summary-label">Enabled sections</div><ul className="list-disc pl-5 text-[#56616d]">{quote.executiveSummary.enabled && contentPresence.hasExecutiveSummaryContent && <li>Executive Summary</li>}{quote.sections.sectionA.enabled && contentPresence.hasSectionAContent && <li>{isMajorProject ? "MRR" : "Monthly Service"}</li>}{quote.sections.sectionB.enabled && contentPresence.hasSectionBContent && <li>Hardware</li>}{quote.sections.sectionC.enabled && contentPresence.hasSectionCContent && <li>Field Services</li>}</ul></div>
                {customSectionFields.length > 0 && <div className="summary-block"><div className="summary-label">Extra section fields</div><div className="space-y-1 text-[#56616d]">{customSectionFields.map((field) => <div key={field.id}><strong>{field.label}:</strong> {field.value || "—"} <span className="text-[#8b96a3]">({field.visibility === "customer" ? "proposal" : "internal"})</span></div>)}</div></div>}
                <div className="summary-block">
                  <div className="summary-label">Needs attention</div>
                  <div className="summary-value">{editorNeedsAttention.length ? `${editorNeedsAttention.length} review item${editorNeedsAttention.length === 1 ? "" : "s"}` : "No major blockers queued"}</div>
                  <div className="summary-subvalue">{editorNeedsAttention.length ? "These are the remaining items most likely to slow preview, export, or release confidence." : "This draft is in good shape for preview, export, and approval review."}</div>
                  {editorNeedsAttention.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[#56616d]">
                      {editorNeedsAttention.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : null}
                </div>
                <div className="summary-block">
                  <div className="summary-label">Output readiness</div>
                  <div className="space-y-2">
                    {outputReadiness.map((item) => (
                      <div key={item.label} className="rounded-[14px] border border-[#e2e7ec] bg-white px-3 py-3 text-[12px] text-[#51606d]">
                        <div className="flex items-center justify-between gap-3">
                          <strong className="text-[#16202b]">{item.label}</strong>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            item.state === "Ready"
                              ? "bg-[#ecf7ee] text-[#25643b]"
                              : item.state === "Blocked" || item.state === "Needs fixes"
                                ? "bg-[#fff1f1] text-[#8d1f1f]"
                                : "bg-[#eef2f7] text-[#51606f]"
                          }`}>{item.state}</span>
                        </div>
                        <div className="mt-1">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="summary-block"><div className="summary-label">Section A output</div><div className="summary-value">{isMajorProject ? "MRR schedule" : quote.sections.sectionA.mode === "pool" ? "Pool pricing schedule" : "Per-kit pricing schedule"}</div><div className="summary-subvalue">{isMajorProject ? `Month driver: ${quote.sections.sectionA.termMonths} months • generated from ${activeMajorOption?.label ?? "active major option"}` : `${activeSectionARows.length} row(s) ready for the proposal`}</div></div>
                <div className="summary-block"><div className="summary-label">Section B output</div><div className="summary-value">{contentPresence.hasSectionBContent ? `${quote.sections.sectionB.lineItems.length} hardware row(s)` : "No hardware added yet"}</div><div className="summary-subvalue">{contentPresence.hasSectionBContent ? (suggestedAccessories.length > 0 ? `${suggestedAccessories.length} accessory suggestion(s) available` : "All suggested accessories are already added") : "Add equipment only when this quote actually needs one-time hardware."}</div></div>
                <div className="summary-block"><div className="summary-label">Section C output</div><div className="summary-value">{contentPresence.hasSectionCContent ? quote.sections.sectionC.title : "No field services added yet"}</div><div className="summary-subvalue">{contentPresence.hasSectionCContent ? `${quote.sections.sectionC.lineItems.length} service row(s) • ${quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "budgetary").length} budgetary / ${quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "final").length} final` : "Field services stay out of the proposal until live rows exist."}</div></div>
                <div className="summary-block"><div className="summary-label">Totals</div><div className="space-y-2 text-[#56616d]"><div className="flex justify-between gap-3"><span>{isMajorProject ? "MRR" : "Recurring monthly"}</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>{contentPresence.hasSectionBContent && <div className="flex justify-between gap-3"><span>One-time equipment</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>}{contentPresence.hasSectionCContent && <div className="flex justify-between gap-3"><span>Optional services</span><strong>{formatCurrency(sectionCTotal, currencyCode)}</strong></div>}{quote.metadata.quoteType === "lease" && <div className="flex justify-between gap-3 text-[#b00000]"><span>Blended lease monthly</span><strong>{hasActiveDataAgreement ? formatCurrency(leaseMonthly, currencyCode) : "Data agreement required"}</strong></div>}</div></div>
                <div className="summary-block">
                  <div className="summary-label">Review handoff</div>
                  <div className="summary-value">Save here. Export from Preview.</div>
                  <div className="summary-subvalue">Keep the editor focused on setup and pricing. Use Preview Proposal for the customer-facing document plus Approval Workbook and PDF exports.</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="pill-button" onClick={persistProposalState}>Save Draft</button>
                    <button type="button" className="pill-button pill-button-active" onClick={handlePreviewProposal}>Preview Proposal</button>
                  </div>
                </div>
                <div className="rounded-[18px] border border-dashed border-[#d5dbe2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-[1.5] text-[#5e6974]">Keep it simple: build the quote, review the proposal, and send it with confidence.</div>
              </div>
            </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  ) : <div className="workspace-shell"><div className="workspace-container">Loading proposal builder…</div></div>;
}

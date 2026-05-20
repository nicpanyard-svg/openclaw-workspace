import { createDefaultIntegrationState } from "@/app/lib/crm";
import { createDefaultCommercialState } from "@/app/lib/commercial-model";
import { buildDefaultExpirationDate } from "@/app/lib/quote-branding";
import { COMPANY_BRANDING } from "@/app/lib/company-branding";
import { normalizeQuoteGovernanceState } from "@/app/lib/cpq-governance";
import { normalizeExecutiveSummaryBlocks, serializeExecutiveSummaryBlocks } from "@/app/lib/executive-summary";
import { createDefaultMajorProjectState } from "@/app/lib/major-project";
import { normalizeMajorProjectSpecAttachment } from "@/app/lib/major-project-spec-attachments";
import { createDefaultQuoteServiceAgreementState, normalizeQuoteServiceAgreementState } from "@/app/lib/service-agreement";
import { normalizeQuoteWarrantyDetails } from "@/app/lib/quote-warranty";
import type { QuoteCustomField, QuoteRecord } from "@/app/lib/quote-record";

export const PROPOSAL_STORAGE_KEY = "quote-tool-app:proposal-state";
export const PROPOSAL_STORAGE_FALLBACK_KEY = "quote-tool-app:proposal-state-fallback";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeLines(lines: unknown) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => normalizeText(line));
}

function normalizeCustomFields(fields: QuoteRecord["customFields"] | null | undefined): QuoteCustomField[] {
  if (!Array.isArray(fields)) return [];

  return fields.map((field, index) => ({
    id: normalizeText(field?.id) || `custom-field-${index + 1}`,
    label: normalizeText(field?.label),
    value: normalizeText(field?.value),
    visibility: field?.visibility === "internal" ? "internal" : "customer",
  }));
}

function normalizeMajorProjectBomImportState(
  bomImport: QuoteRecord["majorProject"]["bomImport"] | null | undefined,
): QuoteRecord["majorProject"]["bomImport"] {
  if (!bomImport) {
    return createDefaultMajorProjectState().bomImport;
  }

  const normalizedSheets = Array.isArray(bomImport.sheets)
    ? bomImport.sheets
        .map((sheet) => {
          const name = normalizeText(sheet?.name);
          if (!name) return null;

          const rows = Array.isArray(sheet?.rows)
            ? sheet.rows
                .map((row) => {
                  const rowNumber = typeof row?.rowNumber === "number" && Number.isFinite(row.rowNumber)
                    ? Math.max(1, Math.trunc(row.rowNumber))
                    : 0;
                  const cells = Array.isArray(row?.cells) ? row.cells.map((cell) => normalizeText(cell)) : [];
                  if (!rowNumber && !cells.some((cell) => cell.trim().length > 0)) {
                    return null;
                  }

                  return {
                    rowNumber: rowNumber || 1,
                    cells,
                  };
                })
                .filter((row): row is NonNullable<typeof row> => Boolean(row))
            : [];

          const rowCount = typeof sheet?.rowCount === "number" && Number.isFinite(sheet.rowCount)
            ? Math.max(rows.length, Math.trunc(sheet.rowCount))
            : rows.length;

          return {
            name,
            rowCount,
            rows,
          };
        })
        .filter((sheet): sheet is NonNullable<typeof sheet> => Boolean(sheet))
    : [];

  const normalizedSheetNames = Array.from(
    new Set(
      [
        ...(Array.isArray(bomImport.sheetNames) ? bomImport.sheetNames.map((sheetName) => normalizeText(sheetName)).filter(Boolean) : []),
        ...normalizedSheets.map((sheet) => sheet.name),
      ],
    ),
  );

  const normalizedReviewedColumnMapBySheet: Record<string, Record<string, number | null>> = {};
  for (const [sheetName, columnMap] of Object.entries(bomImport.reviewedColumnMapBySheet ?? {})) {
    const normalizedSheetName = normalizeText(sheetName);
    if (!normalizedSheetName || !columnMap || typeof columnMap !== "object") {
      continue;
    }

    const normalizedColumnMap: Record<string, number | null> = {};
    for (const [columnKey, columnIndex] of Object.entries(columnMap)) {
      if (columnIndex === null) {
        normalizedColumnMap[columnKey] = null;
        continue;
      }

      if (typeof columnIndex === "number" && Number.isFinite(columnIndex) && columnIndex >= 0) {
        normalizedColumnMap[columnKey] = Math.trunc(columnIndex);
      }
    }

    if (Object.keys(normalizedColumnMap).length) {
      normalizedReviewedColumnMapBySheet[normalizedSheetName] = normalizedColumnMap;
    }
  }

  const selectedSheetName = normalizeText(bomImport.selectedSheetName);
  const normalizedStatus = bomImport.status === "captured" || bomImport.status === "reading" || bomImport.status === "loaded" || bomImport.status === "error"
    ? bomImport.status
    : "captured";
  const normalizedReviewState = bomImport.reviewState === "pre_import_review" ? "pre_import_review" : "pending";
  const normalizedSource = bomImport.source === "picker" ? "picker" : "drop";
  const importedComponentCount = typeof bomImport.importedComponentCount === "number" && Number.isFinite(bomImport.importedComponentCount)
    ? Math.max(0, Math.trunc(bomImport.importedComponentCount))
    : undefined;
  const hasStaleSavedWorkbookRows = normalizedSheets.length > 0
    && normalizedSheets.some((sheet) => sheet.rowCount > 0)
    && normalizedSheets.every((sheet) => sheet.rows.length === 0);

  if (hasStaleSavedWorkbookRows) {
    return {
      fileName: normalizeText(bomImport.fileName),
      sizeBytes: typeof bomImport.sizeBytes === "number" && Number.isFinite(bomImport.sizeBytes) ? Math.max(0, Math.trunc(bomImport.sizeBytes)) : 0,
      mimeType: normalizeText(bomImport.mimeType) || undefined,
      capturedAt: normalizeText(bomImport.capturedAt),
      source: normalizedSource,
      status: "error",
      reviewState: "pending",
      sheetNames: normalizedSheetNames,
      sheets: [],
      selectedSheetName: undefined,
      reviewedColumnMapBySheet: undefined,
      readError:
        "This workbook capture was saved by an older RapidQuote build without the extracted row data. Remove the workbook and upload it again in this same quote.",
      importedComponentCount: undefined,
      importedAt: undefined,
    };
  }

  return {
    ...bomImport,
    status: normalizedStatus,
    reviewState: normalizedReviewState,
    fileName: normalizeText(bomImport.fileName),
    sizeBytes: typeof bomImport.sizeBytes === "number" && Number.isFinite(bomImport.sizeBytes) ? Math.max(0, Math.trunc(bomImport.sizeBytes)) : 0,
    mimeType: normalizeText(bomImport.mimeType) || undefined,
    capturedAt: normalizeText(bomImport.capturedAt),
    source: normalizedSource,
    sheetNames: normalizedSheetNames,
    sheets: normalizedSheets,
    selectedSheetName: selectedSheetName && normalizedSheets.some((sheet) => sheet.name === selectedSheetName)
      ? selectedSheetName
      : normalizedSheets[0]?.name,
    reviewedColumnMapBySheet: Object.keys(normalizedReviewedColumnMapBySheet).length
      ? normalizedReviewedColumnMapBySheet
      : undefined,
    readError: normalizeText(bomImport.readError) || undefined,
    importedComponentCount,
    importedAt: normalizeText(bomImport.importedAt) || undefined,
  };
}

function normalizeMajorProjectAttachmentState(quote: QuoteRecord) {
  const next = quote;
  const options = next.majorProject?.options ?? [];

  for (const option of options) {
    option.simpleRows = (option.simpleRows ?? []).map((row) => ({
      ...row,
      specSheetAttachment: normalizeMajorProjectSpecAttachment(row.specSheetAttachment),
    }));
    option.bundles = (option.bundles ?? []).map((bundle) => ({
      ...bundle,
      specSheetAttachment: normalizeMajorProjectSpecAttachment(bundle.specSheetAttachment),
    }));
    option.customerQuoteLines = (option.customerQuoteLines ?? []).map((line) => ({
      ...line,
      specSheetAttachment: normalizeMajorProjectSpecAttachment(line.specSheetAttachment),
    }));
  }

  return next;
}

export function serializeQuoteRecord(quote: QuoteRecord) {
  return JSON.stringify(quote);
}

export function persistSerializedQuote(value: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PROPOSAL_STORAGE_KEY, value);
  window.localStorage.setItem(PROPOSAL_STORAGE_FALLBACK_KEY, value);
}

export function persistQuoteRecord(quote: QuoteRecord) {
  persistSerializedQuote(serializeQuoteRecord(quote));
}

export function deserializeQuoteRecord(value: string | null | undefined): QuoteRecord | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as QuoteRecord;
    if (!parsed?.metadata?.proposalNumber || !parsed?.sections?.sectionA || !parsed?.customer) {
      return null;
    }

    const executiveSummaryParagraphs = normalizeLines(parsed.executiveSummary?.paragraphs);
    const executiveSummaryCustomerContext = normalizeText(parsed.executiveSummary?.customerContext) || executiveSummaryParagraphs[0] || "";
    const executiveSummaryBody = normalizeText(parsed.executiveSummary?.body) || executiveSummaryParagraphs.slice(1).join("\n\n") || "";
    const normalizedExecutiveSummaryBlocks = normalizeExecutiveSummaryBlocks({
      enabled: parsed.executiveSummary?.enabled ?? false,
      heading: parsed.executiveSummary?.heading ?? "Executive Summary",
      customerContext: executiveSummaryCustomerContext,
      body: executiveSummaryBody,
      paragraphs: executiveSummaryParagraphs,
      blocks: parsed.executiveSummary?.blocks,
    });
    const serializedExecutiveSummary = serializeExecutiveSummaryBlocks(normalizedExecutiveSummaryBlocks);

    const customerName = normalizeText(parsed.customer?.name);
    const customerContactName = normalizeText(parsed.customer?.contactName);
    const customerContactPhone = normalizeText(parsed.customer?.contactPhone);
    const customerContactEmail = normalizeText(parsed.customer?.contactEmail);
    const customerAddressLines = normalizeLines(parsed.customer?.addressLines);
    const fallbackLines = customerAddressLines;
    const billTo = {
      companyName: normalizeText(parsed.billTo?.companyName) || customerName,
      attention: normalizeText(parsed.billTo?.attention) || customerContactName,
      lines: normalizeLines(parsed.billTo?.lines).length ? normalizeLines(parsed.billTo?.lines) : fallbackLines,
    };
    const shipTo = {
      companyName: normalizeText(parsed.shipTo?.companyName) || billTo.companyName,
      attention: normalizeText(parsed.shipTo?.attention) || billTo.attention,
      lines: normalizeLines(parsed.shipTo?.lines).length ? normalizeLines(parsed.shipTo?.lines) : billTo.lines,
    };
    const shippingSameAsBillTo = parsed.shippingSameAsBillTo ?? false;
    const inetAddressLines = normalizeLines(parsed.inet?.addressLines);

    const normalizedCompanyKey = parsed.metadata?.companyKey === "ilios" ? "ilios" : "inet";

    return normalizeMajorProjectAttachmentState({
      ...parsed,
      customer: {
        ...parsed.customer,
        name: customerName,
        logoText: normalizeText(parsed.customer?.logoText),
        logoDataUrl: typeof parsed.customer?.logoDataUrl === "string" ? parsed.customer.logoDataUrl : undefined,
        contactName: customerContactName,
        contactPhone: customerContactPhone,
        contactEmail: customerContactEmail,
        addressLines: customerAddressLines,
      },
      metadata: {
        ...parsed.metadata,
        companyKey: normalizedCompanyKey,
        outputTemplateKey:
          parsed.metadata?.outputTemplateKey === "estimate_compact"
            ? "estimate_compact"
            : COMPANY_BRANDING[normalizedCompanyKey].defaultOutputTemplateKey,
        expirationDate: normalizeText(parsed.metadata?.expirationDate) || buildDefaultExpirationDate(normalizeText(parsed.metadata?.proposalDate), normalizedCompanyKey),
        workflowMode: parsed.metadata?.workflowMode ?? "quick_quote",
        opportunityId: normalizeText(parsed.metadata?.opportunityId) || undefined,
        opportunityName: normalizeText(parsed.metadata?.opportunityName) || undefined,
        salesTaxAmount: typeof parsed.metadata?.salesTaxAmount === "number" && Number.isFinite(parsed.metadata.salesTaxAmount)
          ? parsed.metadata.salesTaxAmount
          : 0,
      },
      governance: normalizeQuoteGovernanceState({
        metadata: {
          ...parsed.metadata,
          opportunityId: normalizeText(parsed.metadata?.opportunityId) || undefined,
          opportunityName: normalizeText(parsed.metadata?.opportunityName) || undefined,
        },
        internal: parsed.internal,
        governance: parsed.governance,
      }),
      commercial: {
        ...createDefaultCommercialState(),
        ...parsed.commercial,
        meta: {
          ...createDefaultCommercialState().meta,
          ...parsed.commercial?.meta,
        },
        costs: {
          ...createDefaultCommercialState().costs,
          ...parsed.commercial?.costs,
        },
      },
      majorProject: {
        ...createDefaultMajorProjectState(),
        ...parsed.majorProject,
        summary: {
          ...createDefaultMajorProjectState().summary,
          ...parsed.majorProject?.summary,
        },
        bomImport: normalizeMajorProjectBomImportState(parsed.majorProject?.bomImport),
        commercial: {
          ...createDefaultMajorProjectState().commercial,
          ...parsed.majorProject?.commercial,
        },
        options: parsed.majorProject?.options?.length ? parsed.majorProject.options : createDefaultMajorProjectState().options,
        activeOptionId: parsed.majorProject?.activeOptionId ?? parsed.majorProject?.options?.[0]?.id ?? createDefaultMajorProjectState().activeOptionId,
      },
      serviceAgreement: normalizeQuoteServiceAgreementState(parsed.serviceAgreement ?? createDefaultQuoteServiceAgreementState()),
      warranty: normalizeQuoteWarrantyDetails(parsed.warranty),
      inet: {
        ...parsed.inet,
        addressLines: inetAddressLines,
      },
      internal: {
        crmOwnerLabel: parsed.internal?.crmOwnerLabel,
        crmSyncReady: parsed.internal?.crmSyncReady,
        savedProposalId: parsed.internal?.savedProposalId,
        savedCustomerProfileId: normalizeText(parsed.internal?.savedCustomerProfileId),
        workspaceOwnerId: parsed.internal?.workspaceOwnerId,
        workspaceOwnerName: parsed.internal?.workspaceOwnerName,
        ...parsed.internal,
      },
      integrations: parsed.integrations ?? createDefaultIntegrationState(),
      documentation: {
        ...parsed.documentation,
        billToHeading: parsed.documentation?.billToHeading ?? "Bill To",
        shipToHeading: parsed.documentation?.shipToHeading ?? "Ship To",
      },
      billTo,
      shipTo,
      shippingSameAsBillTo,
      executiveSummary: {
        enabled: parsed.executiveSummary?.enabled ?? false,
        heading: parsed.executiveSummary?.heading ?? "Executive Summary",
        customerContext: executiveSummaryCustomerContext,
        body: serializedExecutiveSummary.body,
        paragraphs: executiveSummaryParagraphs.length
          ? executiveSummaryParagraphs
          : [executiveSummaryCustomerContext, ...serializedExecutiveSummary.paragraphs].filter((entry) => entry.trim().length > 0),
        blocks: serializedExecutiveSummary.blocks,
      },
      customFields: normalizeCustomFields(parsed.customFields),
    });
  } catch {
    return null;
  }
}

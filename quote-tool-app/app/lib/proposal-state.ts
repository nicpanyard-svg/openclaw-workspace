import { createDefaultIntegrationState } from "@/app/lib/crm";
import { createDefaultCommercialState } from "@/app/lib/commercial-model";
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
        workflowMode: parsed.metadata?.workflowMode ?? "quick_quote",
        opportunityId: normalizeText(parsed.metadata?.opportunityId) || undefined,
        opportunityName: normalizeText(parsed.metadata?.opportunityName) || undefined,
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
        bomImport: parsed.majorProject?.bomImport
          ? {
              ...parsed.majorProject.bomImport,
            }
          : createDefaultMajorProjectState().bomImport,
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

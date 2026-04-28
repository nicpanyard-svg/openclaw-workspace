import { createDefaultIntegrationState } from "@/app/lib/crm";
import { createDefaultCommercialState } from "@/app/lib/commercial-model";
import { createDefaultMajorProjectState } from "@/app/lib/major-project";
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

    return {
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
      },
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
        commercial: {
          ...createDefaultMajorProjectState().commercial,
          ...parsed.majorProject?.commercial,
        },
        options: parsed.majorProject?.options?.length ? parsed.majorProject.options : createDefaultMajorProjectState().options,
        activeOptionId: parsed.majorProject?.activeOptionId ?? parsed.majorProject?.options?.[0]?.id ?? createDefaultMajorProjectState().activeOptionId,
      },
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
        body: executiveSummaryBody,
        paragraphs: executiveSummaryParagraphs.length
          ? executiveSummaryParagraphs
          : [executiveSummaryCustomerContext, executiveSummaryBody].filter((entry) => entry.trim().length > 0),
      },
      customFields: normalizeCustomFields(parsed.customFields),
    };
  } catch {
    return null;
  }
}

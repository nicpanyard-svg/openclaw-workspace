import { createDefaultIntegrationState } from "@/app/lib/crm";
import { createDefaultCommercialState } from "@/app/lib/commercial-model";
import type { QuoteRecord } from "@/app/lib/quote-record";

export const PROPOSAL_STORAGE_KEY = "quote-tool-app:proposal-state";

export function serializeQuoteRecord(quote: QuoteRecord) {
  return JSON.stringify(quote);
}

export function deserializeQuoteRecord(value: string | null | undefined): QuoteRecord | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as QuoteRecord;
    if (!parsed?.metadata?.proposalNumber || !parsed?.sections?.sectionA || !parsed?.customer) {
      return null;
    }

    const executiveSummaryParagraphs = parsed.executiveSummary?.paragraphs ?? [];
    const executiveSummaryCustomerContext = parsed.executiveSummary?.customerContext ?? executiveSummaryParagraphs[0] ?? "";
    const executiveSummaryBody = parsed.executiveSummary?.body ?? executiveSummaryParagraphs.slice(1).join("\n\n") ?? "";

    const fallbackLines = parsed.customer?.addressLines ?? [];
    const billTo = parsed.billTo ?? {
      companyName: parsed.customer?.name ?? "",
      attention: parsed.customer?.contactName ?? "",
      lines: fallbackLines,
    };
    const shipTo = parsed.shipTo ?? billTo;
    const shippingSameAsBillTo = parsed.shippingSameAsBillTo ?? false;

    return {
      ...parsed,
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
      internal: {
        crmOwnerLabel: parsed.internal?.crmOwnerLabel,
        crmSyncReady: parsed.internal?.crmSyncReady,
        savedProposalId: parsed.internal?.savedProposalId,
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
      customFields: (parsed.customFields ?? []).map((field) => ({
        ...field,
        visibility: field.visibility === "internal" ? "internal" : "customer",
      })),
    };
  } catch {
    return null;
  }
}

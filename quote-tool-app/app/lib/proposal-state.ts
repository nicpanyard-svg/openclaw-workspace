import { createDefaultIntegrationState } from "@/app/lib/crm";
import type { QuoteRecord } from "@/app/lib/quote-record";

export const PROPOSAL_STORAGE_KEY = "quote-tool-app:proposal-state";

export function serializeQuoteRecord(quote: QuoteRecord) {
  return JSON.stringify(quote);
}

export function deserializeQuoteRecord(value: string | null | undefined): QuoteRecord | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as QuoteRecord;
    if (!parsed?.metadata?.proposalNumber || !parsed?.sections?.sectionA || !parsed?.customer?.name) {
      return null;
    }

    return {
      ...parsed,
      internal: {
        crmOwnerLabel: parsed.internal?.crmOwnerLabel,
        crmSyncReady: parsed.internal?.crmSyncReady,
        ...parsed.internal,
      },
      integrations: parsed.integrations ?? createDefaultIntegrationState(),
    };
  } catch {
    return null;
  }
}

import type { QuoteGovernanceState, QuoteRecord } from "@/app/lib/quote-record";

export const QUOTE_MODEL_SCHEMA_VERSION = 2;

export type QuoteOwnershipRule = {
  scope: string;
  rapidQuoteOwns: string;
  salesforceOwns?: string;
  notes: string;
};

export type QuotePricingArchitectureRule = {
  surface: string;
  sourceOfTruth: string;
  allowedPresentationLayers: string[];
  notes: string;
};

export type QuoteOutputConsistencyRule = {
  output: string;
  sourceOfTruth: string;
  notes: string;
};

export type SalesforceSyncContractRule = {
  fieldGroup: string;
  direction: "push" | "pull" | "bidirectional" | "reference_only";
  sourceOfTruth: "rapidquote" | "salesforce" | "shared";
  notes: string;
};

export type QuoteBuilderStabilityRule = {
  surface: string;
  keepStable: string[];
  avoid: string[];
  notes: string;
};

export const RAPIDQUOTE_ENTITY_OWNERSHIP_RULES: QuoteOwnershipRule[] = [
  {
    scope: "Customer / account identity",
    rapidQuoteOwns: "customer-facing quote party details, bill-to/ship-to, saved customer profile linkage",
    salesforceOwns: "canonical Account and Contact records when a CRM connector is active",
    notes: "RapidQuote stays standalone-first. CRM IDs attach as references without replacing the internal quote customer block.",
  },
  {
    scope: "Opportunity identity",
    rapidQuoteOwns: "quote-side opportunity key/name for standalone pipeline context",
    salesforceOwns: "canonical Opportunity identity when synced",
    notes: "Standalone drafts can operate without Salesforce, but should still preserve a stable opportunity-shaped slot for later mapping.",
  },
  {
    scope: "Quote economics",
    rapidQuoteOwns: "commercial model, pricing rollups, proposal sections, approval workbook inputs, output rendering",
    notes: "CRM systems receive calculated results; they do not become the source of truth for quote math.",
  },
  {
    scope: "Approval and revision trace",
    rapidQuoteOwns: "revision lineage, approval stage, proposal artifacts, internal workspace history",
    salesforceOwns: "future downstream references only",
    notes: "Revision and approval rules must remain valid even when no CRM sync has ever run.",
  },
];

export const RAPIDQUOTE_PRICING_ARCHITECTURE_RULES: QuotePricingArchitectureRule[] = [
  {
    surface: "Internal component pricing",
    sourceOfTruth: "Major Project components or Quick Quote rows",
    allowedPresentationLayers: ["bundles", "customer quote lines", "proposal sections"],
    notes: "Internal pricing inputs are the economic source. Bundles and quote lines are presentation/package layers, not alternate pricing engines.",
  },
  {
    surface: "Bundles",
    sourceOfTruth: "resolved component membership",
    allowedPresentationLayers: ["customer quote lines", "proposal output"],
    notes: "Bundles may regroup components but should not fork cost math away from the underlying component set.",
  },
  {
    surface: "Customer quote lines",
    sourceOfTruth: "bundle/component selection plus explicit presentation overrides",
    allowedPresentationLayers: ["proposal sections", "exports"],
    notes: "Customer quote lines remain presentation-oriented so RapidQuote can map to CPQ quote lines later without changing internal cost ownership.",
  },
  {
    surface: "Quick Quote path",
    sourceOfTruth: "row-level sell/cost inputs",
    allowedPresentationLayers: ["mapped conversion", "proposal sections", "exports"],
    notes: "Quick Quote remains valid standalone, but mapped conversion should preserve traceability into the structured model.",
  },
];

export const RAPIDQUOTE_OUTPUT_CONSISTENCY_RULES: QuoteOutputConsistencyRule[] = [
  {
    output: "Proposal HTML",
    sourceOfTruth: "customer-facing QuoteRecord sections and structured summary blocks",
    notes: "HTML remains the primary customer-visible document model.",
  },
  {
    output: "PDF",
    sourceOfTruth: "proposal HTML render path plus approved post-processing overlays only",
    notes: "PDF must be derived from the same proposal content, not a divergent second template.",
  },
  {
    output: "Approval workbook",
    sourceOfTruth: "internal commercial model plus proposal-linked summary fields",
    notes: "Workbook labels may differ for internal reviewers, but totals and commercial drivers must reconcile to the same quote record.",
  },
  {
    output: "Future CRM sync payload",
    sourceOfTruth: "finalized internal quote and export artifacts",
    notes: "Downstream systems should receive stable summarized fields and references, not re-calculate quote math independently.",
  },
];

export const RAPIDQUOTE_SALESFORCE_SYNC_CONTRACT: SalesforceSyncContractRule[] = [
  {
    fieldGroup: "Account / contact references",
    direction: "bidirectional",
    sourceOfTruth: "shared",
    notes: "RapidQuote can start with standalone customer data, then attach Salesforce Account/Contact references when available.",
  },
  {
    fieldGroup: "Opportunity references",
    direction: "bidirectional",
    sourceOfTruth: "shared",
    notes: "Opportunity identity should sync as a stable reference, while standalone RapidQuote can still carry its own opportunity key/name.",
  },
  {
    fieldGroup: "Quote economics and output totals",
    direction: "push",
    sourceOfTruth: "rapidquote",
    notes: "RapidQuote owns pricing math, proposal rendering, and approval workbook totals.",
  },
  {
    fieldGroup: "Revision and approval status",
    direction: "push",
    sourceOfTruth: "rapidquote",
    notes: "Salesforce should consume revision label, approval stage, and artifact references rather than invent a parallel state machine.",
  },
  {
    fieldGroup: "External IDs",
    direction: "reference_only",
    sourceOfTruth: "salesforce",
    notes: "External CRM IDs live in integration references and must never replace the internal quote family/revision lineage.",
  },
];

export const RAPIDQUOTE_BUILDER_STABILITY_RULES: QuoteBuilderStabilityRule[] = [
  {
    surface: "Customer + quote header",
    keepStable: ["customer identity", "workflow mode choice", "proposal identity", "ownership/status"],
    avoid: ["moving core quote identity between unrelated panels", "duplicating customer/account controls in multiple builder sections"],
    notes: "Core quote identity should stay predictable so standalone and future CPQ usage share the same mental model.",
  },
  {
    surface: "Major Project builder",
    keepStable: ["component ownership of cost math", "bundle/quote-line presentation layering", "vendor/BOM/vendor-quote intake traceability"],
    avoid: ["reintroducing overlapping controls that edit the same pricing truth in multiple steps"],
    notes: "Mapped Builder should stay component-first while Quick Quote remains a simpler standalone entry path.",
  },
  {
    surface: "Install/service pricing flow",
    keepStable: ["Section C row editing", "SLA defaults living with install/service pricing"],
    avoid: ["splitting SLA logic into a disconnected side workflow"],
    notes: "Service agreement defaults should feel embedded in pricing, not like a separate mini-product.",
  },
];

export function buildRevisionLabel(revisionNumber: number) {
  return `${Math.max(revisionNumber, 1)}.0`;
}

export function createQuoteGovernanceState(params: {
  quoteId: string;
  revisionNumber?: number;
  basedOnRevisionId?: string;
  sourceMode?: QuoteGovernanceState["sourceMode"];
  accountKey?: string;
  opportunityKey?: string;
}): QuoteGovernanceState {
  const revisionNumber = Math.max(params.revisionNumber ?? 1, 1);
  return {
    schemaVersion: QUOTE_MODEL_SCHEMA_VERSION,
    quoteFamilyId: params.quoteId,
    revisionId: `${params.quoteId}:r${revisionNumber}`,
    revisionNumber,
    revisionLabel: buildRevisionLabel(revisionNumber),
    sourceMode: params.sourceMode ?? "standalone_first",
    sourceOfTruth: "rapidquote",
    accountKey: params.accountKey || undefined,
    opportunityKey: params.opportunityKey || undefined,
    basedOnRevisionId: params.basedOnRevisionId || undefined,
  };
}

export function normalizeQuoteGovernanceState(
  quote: Pick<QuoteRecord, "metadata" | "internal" | "governance">,
): QuoteGovernanceState {
  const quoteId = quote.internal?.quoteId || `quote_${Date.now()}`;
  const revisionNumber = Math.max(
    Number(quote.governance?.revisionNumber)
      || Number(String(quote.metadata?.revisionVersion ?? "").split(".")[0])
      || 1,
    1,
  );
  const quoteFamilyId = quote.governance?.quoteFamilyId || quoteId;
  const revisionLabel = quote.governance?.revisionLabel || quote.metadata?.revisionVersion || buildRevisionLabel(revisionNumber);

  return {
    schemaVersion: QUOTE_MODEL_SCHEMA_VERSION,
    quoteFamilyId,
    revisionId: quote.governance?.revisionId || `${quoteFamilyId}:r${revisionNumber}`,
    revisionNumber,
    revisionLabel,
    sourceMode: quote.governance?.sourceMode === "crm_attached" ? "crm_attached" : "standalone_first",
    sourceOfTruth: "rapidquote",
    accountKey: quote.governance?.accountKey || quote.metadata?.accountId || quote.metadata?.accountName || undefined,
    opportunityKey: quote.governance?.opportunityKey || quote.metadata?.opportunityId || quote.metadata?.opportunityName || undefined,
    basedOnRevisionId: quote.governance?.basedOnRevisionId || undefined,
  };
}

export function createCopiedQuoteGovernanceState(params: {
  newQuoteId: string;
  accountKey?: string;
  opportunityKey?: string;
}): QuoteGovernanceState {
  return createQuoteGovernanceState({
    quoteId: params.newQuoteId,
    revisionNumber: 1,
    sourceMode: "standalone_first",
    accountKey: params.accountKey,
    opportunityKey: params.opportunityKey,
  });
}

export function createNextQuoteRevisionState(sourceQuote: Pick<QuoteRecord, "metadata" | "internal" | "governance">): QuoteGovernanceState {
  const current = normalizeQuoteGovernanceState(sourceQuote);
  const nextRevisionNumber = current.revisionNumber + 1;
  return {
    ...current,
    revisionId: `${current.quoteFamilyId}:r${nextRevisionNumber}`,
    revisionNumber: nextRevisionNumber,
    revisionLabel: buildRevisionLabel(nextRevisionNumber),
    basedOnRevisionId: current.revisionId,
  };
}

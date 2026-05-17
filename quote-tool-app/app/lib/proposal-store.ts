import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import type { QuoteRecord, QuoteStatus } from "@/app/lib/quote-record";
import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import { createCopiedQuoteGovernanceState, normalizeQuoteGovernanceState } from "@/app/lib/cpq-governance";
import { generateQuoteNumber } from "@/app/lib/quote-template";

export const PROPOSAL_STORE_KEY = "rapidquote:proposal-store";
export const ACTIVE_PROPOSAL_ID_KEY = "rapidquote:active-proposal-id";

export type ProposalOwner = {
  id: string;
  name: string;
  email: string;
  role?: string;
  team?: string;
};

export type ProposalActivity = {
  id: string;
  type: "created" | "updated" | "status_changed" | "owner_changed" | "opened";
  message: string;
  at: string;
  by: Pick<ProposalOwner, "id" | "name">;
};

export type ProposalSummary = {
  id: string;
  proposalNumber: string;
  title: string;
  customerName: string;
  ownerId: string;
  ownerName: string;
  status: QuoteStatus;
  stageLabel: string;
  updatedAt: string;
  createdAt: string;
  totalMonthly: number;
  equipmentTotal: number;
  optionalServicesTotal: number;
  totalGrossProfit: number;
  totalGrossMarginPercent: number;
};

export type SavedProposalRecord = {
  id: string;
  recordVersion: number;
  quote: QuoteRecord;
  owner: ProposalOwner;
  createdBy: ProposalOwner;
  createdAt: string;
  updatedAt: string;
  status: QuoteStatus;
  stageLabel: string;
  workspace: {
    visibility: "internal";
    accountSegment: string;
    branchLabel?: string;
  };
  activity: ProposalActivity[];
};

export type ProposalStoreData = {
  currentUser: ProposalOwner;
  users: ProposalOwner[];
  proposals: SavedProposalRecord[];
};

export const mockUsers: ProposalOwner[] = [
  {
    id: "nick-panyard",
    name: "Nick Panyard",
    email: "nick.panyard@inetlte.com",
    role: "Account Executive",
    team: "Sales",
  },
  {
    id: "casey-ops",
    name: "Casey Morgan",
    email: "casey@inetlte.com",
    role: "Sales Ops",
    team: "Revenue Operations",
  },
  {
    id: "sam-engineering",
    name: "Sam Rivera",
    email: "sam@inetlte.com",
    role: "Solutions Engineer",
    team: "Engineering",
  },
];

export const QUOTE_STATUS_OPTIONS: Array<{ value: QuoteStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "booked", label: "Booked" },
];

export const OPEN_QUOTE_STATUSES: QuoteStatus[] = ["draft", "in_review", "approved", "sent"];

export function isOpenQuoteStatus(status: QuoteStatus) {
  return OPEN_QUOTE_STATUSES.includes(status);
}

export function computeQuoteTotals(quote: QuoteRecord) {
  const sectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;
  const totalMonthly = Number(sectionARows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2));
  const equipmentTotal = Number(
    quote.sections.sectionB.lineItems.reduce((sum, row) => sum + (row.totalPrice ?? row.quantity * row.unitPrice), 0).toFixed(2),
  );
  const optionalServicesTotal = Number(quote.sections.sectionC.lineItems.reduce((sum, row) => sum + row.totalPrice, 0).toFixed(2));

  return {
    totalMonthly,
    equipmentTotal,
    optionalServicesTotal,
  };
}

export function buildProposalSummary(proposal: SavedProposalRecord): ProposalSummary {
  const totals = computeQuoteTotals(proposal.quote);
  const commercial = buildCommercialMetrics(proposal.quote);

  return {
    id: proposal.id,
    proposalNumber: proposal.quote.metadata.proposalNumber,
    title: proposal.quote.metadata.documentTitle,
    customerName: proposal.quote.customer.name,
    ownerId: proposal.owner.id,
    ownerName: proposal.owner.name,
    status: proposal.status,
    stageLabel: proposal.stageLabel,
    updatedAt: proposal.updatedAt,
    createdAt: proposal.createdAt,
    totalMonthly: totals.totalMonthly,
    equipmentTotal: totals.equipmentTotal,
    optionalServicesTotal: totals.optionalServicesTotal,
    totalGrossProfit: commercial.totalGrossProfit,
    totalGrossMarginPercent: commercial.totalGrossMarginPercent,
  };
}

export function createProposalFromQuote(params: {
  quote: QuoteRecord;
  owner?: ProposalOwner;
  currentUser?: ProposalOwner;
}): SavedProposalRecord {
  const currentUser = params.currentUser ?? mockUsers[0];
  const owner = params.owner ?? currentUser;
  const now = new Date().toISOString();
  const id = params.quote.internal?.quoteId || `proposal_${Date.now()}`;

  return {
    id,
    recordVersion: 1,
    quote: {
      ...params.quote,
      governance: normalizeQuoteGovernanceState({
        metadata: params.quote.metadata,
        internal: {
          ...params.quote.internal,
          quoteId: id,
        },
        governance: params.quote.governance,
      }),
      internal: {
        ...params.quote.internal,
        quoteId: id,
        quoteStatus: params.quote.metadata.status,
        crmOwnerLabel: owner.name,
        savedProposalId: id,
        workspaceOwnerId: owner.id,
        workspaceOwnerName: owner.name,
      },
      metadata: {
        ...params.quote.metadata,
        ownerUserId: owner.id,
        ownerName: params.quote.metadata.ownerName ?? owner.name,
      },
    },
    owner,
    createdBy: currentUser,
    createdAt: now,
    updatedAt: now,
    status: params.quote.metadata.status,
    stageLabel: statusToStageLabel(params.quote.metadata.status),
    workspace: {
      visibility: "internal",
      accountSegment: "Direct Sales",
      branchLabel: "RapidQuote Workspace",
    },
    activity: [
      {
        id: `activity_created_${Date.now()}`,
        type: "created",
        message: `Proposal created for ${params.quote.customer.name || "new customer draft"}`,
        at: now,
        by: { id: currentUser.id, name: currentUser.name },
      },
    ],
  };
}

export function createProposalCopy(params: {
  proposal: SavedProposalRecord;
  owner?: ProposalOwner;
  currentUser?: ProposalOwner;
}): SavedProposalRecord {
  const currentUser = params.currentUser ?? mockUsers[0];
  const owner = params.owner ?? params.proposal.owner ?? currentUser;
  const now = new Date().toISOString();
  const sourceQuote = JSON.parse(JSON.stringify(params.proposal.quote)) as QuoteRecord;
  const sourceTitle = params.proposal.quote.metadata.documentTitle?.trim() || params.proposal.quote.customer.name?.trim() || "Proposal";
  const id = `proposal_${Date.now()}`;
  const proposalDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const proposalNumber = generateQuoteNumber(new Date());

  return {
    id,
    recordVersion: 1,
    quote: {
      ...sourceQuote,
      governance: createCopiedQuoteGovernanceState({
        newQuoteId: id,
        accountKey: sourceQuote.metadata.accountId || sourceQuote.metadata.accountName || undefined,
        opportunityKey: sourceQuote.metadata.opportunityId || sourceQuote.metadata.opportunityName || undefined,
      }),
      metadata: {
        ...sourceQuote.metadata,
        proposalNumber,
        proposalDate,
        revisionVersion: "1.0",
        documentTitle: `${sourceTitle} Copy`,
        status: "draft",
        ownerUserId: owner.id,
        ownerName: owner.name,
        lastTouchedAt: now,
      },
      documentation: {
        ...sourceQuote.documentation,
        proposalTitle: `${sourceTitle} Copy`,
        proposalDateLabel: proposalDate,
        proposalNumberLabel: proposalNumber,
      },
      internal: {
        ...sourceQuote.internal,
        quoteId: id,
        quoteStatus: "draft",
        crmOwnerLabel: owner.name,
        crmSyncReady: false,
        savedProposalId: id,
        workspaceOwnerId: owner.id,
        workspaceOwnerName: owner.name,
      },
      integrations: {
        ...sourceQuote.integrations,
        connectors: sourceQuote.integrations.connectors.map((connector) => ({
          ...connector,
          status: connector.enabled ? "configured" : "disconnected",
          lastValidatedAt: undefined,
        })),
        quoteReferences: {},
        lastSyncSummary: "Copy created from the source proposal. Reconnect CRM references before syncing.",
      },
      revisionHistory: [
        {
          version: "1.0",
          changeDetails: `New standalone quote copied from ${params.proposal.quote.metadata.proposalNumber || sourceTitle}.`,
          recordedAt: now,
          revisionId: `${id}:r1`,
        },
      ],
    },
    owner,
    createdBy: currentUser,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    stageLabel: statusToStageLabel("draft"),
    workspace: {
      ...params.proposal.workspace,
    },
    activity: [
      {
        id: `activity_copied_${Date.now()}`,
        type: "created",
        message: `Proposal copied from ${params.proposal.quote.metadata.proposalNumber || sourceTitle} with customer, pricing, and proposal sections preserved`,
        at: now,
        by: { id: currentUser.id, name: currentUser.name },
      },
    ],
  };
}

export function statusToStageLabel(status: QuoteStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "in_review":
      return "In Review";
    case "approved":
      return "Approved";
    case "sent":
      return "Sent";
    case "booked":
      return "Booked";
    default:
      return "Draft";
  }
}

export function serializeProposalStore(store: ProposalStoreData) {
  return JSON.stringify(store);
}

export function deserializeProposalStore(value: string | null | undefined): ProposalStoreData | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as ProposalStoreData;
    if (!parsed?.currentUser || !Array.isArray(parsed?.users) || !Array.isArray(parsed?.proposals)) {
      return null;
    }

    const normalizeOwner = (owner: ProposalOwner | null | undefined, fallback: ProposalOwner): ProposalOwner => ({
      ...fallback,
      ...owner,
      id: owner?.id ?? fallback.id,
      name: owner?.name ?? fallback.name,
      email: owner?.email ?? fallback.email,
    });

    const currentUser = normalizeOwner(parsed.currentUser, mockUsers[0]);
    const users = parsed.users.map((user) => normalizeOwner(user, currentUser));
    const proposals: SavedProposalRecord[] = parsed.proposals.flatMap((proposal) => {
        const normalizedQuote = deserializeQuoteRecord(JSON.stringify(proposal?.quote));
        if (!proposal?.id || !normalizedQuote) {
          return [];
        }

        const owner = normalizeOwner(proposal.owner, currentUser);
        const createdBy = normalizeOwner(proposal.createdBy, owner);
        const status = proposal.status ?? normalizedQuote.metadata.status;

        return [{
          ...proposal,
          recordVersion: typeof proposal.recordVersion === "number" ? proposal.recordVersion : 1,
          quote: {
            ...normalizedQuote,
            metadata: {
              ...normalizedQuote.metadata,
              status,
              ownerUserId: owner.id,
              ownerName: normalizedQuote.metadata.ownerName ?? owner.name,
            },
            internal: {
              ...normalizedQuote.internal,
              quoteId: normalizedQuote.internal.quoteId || proposal.id,
              savedProposalId: proposal.id,
              quoteStatus: status,
              workspaceOwnerId: owner.id,
              workspaceOwnerName: owner.name,
              crmOwnerLabel: normalizedQuote.internal.crmOwnerLabel ?? owner.name,
            },
          },
          owner,
          createdBy,
          createdAt: typeof proposal.createdAt === "string" ? proposal.createdAt : new Date().toISOString(),
          updatedAt: typeof proposal.updatedAt === "string" ? proposal.updatedAt : new Date().toISOString(),
          status,
          stageLabel: proposal.stageLabel || statusToStageLabel(status),
          workspace: proposal.workspace?.visibility === "internal"
            ? proposal.workspace
            : {
                visibility: "internal" as const,
                accountSegment: "Direct Sales",
                branchLabel: "RapidQuote Workspace",
              },
          activity: Array.isArray(proposal.activity) ? proposal.activity : [],
        }];
      });

    return {
      currentUser,
      users,
      proposals,
    };
  } catch {
    return null;
  }
}

export function getProposalById(store: ProposalStoreData, proposalId: string | null | undefined) {
  if (!proposalId) return null;
  return store.proposals.find((proposal) => proposal.id === proposalId) ?? null;
}

export function getActiveProposalId(store: ProposalStoreData, preferredId?: string | null) {
  return getProposalById(store, preferredId)?.id ?? store.proposals[0]?.id ?? null;
}

export function getActiveProposal(store: ProposalStoreData, preferredId?: string | null) {
  const activeId = getActiveProposalId(store, preferredId);
  return getProposalById(store, activeId);
}

export function upsertProposal(store: ProposalStoreData, proposal: SavedProposalRecord): ProposalStoreData {
  const existingIndex = store.proposals.findIndex((entry) => entry.id === proposal.id);
  const proposals = [...store.proposals];

  if (existingIndex >= 0) {
    proposals[existingIndex] = proposal;
  } else {
    proposals.unshift(proposal);
  }

  return {
    ...store,
    proposals,
  };
}

export function removeProposal(store: ProposalStoreData, proposalId: string): ProposalStoreData {
  return {
    ...store,
    proposals: store.proposals.filter((proposal) => proposal.id !== proposalId),
  };
}

export function getDefaultProposalStore(seedProposal: SavedProposalRecord): ProposalStoreData {
  const proposals: SavedProposalRecord[] = [
    seedProposal,
    {
      ...seedProposal,
      id: "proposal_acme_terminal_refresh",
      createdAt: "2026-04-08T15:10:00.000Z",
      updatedAt: "2026-04-15T17:42:00.000Z",
      status: "sent",
      stageLabel: "Sent",
      owner: mockUsers[1],
      quote: {
        ...seedProposal.quote,
        metadata: {
          ...seedProposal.quote.metadata,
          proposalNumber: "RCT018",
          documentTitle: "ACME Terminal Refresh",
          customerShortName: "ACME",
          status: "sent",
          ownerUserId: mockUsers[1].id,
          ownerName: mockUsers[1].name,
        },
        customer: {
          ...seedProposal.quote.customer,
          name: "ACME Logistics",
          logoText: "ACME",
          contactName: "Jordan Blake",
          contactEmail: "jordan.blake@acme-logistics.com",
        },
        internal: {
          ...seedProposal.quote.internal,
          quoteId: "proposal_acme_terminal_refresh",
          savedProposalId: "proposal_acme_terminal_refresh",
          quoteStatus: "sent",
          crmOwnerLabel: mockUsers[1].name,
          workspaceOwnerId: mockUsers[1].id,
          workspaceOwnerName: mockUsers[1].name,
        },
      },
      activity: [
        {
          id: "activity_acme_created",
          type: "created",
          message: "Proposal created for ACME Logistics",
          at: "2026-04-08T15:10:00.000Z",
          by: { id: mockUsers[1].id, name: mockUsers[1].name },
        },
        {
          id: "activity_acme_sent",
          type: "status_changed",
          message: "Proposal sent for customer review",
          at: "2026-04-15T17:42:00.000Z",
          by: { id: mockUsers[1].id, name: mockUsers[1].name },
        },
      ],
    },
    {
      ...seedProposal,
      id: "proposal_riverline_upgrade",
      createdAt: "2026-04-11T13:20:00.000Z",
      updatedAt: "2026-04-16T19:05:00.000Z",
      status: "in_review",
      stageLabel: "In Review",
      owner: mockUsers[2],
      quote: {
        ...seedProposal.quote,
        metadata: {
          ...seedProposal.quote.metadata,
          proposalNumber: "RCT021",
          documentTitle: "Riverline Field Upgrade",
          customerShortName: "Riverline",
          status: "in_review",
          ownerUserId: mockUsers[2].id,
          ownerName: mockUsers[2].name,
        },
        customer: {
          ...seedProposal.quote.customer,
          name: "Riverline Midstream",
          logoText: "Riverline",
          contactName: "Avery Cole",
          contactEmail: "avery.cole@riverline.com",
        },
        internal: {
          ...seedProposal.quote.internal,
          quoteId: "proposal_riverline_upgrade",
          savedProposalId: "proposal_riverline_upgrade",
          quoteStatus: "in_review",
          crmOwnerLabel: mockUsers[2].name,
          workspaceOwnerId: mockUsers[2].id,
          workspaceOwnerName: mockUsers[2].name,
        },
      },
      activity: [
        {
          id: "activity_riverline_created",
          type: "created",
          message: "Proposal created for Riverline Midstream",
          at: "2026-04-11T13:20:00.000Z",
          by: { id: mockUsers[2].id, name: mockUsers[2].name },
        },
        {
          id: "activity_riverline_review",
          type: "updated",
          message: "Proposal updated after internal review",
          at: "2026-04-16T19:05:00.000Z",
          by: { id: mockUsers[2].id, name: mockUsers[2].name },
        },
      ],
    },
  ];

  return {
    currentUser: mockUsers[0],
    users: mockUsers,
    proposals,
  };
}

import type { QuoteRecord, QuoteStatus } from "@/app/lib/quote-record";

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
  const sourceShortName = params.proposal.quote.metadata.customerShortName?.trim() || "Draft";
  const id = `proposal_${Date.now()}`;
  const proposalNumber = `${params.proposal.quote.metadata.proposalNumber || "RCT"}-COPY`;

  const clearedCustomer = {
    ...sourceQuote.customer,
    name: "",
    logoText: "",
    logoDataUrl: undefined,
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    addressLines: [],
  };

  const clearedAddress = {
    companyName: "",
    attention: "",
    lines: [],
  };

  return {
    id,
    recordVersion: 1,
    quote: {
      ...sourceQuote,
      metadata: {
        ...sourceQuote.metadata,
        proposalNumber,
        documentTitle: `${sourceTitle} Copy`,
        customerShortName: "",
        status: "draft",
        ownerUserId: owner.id,
        ownerName: owner.name,
        accountId: undefined,
        accountName: undefined,
        lastTouchedAt: now,
      },
      documentation: {
        ...sourceQuote.documentation,
        proposalTitle: `${sourceTitle} Copy`,
        proposalDateLabel: sourceQuote.metadata.proposalDate,
        proposalNumberLabel: proposalNumber,
      },
      customer: clearedCustomer,
      billTo: clearedAddress,
      shipTo: clearedAddress,
      shippingSameAsBillTo: true,
      executiveSummary: {
        ...sourceQuote.executiveSummary,
        customerContext: "",
        paragraphs: sourceQuote.executiveSummary.enabled && sourceQuote.executiveSummary.body
          ? [sourceQuote.executiveSummary.body]
          : [],
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
        quoteReferences: {},
        lastSyncSummary: `Copied from ${params.proposal.quote.metadata.proposalNumber || sourceShortName} and reset for a new customer draft.`,
      },
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
        message: `Proposal copied from ${params.proposal.quote.metadata.proposalNumber || sourceTitle} and reset for a new customer draft`,
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
    case "sent":
      return "Sent";
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
    return parsed;
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

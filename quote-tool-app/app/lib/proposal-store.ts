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
        message: `Proposal created for ${params.quote.customer.name}`,
        at: now,
        by: { id: currentUser.id, name: currentUser.name },
      },
    ],
  };
}

export function statusToStageLabel(status: QuoteStatus) {
  switch (status) {
    case "draft":
      return "Working Draft";
    case "sent":
      return "Sent to Customer";
    case "open":
      return "Open Review";
    case "negotiating":
      return "Commercial Review";
    case "approved":
      return "Approved";
    case "closed":
      return "Closed";
    default:
      return "Working Draft";
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

export function getDefaultProposalStore(seedProposal: SavedProposalRecord): ProposalStoreData {
  const proposals: SavedProposalRecord[] = [
    seedProposal,
    {
      ...seedProposal,
      id: "proposal_acme_terminal_refresh",
      createdAt: "2026-04-08T15:10:00.000Z",
      updatedAt: "2026-04-15T17:42:00.000Z",
      status: "sent",
      stageLabel: "Sent to Customer",
      owner: mockUsers[1],
      quote: {
        ...seedProposal.quote,
        metadata: {
          ...seedProposal.quote.metadata,
          proposalNumber: "RCT018",
          documentTitle: "ACME Terminal Refresh",
          customerShortName: "ACME",
          status: "sent",
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
          quoteStatus: "sent",
          crmOwnerLabel: mockUsers[1].name,
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
      status: "negotiating",
      stageLabel: "Commercial Review",
      owner: mockUsers[2],
      quote: {
        ...seedProposal.quote,
        metadata: {
          ...seedProposal.quote.metadata,
          proposalNumber: "RCT021",
          documentTitle: "Riverline Field Upgrade",
          customerShortName: "Riverline",
          status: "negotiating",
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
          quoteStatus: "negotiating",
          crmOwnerLabel: mockUsers[2].name,
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
          message: "Commercial terms updated after internal review",
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

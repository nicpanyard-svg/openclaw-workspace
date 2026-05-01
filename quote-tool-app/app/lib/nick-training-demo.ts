import { createDefaultMajorProjectState } from "@/app/lib/major-project";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
import type { SavedCustomerProfile } from "@/app/lib/customer-profiles";
import {
  createProposalFromQuote,
  mockUsers,
  statusToStageLabel,
  type ProposalStoreData,
  type SavedProposalRecord,
} from "@/app/lib/proposal-store";
import type { QuoteRecord } from "@/app/lib/quote-record";

export const NICK_TRAINING_CUSTOMER_PROFILE_ID = "customer_nick_training_demo";
export const NICK_TRAINING_QUICK_PROPOSAL_ID = "proposal_nick_training_quick_quote";
export const NICK_TRAINING_MAJOR_PROPOSAL_ID = "proposal_nick_training_major_project";

function cloneQuote(source: QuoteRecord): QuoteRecord {
  return JSON.parse(JSON.stringify(source)) as QuoteRecord;
}

function setNickTrainingCustomer(quote: QuoteRecord) {
  quote.customer = {
    name: "Nick Training Demo Customer",
    logoText: "NT Demo",
    contactName: "Taylor Morgan",
    contactPhone: "555-0142",
    contactEmail: "taylor.morgan@example.com",
    addressLines: ["1200 Demo Parkway", "Houston, TX 77056", "United States"],
  };
  quote.billTo = {
    companyName: "Nick Training Demo Customer",
    attention: "Taylor Morgan",
    lines: ["1200 Demo Parkway", "Houston, TX 77056", "United States"],
  };
  quote.shipTo = {
    companyName: "Nick Training Demo Customer",
    attention: "Field Operations",
    lines: ["410 Training Site Road", "Midland, TX 79701", "United States"],
  };
  quote.shippingSameAsBillTo = false;
  quote.metadata.customerShortName = "NT Demo";
  quote.metadata.accountId = "acct-nick-training-demo";
  quote.metadata.accountName = "Nick Training Demo Customer";
  quote.metadata.customerProvider = "Starlink";
  quote.metadata.ownerUserId = mockUsers[0].id;
  quote.metadata.ownerName = mockUsers[0].name;
  quote.documentation.proposalTitle = "Nick Training Demo Customer";
  quote.documentation.customerAddressHeading = "Customer Address";
  quote.inet.contactName = "Nick Panyard";
  quote.inet.contactEmail = "nick.panyard@inetlte.com";
  quote.internal.crmOwnerLabel = mockUsers[0].name;
  quote.internal.workspaceOwnerId = mockUsers[0].id;
  quote.internal.workspaceOwnerName = mockUsers[0].name;
  quote.internal.savedCustomerProfileId = NICK_TRAINING_CUSTOMER_PROFILE_ID;
}

function buildQuickQuote(): QuoteRecord {
  const quote = cloneQuote(sampleQuoteRecord);
  setNickTrainingCustomer(quote);

  quote.metadata.proposalNumber = "TRAIN-Q01";
  quote.metadata.documentTitle = "Demo Quick Quote";
  quote.metadata.workflowMode = "quick_quote";
  quote.metadata.status = "draft";
  quote.metadata.lastTouchedAt = "2026-04-30T18:15:00.000Z";
  quote.documentation.proposalNumberLabel = "TRAIN-Q01";
  quote.documentation.proposalTitle = "Demo Quick Quote";
  quote.internal.quoteId = NICK_TRAINING_QUICK_PROPOSAL_ID;
  quote.internal.savedProposalId = NICK_TRAINING_QUICK_PROPOSAL_ID;
  quote.internal.quoteStatus = "draft";

  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.perKitRows = [
    {
      id: "demo_quick_service_500gb",
      rowType: "service",
      description: "500GB Data Block",
      quantity: 4,
      unitLabel: "blocks",
      unitPrice: 132,
      monthlyRate: 132,
      totalMonthlyRate: 528,
      sourceLabel: "Training demo",
    },
    {
      id: "demo_quick_terminal_fee",
      rowType: "terminal_fee",
      description: "Terminal Access Fee",
      quantity: 4,
      unitLabel: null,
      unitPrice: 45,
      monthlyRate: 45,
      totalMonthlyRate: 180,
      sourceLabel: "Training demo",
    },
    {
      id: "demo_quick_support",
      rowType: "support",
      description: "iNet Support & Portal Access",
      includedText: ["24/7/365 support", "Portal access", "Usage reporting"],
      sourceLabel: "Training demo",
    },
  ];
  quote.sections.sectionA.computed.monthlyRecurringTotal = 708;
  quote.sections.sectionB.lineItems = [
    {
      id: "demo_quick_standard_v4",
      sourceType: "standard",
      itemName: "Standard V4",
      itemCategory: "Terminal",
      terminalType: "Standard V4",
      quantity: 4,
      unitPrice: 599,
      totalPrice: 2396,
      sourceLabel: "Training demo",
    },
    {
      id: "demo_quick_pipe_adapter",
      sourceType: "standard",
      itemName: "Pipe Adapter",
      itemCategory: "Mount Adapter",
      quantity: 4,
      unitPrice: 75,
      totalPrice: 300,
      sourceLabel: "Training demo",
    },
    {
      id: "demo_quick_dual_wan_router",
      sourceType: "standard",
      itemName: "Dual-WAN Router",
      itemCategory: "Router",
      quantity: 4,
      unitPrice: 995,
      totalPrice: 3980,
      description: "Router for Starlink plus LTE failover or blended connectivity packages.",
      sourceLabel: "Training demo",
    },
    {
      id: "demo_quick_install_materials",
      sourceType: "standard",
      itemName: "Install Materials Kit",
      itemCategory: "Install Materials",
      quantity: 4,
      unitPrice: 350,
      totalPrice: 1400,
      description: "Cable management, mounting hardware, weatherproofing, and job-site materials allowance.",
      sourceLabel: "Training demo",
    },
  ];
  quote.sections.sectionB.builderLabel = "Router and install materials";
  quote.sections.sectionB.title = "Router, terminal, and install materials";
  quote.sections.sectionB.introText = "The prices below reflect one-time connectivity hardware, router, and installation material charges.";
  quote.sections.sectionB.computed.equipmentTotal = 8076;
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    {
      id: "demo_quick_site_inspection",
      sourceType: "custom",
      description: "Site inspection budgetary allowance",
      quantity: 1,
      unitPrice: 850,
      totalPrice: 850,
      pricingStage: "budgetary",
      serviceCategory: "site_inspection",
      sourceLabel: "Training demo",
    },
  ];
  quote.sections.sectionC.builderLabel = "Install and site services";
  quote.sections.sectionC.title = "Install and site services";
  quote.sections.sectionC.introText = "Use this section for site inspections, installation allowance, configuration labor, and other simple service rows.";
  quote.sections.sectionC.computed.serviceTotal = 850;
  quote.executiveSummary.customerContext = "Training demo quick quote for a small Starlink deployment.";
  quote.executiveSummary.body = "Use this record to practice the fast customer-to-quote workflow: confirm the customer, adjust monthly service, add hardware, and preview the customer-facing proposal.";
  quote.executiveSummary.paragraphs = [quote.executiveSummary.customerContext, quote.executiveSummary.body];

  return quote;
}

function buildMajorProjectQuote(): QuoteRecord {
  const quote = cloneQuote(sampleQuoteRecord);
  const majorProject = createDefaultMajorProjectState();
  setNickTrainingCustomer(quote);

  quote.metadata.proposalNumber = "TRAIN-M01";
  quote.metadata.documentTitle = "Demo Major Project Quote";
  quote.metadata.workflowMode = "major_project";
  quote.metadata.status = "in_review";
  quote.metadata.lastTouchedAt = "2026-04-30T18:45:00.000Z";
  quote.documentation.proposalNumberLabel = "TRAIN-M01";
  quote.documentation.proposalTitle = "Demo Major Project Quote";
  quote.internal.quoteId = NICK_TRAINING_MAJOR_PROPOSAL_ID;
  quote.internal.savedProposalId = NICK_TRAINING_MAJOR_PROPOSAL_ID;
  quote.internal.quoteStatus = "in_review";

  quote.majorProject = {
    ...majorProject,
    summary: {
      ...majorProject.summary,
      projectName: "Training multi-site rollout",
      projectDescription: "Demo major project with bundled hardware, field services, and recurring service economics.",
      assumptions: "Built for training the larger project workflow without touching a live customer.",
    },
    commercial: {
      ...majorProject.commercial,
      siteCount: 5,
      activeSites: 5,
      monthlyRatePerSite: 580,
      oneTimeHardwarePerSite: 2850,
      oneTimeInstallPerSite: 1900,
      oneTimeOtherPerSite: 250,
      recurringVendorPerSite: 310,
      recurringSupportPerSite: 70,
      recurringOtherPerSite: 25,
      optionalServicesAmount: 9500,
    },
    options: [
      {
        id: "training-major-option-1",
        label: "Training option",
        description: "Five-site rollout baseline",
        siteCount: 5,
        monthlyRatePerSite: 580,
        hardwarePerSite: 2850,
        installPerSite: 1900,
        otherOneTimePerSite: 250,
        vendorRecurringPerSite: 310,
        supportRecurringPerSite: 70,
        otherRecurringPerSite: 25,
      },
    ],
    activeOptionId: "training-major-option-1",
  };

  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    {
      id: "demo_major_pool",
      rowType: "service",
      description: "5 TB, U.S. Pool for Starlink Service",
      quantity: 1,
      unitLabel: "pool",
      unitPrice: 2675,
      monthlyRate: 2675,
      totalMonthlyRate: 2675,
      sourceLabel: "Training demo",
    },
    {
      id: "demo_major_terminal_fee",
      rowType: "terminal_fee",
      description: "Terminal Access Fee",
      quantity: 5,
      unitLabel: null,
      unitPrice: 45,
      monthlyRate: 45,
      totalMonthlyRate: 225,
      sourceLabel: "Training demo",
    },
    {
      id: "demo_major_support",
      rowType: "support",
      description: "iNet Support & Portal Access",
      includedText: ["24/7/365 support", "Monitoring", "Usage and performance reporting"],
      sourceLabel: "Training demo",
    },
  ];
  quote.sections.sectionA.computed.monthlyRecurringTotal = 2900;
  quote.sections.sectionB.lineItems = [
    {
      id: "demo_major_performance_g3",
      sourceType: "standard",
      itemName: "Performance G3",
      itemCategory: "Terminal",
      terminalType: "Performance G3",
      quantity: 5,
      unitPrice: 1999,
      totalPrice: 9995,
      sourceLabel: "Training demo",
    },
    {
      id: "demo_major_mount_package",
      sourceType: "custom",
      itemName: "Mounting and cabling package",
      itemCategory: "Install Materials",
      quantity: 5,
      unitPrice: 420,
      totalPrice: 2100,
      description: "Budgetary mount, cable, and install materials package.",
      sourceLabel: "Training demo",
    },
    {
      id: "demo_major_project_services",
      sourceType: "custom",
      itemName: "Project staging and configuration",
      itemCategory: "Services",
      quantity: 1,
      unitPrice: 4800,
      totalPrice: 4800,
      description: "Internal major-project service line for staging and project coordination.",
      sourceLabel: "Training demo",
    },
  ];
  quote.sections.sectionB.computed.equipmentTotal = 16895;
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    {
      id: "demo_major_install_allowance",
      sourceType: "custom",
      description: "Installation budgetary allowance for five sites",
      quantity: 5,
      unitPrice: 1900,
      totalPrice: 9500,
      pricingStage: "budgetary",
      serviceCategory: "installation",
      sourceLabel: "Training demo",
    },
  ];
  quote.sections.sectionC.computed.serviceTotal = 9500;
  quote.executiveSummary.customerContext = "Training demo major project for a five-site Starlink rollout.";
  quote.executiveSummary.body = "Use this record to practice the major-project workflow: tune project assumptions, compare internal economics, review bundled one-time scope, and move the proposal through review.";
  quote.executiveSummary.paragraphs = [quote.executiveSummary.customerContext, quote.executiveSummary.body];

  return quote;
}

function buildDemoProposal(quote: QuoteRecord, createdAt: string, updatedAt: string): SavedProposalRecord {
  const proposal = createProposalFromQuote({ quote, owner: mockUsers[0], currentUser: mockUsers[0] });
  return {
    ...proposal,
    createdAt,
    updatedAt,
    status: quote.metadata.status,
    stageLabel: statusToStageLabel(quote.metadata.status),
    workspace: {
      ...proposal.workspace,
      accountSegment: "Training Demo",
      branchLabel: "Nick Training Demo",
    },
    activity: [
      {
        id: `activity_${proposal.id}_created`,
        type: "created",
        message: `${quote.metadata.documentTitle} training record created for Nick`,
        at: createdAt,
        by: { id: mockUsers[0].id, name: mockUsers[0].name },
      },
      {
        id: `activity_${proposal.id}_ready`,
        type: quote.metadata.status === "in_review" ? "status_changed" : "updated",
        message: quote.metadata.status === "in_review" ? "Training major project moved into review" : "Training quick quote ready to edit",
        at: updatedAt,
        by: { id: mockUsers[0].id, name: mockUsers[0].name },
      },
    ],
  };
}

export function getNickTrainingDemoCustomerProfile(): SavedCustomerProfile {
  return {
    id: NICK_TRAINING_CUSTOMER_PROFILE_ID,
    companyName: "Nick Training Demo Customer",
    customerShortName: "NT Demo",
    billingAddress: {
      companyName: "Nick Training Demo Customer",
      attention: "Taylor Morgan",
      lines: ["1200 Demo Parkway", "Houston, TX 77056", "United States"],
    },
    shippingAddress: {
      companyName: "Nick Training Demo Customer",
      attention: "Field Operations",
      lines: ["410 Training Site Road", "Midland, TX 79701", "United States"],
    },
    shippingSameAsBillTo: false,
    serviceAddressLines: ["410 Training Site Road", "Midland, TX 79701", "United States"],
    mainContactName: "Taylor Morgan",
    mainContactEmail: "taylor.morgan@example.com",
    mainContactPhone: "555-0142",
    defaultOwnerUserId: mockUsers[0].id,
    defaultOwnerName: mockUsers[0].name,
    createdAt: "2026-04-30T18:00:00.000Z",
    updatedAt: "2026-04-30T18:00:00.000Z",
  };
}

export function getNickTrainingDemoProposals() {
  return [
    buildDemoProposal(buildQuickQuote(), "2026-04-30T18:00:00.000Z", "2026-04-30T18:15:00.000Z"),
    buildDemoProposal(buildMajorProjectQuote(), "2026-04-30T18:10:00.000Z", "2026-04-30T18:45:00.000Z"),
  ];
}

export function ensureNickTrainingDemoProfiles(profiles: SavedCustomerProfile[]) {
  const demoProfile = getNickTrainingDemoCustomerProfile();
  const withoutDemo = profiles.filter((profile) => profile.id !== demoProfile.id);
  return [demoProfile, ...withoutDemo].sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export function ensureNickTrainingDemoProposalStore(store: ProposalStoreData): ProposalStoreData {
  const demoProposals = getNickTrainingDemoProposals();
  const demoIds = new Set(demoProposals.map((proposal) => proposal.id));
  const existingWithoutDemo = store.proposals.filter((proposal) => !demoIds.has(proposal.id));
  const nextUsers = store.users.some((entry) => entry.id === mockUsers[0].id) ? store.users : [mockUsers[0], ...store.users];

  return {
    ...store,
    users: nextUsers,
    proposals: [...demoProposals, ...existingWithoutDemo],
  };
}

import type { SavedCustomerProfile } from "@/app/lib/customer-profiles";
import {
  createProposalFromQuote,
  mockUsers,
  statusToStageLabel,
  type ProposalOwner,
  type ProposalStoreData,
  type SavedProposalRecord,
} from "@/app/lib/proposal-store";
import type { MajorProjectComponent, MajorProjectOption, QuoteRecord } from "@/app/lib/quote-record";
import { createBlankQuoteRecord } from "@/app/lib/quote-template";

export const ILIOS_SAMPLE_QUICK_CUSTOMER_PROFILE_ID = "customer_ilios_quick_sample";
export const ILIOS_SAMPLE_MAJOR_CUSTOMER_PROFILE_ID = "customer_ilios_major_sample";
export const ILIOS_SAMPLE_QUICK_PROPOSAL_ID = "proposal_ilios_quick_quote_sample";
export const ILIOS_SAMPLE_MAJOR_PROPOSAL_ID = "proposal_ilios_major_project_sample";

function getIliosOwner(email: string): ProposalOwner {
  return mockUsers.find((user) => user.email.trim().toLowerCase() === email.trim().toLowerCase()) ?? mockUsers[0];
}

function setOwner(quote: QuoteRecord, owner: ProposalOwner) {
  quote.metadata.ownerUserId = owner.id;
  quote.metadata.ownerName = owner.name;
  quote.internal.crmOwnerLabel = owner.name;
  quote.internal.workspaceOwnerId = owner.id;
  quote.internal.workspaceOwnerName = owner.name;
}

function setCustomer(
  quote: QuoteRecord,
  options: {
    profileId: string;
    companyName: string;
    shortName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    billToLines: string[];
    shipToLines: string[];
    serviceLines: string[];
    billToAttention?: string;
    shipToAttention?: string;
    shippingSameAsBillTo?: boolean;
  },
) {
  const shippingSameAsBillTo = options.shippingSameAsBillTo ?? false;
  const billToAttention = options.billToAttention ?? options.contactName;
  const shipToAttention = options.shipToAttention ?? options.contactName;

  quote.customer = {
    name: options.companyName,
    logoText: options.shortName,
    contactName: options.contactName,
    contactEmail: options.contactEmail,
    contactPhone: options.contactPhone,
    addressLines: [...options.serviceLines],
  };
  quote.billTo = {
    companyName: options.companyName,
    attention: billToAttention,
    lines: [...options.billToLines],
  };
  quote.shipTo = shippingSameAsBillTo
    ? {
        companyName: options.companyName,
        attention: billToAttention,
        lines: [...options.billToLines],
      }
    : {
        companyName: options.companyName,
        attention: shipToAttention,
        lines: [...options.shipToLines],
      };
  quote.shippingSameAsBillTo = shippingSameAsBillTo;
  quote.metadata.customerShortName = options.shortName;
  quote.metadata.accountId = `acct-${options.shortName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  quote.metadata.accountName = options.companyName;
  quote.internal.savedCustomerProfileId = options.profileId;
  quote.documentation.proposalTitle = options.companyName;
}

function buildIliosQuickQuote(): QuoteRecord {
  const quote = createBlankQuoteRecord();
  const owner = getIliosOwner("saulo@ilios-integrators.com");

  setCustomer(quote, {
    profileId: ILIOS_SAMPLE_QUICK_CUSTOMER_PROFILE_ID,
    companyName: "Northwind Health Partners",
    shortName: "Northwind",
    contactName: "Maria Ellison",
    contactEmail: "maria.ellison@northwindhealth.com",
    contactPhone: "713-555-0114",
    billToLines: ["1240 Medical Plaza Drive", "Houston, TX 77030", "United States"],
    shipToLines: ["1240 Medical Plaza Drive", "Houston, TX 77030", "United States"],
    serviceLines: ["1240 Medical Plaza Drive", "Houston, TX 77030", "United States"],
    shippingSameAsBillTo: true,
  });
  setOwner(quote, owner);

  quote.metadata.proposalNumber = "ILQ-1001";
  quote.metadata.proposalDate = "May 20, 2026";
  quote.metadata.documentTitle = "Clinic Connectivity Refresh";
  quote.metadata.documentSubtitle = "Managed connectivity and Wi-Fi estimate";
  quote.metadata.customerProvider = "Starlink";
  quote.metadata.workflowMode = "quick_quote";
  quote.metadata.status = "draft";
  quote.metadata.lastTouchedAt = "2026-05-20T09:15:00.000Z";
  quote.metadata.opportunityName = "Northwind clinic refresh";
  quote.documentation.proposalNumberLabel = "ILQ-1001";
  quote.documentation.proposalDateLabel = "May 20, 2026";
  quote.documentation.proposalTitle = "Clinic Connectivity Refresh";
  quote.internal.quoteId = ILIOS_SAMPLE_QUICK_PROPOSAL_ID;
  quote.internal.savedProposalId = ILIOS_SAMPLE_QUICK_PROPOSAL_ID;
  quote.internal.quoteStatus = "draft";

  quote.executiveSummary.enabled = true;
  quote.executiveSummary.customerContext = "Prepared for Northwind Health Partners to refresh clinic connectivity, Wi-Fi, and basic network hardware.";
  quote.executiveSummary.body = "Use this sample to show the fast sales workflow: adjust recurring service, update hardware quantities, and send a polished estimate without entering the Major Project builder.";
  quote.executiveSummary.paragraphs = [quote.executiveSummary.customerContext, quote.executiveSummary.body];
  quote.executiveSummary.blocks = [
    {
      id: "ilios-quick-heading",
      type: "heading",
      text: "Project Summary",
    },
    {
      id: "ilios-quick-body",
      type: "paragraph",
      text: quote.executiveSummary.body,
    },
  ];

  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.title = "Monthly managed services";
  quote.sections.sectionA.introText = "Recurring service pricing for business connectivity, support, and managed Wi-Fi oversight.";
  quote.sections.sectionA.perKitRows = [
    {
      id: "ilios-quick-recurring-service",
      rowType: "service",
      description: "Business Starlink managed connectivity",
      quantity: 2,
      unitLabel: "circuits",
      unitPrice: 295,
      monthlyRate: 295,
      totalMonthlyRate: 590,
      sourceLabel: "Ilios sample",
    },
    {
      id: "ilios-quick-support-service",
      rowType: "support",
      description: "Remote monitoring and help desk",
      includedText: ["Device health monitoring", "Remote troubleshooting", "Escalation support"],
      sourceLabel: "Ilios sample",
    },
  ];
  quote.sections.sectionA.computed.monthlyRecurringTotal = 590;

  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.title = "Quoted hardware";
  quote.sections.sectionB.introText = "One-time network equipment and install materials for the clinic refresh.";
  quote.sections.sectionB.lineItems = [
    {
      id: "ilios-quick-firewall",
      sourceType: "custom",
      itemName: "Unifi Dream Machine SE",
      itemCategory: "Gateway / Switching",
      quantity: 1,
      unitPrice: 899,
      totalPrice: 899,
      description: "Gateway, controller, and PoE switching for the primary clinic MDF.",
      sourceLabel: "Ilios sample",
    },
    {
      id: "ilios-quick-access-points",
      sourceType: "custom",
      itemName: "Unifi U7 Pro Access Point",
      itemCategory: "Wireless",
      quantity: 4,
      unitPrice: 289,
      totalPrice: 1156,
      description: "Wi-Fi access points for exam rooms, waiting area, and staff work zones.",
      sourceLabel: "Ilios sample",
    },
    {
      id: "ilios-quick-materials",
      sourceType: "custom",
      itemName: "Structured cabling and materials allowance",
      itemCategory: "Install Materials",
      quantity: 1,
      unitPrice: 1450,
      totalPrice: 1450,
      description: "Cable drops, patch materials, labeling, and site consumables.",
      sourceLabel: "Ilios sample",
    },
  ];
  quote.sections.sectionB.computed.equipmentTotal = 3505;

  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.title = "Installation and commissioning";
  quote.sections.sectionC.introText = "Labor and onsite services required to finish the refresh.";
  quote.sections.sectionC.lineItems = [
    {
      id: "ilios-quick-install",
      sourceType: "custom",
      description: "Installation, programming, and user handoff",
      quantity: 1,
      unitPrice: 2400,
      totalPrice: 2400,
      pricingStage: "budgetary",
      serviceCategory: "installation",
      sourceLabel: "Ilios sample",
    },
  ];
  quote.sections.sectionC.computed.serviceTotal = 2400;

  quote.commercial.costs.oneTimeEquipmentCost = 2450;
  quote.commercial.costs.oneTimeLaborCost = 1400;
  quote.commercial.costs.oneTimeOtherCost = 350;
  quote.commercial.costs.recurringVendorCost = 310;
  quote.commercial.costs.recurringSupportCost = 85;
  quote.commercial.costs.recurringOtherCost = 0;
  quote.commercial.meta.optionLabel = "Clinic refresh";
  quote.commercial.meta.comparisonGroup = "Northwind clinic";
  quote.commercial.meta.notes = "Sample Ilios quick quote showing a simple recurring + hardware + install motion.";

  quote.terms.selectedPackageKey = "integration_only";
  quote.warranty.manufacturerReference = "Quoted networking, Wi-Fi, and infrastructure hardware follows the applicable manufacturer warranty in effect at shipment.";
  quote.warranty.coverageNote = "Ilios installation workmanship and third-party manufacturer coverage should be reviewed together during final approval.";

  return quote;
}

function buildMajorProjectComponents(): MajorProjectComponent[] {
  return [
    {
      id: "ilios-major-core-1",
      internalName: "Unifi Dream Machine SE Integrated 8-port PoE Switch 128 GB P/N UDM-SE",
      customerFacingLabel: "Core network appliance",
      vendor: "Ilios Integrators",
      manufacturer: "Ubiquiti",
      category: "Network core",
      lineType: "hardware",
      quantity: 2,
      unit: "ea",
      customerUnitPrice: 1692.31,
      customerExtendedPrice: 3384.62,
      vendorUnitCost: 1100,
      vendorExtendedCost: 2200,
      schedule: "one_time",
      costBasis: "vendor_quote",
      resaleBasis: "cost_plus",
      passThrough: false,
      notes: "Seeded at standard 35% margin from vendor cost.",
    },
    {
      id: "ilios-major-ap-1",
      internalName: "Unifi U7 Pro Access Point",
      customerFacingLabel: "Enterprise Wi-Fi access point",
      vendor: "Ilios Integrators",
      manufacturer: "Ubiquiti",
      category: "Wireless",
      lineType: "hardware",
      quantity: 12,
      unit: "ea",
      customerUnitPrice: 290.77,
      customerExtendedPrice: 3489.24,
      vendorUnitCost: 189,
      vendorExtendedCost: 2268,
      schedule: "one_time",
      costBasis: "vendor_quote",
      resaleBasis: "cost_plus",
      passThrough: false,
      notes: "Mounted across admin offices, control room, and field buildings.",
    },
    {
      id: "ilios-major-camera-1",
      internalName: "Unifi G5 Bullet Camera",
      customerFacingLabel: "Exterior security camera",
      vendor: "Ilios Integrators",
      manufacturer: "Ubiquiti",
      category: "Security",
      lineType: "hardware",
      quantity: 10,
      unit: "ea",
      customerUnitPrice: 198.46,
      customerExtendedPrice: 1984.6,
      vendorUnitCost: 129,
      vendorExtendedCost: 1290,
      schedule: "one_time",
      costBasis: "vendor_quote",
      resaleBasis: "cost_plus",
      passThrough: false,
      notes: "Exterior coverage for gates, storage yard, and equipment staging areas.",
    },
    {
      id: "ilios-major-materials-1",
      internalName: "Structured cabling materials and pathway allowance",
      customerFacingLabel: "Cabling and materials allowance",
      vendor: "Ilios Integrators",
      manufacturer: "Multiple",
      category: "Materials",
      lineType: "hardware",
      quantity: 1,
      unit: "lot",
      customerUnitPrice: 4923.08,
      customerExtendedPrice: 4923.08,
      vendorUnitCost: 3200,
      vendorExtendedCost: 3200,
      schedule: "one_time",
      costBasis: "estimate",
      resaleBasis: "cost_plus",
      passThrough: false,
      notes: "Cable, pathway hardware, labeling, and field consumables for four facilities.",
    },
    {
      id: "ilios-major-install-1",
      internalName: "Installation, programming, and turnover labor",
      customerFacingLabel: "Installation and commissioning",
      vendor: "Ilios Integrators",
      manufacturer: "Internal labor",
      category: "Labor",
      lineType: "installation",
      quantity: 1,
      unit: "lot",
      customerUnitPrice: 11076.92,
      customerExtendedPrice: 11076.92,
      vendorUnitCost: 7200,
      vendorExtendedCost: 7200,
      schedule: "one_time",
      costBasis: "internal_labor",
      resaleBasis: "cost_plus",
      passThrough: false,
      notes: "Field installation, programming, testing, labeling, and customer turnover.",
    },
    {
      id: "ilios-major-support-1",
      internalName: "Managed monitoring and remote support",
      customerFacingLabel: "Managed monitoring and support",
      vendor: "Ilios Integrators",
      manufacturer: "Internal service",
      category: "Managed support",
      lineType: "support",
      quantity: 1,
      unit: "month",
      customerUnitPrice: 692.31,
      customerExtendedPrice: 692.31,
      vendorUnitCost: 450,
      vendorExtendedCost: 450,
      schedule: "recurring",
      costBasis: "internal_labor",
      resaleBasis: "cost_plus",
      passThrough: false,
      notes: "Monthly remote support, admin, and health monitoring.",
    },
  ];
}

function buildIliosMajorProjectQuote(): QuoteRecord {
  const quote = createBlankQuoteRecord();
  const owner = getIliosOwner("vanderson@ilios-integrators.com");
  const components = buildMajorProjectComponents();
  const option: MajorProjectOption = {
    id: "ilios-major-option-1",
    label: "Base deployment",
    description: "Four-site security and network refresh with direct component output.",
    siteCount: 4,
    monthlyRatePerSite: 173.08,
    hardwarePerSite: 3445.39,
    installPerSite: 2769.23,
    otherOneTimePerSite: 0,
    vendorRecurringPerSite: 112.5,
    supportRecurringPerSite: 60.58,
    otherRecurringPerSite: 0,
    components,
    bundles: [],
    customerQuoteLines: [],
  };

  setCustomer(quote, {
    profileId: ILIOS_SAMPLE_MAJOR_CUSTOMER_PROFILE_ID,
    companyName: "Harris County Secure Facilities",
    shortName: "Harris County",
    contactName: "James Spencer",
    contactEmail: "james.spencer@harriscountytx.gov",
    contactPhone: "832-555-0187",
    billToLines: ["1001 Preston Street", "Houston, TX 77002", "United States"],
    shipToLines: ["5300 Allen-Genoa Road", "Houston, TX 77048", "United States"],
    serviceLines: ["5300 Allen-Genoa Road", "Houston, TX 77048", "United States"],
    billToAttention: "Accounts Payable",
    shipToAttention: "James Spencer",
    shippingSameAsBillTo: false,
  });
  setOwner(quote, owner);

  quote.metadata.proposalNumber = "ILM-2001";
  quote.metadata.proposalDate = "May 20, 2026";
  quote.metadata.documentTitle = "County Facilities Security Refresh";
  quote.metadata.documentSubtitle = "Mapped-builder sample for a four-site rollout";
  quote.metadata.customerProvider = "Starlink";
  quote.metadata.workflowMode = "major_project";
  quote.metadata.status = "in_review";
  quote.metadata.lastTouchedAt = "2026-05-20T09:45:00.000Z";
  quote.metadata.opportunityName = "County facilities refresh";
  quote.documentation.proposalNumberLabel = "ILM-2001";
  quote.documentation.proposalDateLabel = "May 20, 2026";
  quote.documentation.proposalTitle = "County Facilities Security Refresh";
  quote.internal.quoteId = ILIOS_SAMPLE_MAJOR_PROPOSAL_ID;
  quote.internal.savedProposalId = ILIOS_SAMPLE_MAJOR_PROPOSAL_ID;
  quote.internal.quoteStatus = "in_review";

  quote.executiveSummary.enabled = true;
  quote.executiveSummary.customerContext = "Prepared for Harris County Secure Facilities to review a four-site security and network refresh using the Ilios mapped builder.";
  quote.executiveSummary.body = "Use this sample to show the structured Major Project workflow: review components, confirm seeded margin logic, and flow approved items directly into the proposal without forcing extra bundles or customer quote lines.";
  quote.executiveSummary.paragraphs = [quote.executiveSummary.customerContext, quote.executiveSummary.body];

  quote.majorProject.enabled = true;
  quote.majorProject.builderMode = "advanced";
  quote.majorProject.summary = {
    ...quote.majorProject.summary,
    projectName: "Harris County facilities security refresh",
    projectDescription: "Four-site security, Wi-Fi, and network-core refresh using direct component output.",
    assumptions: "Components are already customer-ready. Use bundles only if the customer wants packaged presentation layers.",
  };
  quote.majorProject.commercial = {
    ...quote.majorProject.commercial,
    termMonths: 36,
    serviceMix: "managed-network",
    siteCount: 4,
    activeSites: 4,
    monthlyRatePerSite: 173.08,
    oneTimeHardwarePerSite: 3445.39,
    oneTimeInstallPerSite: 2769.23,
    oneTimeOtherPerSite: 0,
    recurringVendorPerSite: 112.5,
    recurringSupportPerSite: 60.58,
    recurringOtherPerSite: 0,
    includeHardware: true,
    includeInstallation: true,
    includeOptionalServices: false,
    equipmentLabel: "Security and network hardware",
    installationLabel: "Installation and commissioning",
    recurringLabel: "Managed monitoring and support",
    optionalServicesLabel: "Optional services",
    optionalServicesAmount: 0,
  };
  quote.majorProject.options = [option];
  quote.majorProject.activeOptionId = option.id;

  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.title = "Recurring managed services";
  quote.sections.sectionA.introText = "Monthly support and monitoring for the refreshed county facilities footprint.";
  quote.sections.sectionA.poolRows = [
    {
      id: "ilios-major-support-row",
      rowType: "service",
      description: "Managed monitoring and remote support",
      quantity: 1,
      unitLabel: "program",
      unitPrice: 692.31,
      monthlyRate: 692.31,
      totalMonthlyRate: 692.31,
      sourceLabel: "Ilios sample",
    },
  ];
  quote.sections.sectionA.computed.monthlyRecurringTotal = 692.31;

  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.title = "Hardware and materials";
  quote.sections.sectionB.introText = "One-time hardware and materials generated from the mapped component list.";
  quote.sections.sectionB.lineItems = [
    {
      id: "ilios-major-core-row",
      sourceType: "custom",
      itemName: "Core network appliances",
      itemCategory: "Network core",
      quantity: 2,
      unitPrice: 1692.31,
      totalPrice: 3384.62,
      description: "Unifi Dream Machine SE appliances for two primary control locations.",
      sourceLabel: "Ilios sample",
    },
    {
      id: "ilios-major-ap-row",
      sourceType: "custom",
      itemName: "Enterprise Wi-Fi access points",
      itemCategory: "Wireless",
      quantity: 12,
      unitPrice: 290.77,
      totalPrice: 3489.24,
      description: "U7 Pro access points across offices and operator spaces.",
      sourceLabel: "Ilios sample",
    },
    {
      id: "ilios-major-camera-row",
      sourceType: "custom",
      itemName: "Exterior security cameras",
      itemCategory: "Security",
      quantity: 10,
      unitPrice: 198.46,
      totalPrice: 1984.6,
      description: "Perimeter and gate coverage for four facilities.",
      sourceLabel: "Ilios sample",
    },
    {
      id: "ilios-major-materials-row",
      sourceType: "custom",
      itemName: "Cabling and materials allowance",
      itemCategory: "Install Materials",
      quantity: 1,
      unitPrice: 4923.08,
      totalPrice: 4923.08,
      description: "Cabling, labeling, pathway hardware, and field consumables.",
      sourceLabel: "Ilios sample",
    },
  ];
  quote.sections.sectionB.computed.equipmentTotal = 13781.54;

  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.title = "Installation and professional services";
  quote.sections.sectionC.introText = "One-time labor to install, program, and hand off the county refresh.";
  quote.sections.sectionC.lineItems = [
    {
      id: "ilios-major-install-row",
      sourceType: "custom",
      description: "Installation, programming, and turnover labor",
      quantity: 1,
      unitPrice: 11076.92,
      totalPrice: 11076.92,
      pricingStage: "budgetary",
      serviceCategory: "installation",
      sourceLabel: "Ilios sample",
    },
  ];
  quote.sections.sectionC.computed.serviceTotal = 11076.92;

  quote.commercial.costs.oneTimeEquipmentCost = 8958;
  quote.commercial.costs.oneTimeLaborCost = 7200;
  quote.commercial.costs.oneTimeOtherCost = 0;
  quote.commercial.costs.recurringVendorCost = 450;
  quote.commercial.costs.recurringSupportCost = 0;
  quote.commercial.costs.recurringOtherCost = 0;
  quote.commercial.meta.optionLabel = "Four-site base";
  quote.commercial.meta.comparisonGroup = "County facilities";
  quote.commercial.meta.notes = "Sample Ilios major project showing a mapped-builder direct-output workflow.";

  quote.terms.selectedPackageKey = "integration_only";
  quote.warranty.manufacturerReference = "Quoted security, Wi-Fi, and core network hardware follows the applicable manufacturer warranty in effect at shipment.";
  quote.warranty.coverageNote = "Customer-facing pricing already reflects installed-system assumptions and should be reviewed with final site notes before release.";

  return quote;
}

function buildSampleProposal(
  quote: QuoteRecord,
  owner: ProposalOwner,
  createdAt: string,
  updatedAt: string,
  branchLabel: string,
): SavedProposalRecord {
  const proposal = createProposalFromQuote({ quote, owner, currentUser: owner });

  return {
    ...proposal,
    createdAt,
    updatedAt,
    status: quote.metadata.status,
    stageLabel: statusToStageLabel(quote.metadata.status),
    workspace: {
      ...proposal.workspace,
      accountSegment: "Ilios Sample",
      branchLabel,
    },
    activity: [
      {
        id: `activity_${proposal.id}_created`,
        type: "created",
        message: `${quote.metadata.documentTitle} sample created for the Ilios workspace`,
        at: createdAt,
        by: { id: owner.id, name: owner.name },
      },
      {
        id: `activity_${proposal.id}_updated`,
        type: quote.metadata.status === "in_review" ? "status_changed" : "updated",
        message: quote.metadata.status === "in_review"
          ? "Sample moved into review for team walkthrough"
          : "Sample is ready for team training and edits",
        at: updatedAt,
        by: { id: owner.id, name: owner.name },
      },
    ],
  };
}

export function getIliosSampleCustomerProfiles(): SavedCustomerProfile[] {
  const quickOwner = getIliosOwner("saulo@ilios-integrators.com");
  const majorOwner = getIliosOwner("vanderson@ilios-integrators.com");

  return [
    {
      id: ILIOS_SAMPLE_QUICK_CUSTOMER_PROFILE_ID,
      companyName: "Northwind Health Partners",
      customerShortName: "Northwind",
      primaryAddress: {
        companyName: "Northwind Health Partners",
        attention: "Maria Ellison",
        lines: ["1240 Medical Plaza Drive", "Houston, TX 77030", "United States"],
      },
      billingAddress: {
        companyName: "Northwind Health Partners",
        attention: "Maria Ellison",
        lines: ["1240 Medical Plaza Drive", "Houston, TX 77030", "United States"],
      },
      shippingAddress: {
        companyName: "Northwind Health Partners",
        attention: "Maria Ellison",
        lines: ["1240 Medical Plaza Drive", "Houston, TX 77030", "United States"],
      },
      shippingSameAsBillTo: true,
      serviceAddressLines: ["1240 Medical Plaza Drive", "Houston, TX 77030", "United States"],
      mainContactName: "Maria Ellison",
      mainContactEmail: "maria.ellison@northwindhealth.com",
      mainContactPhone: "713-555-0114",
      defaultOwnerUserId: quickOwner.id,
      defaultOwnerName: quickOwner.name,
      createdAt: "2026-05-20T09:00:00.000Z",
      updatedAt: "2026-05-20T09:00:00.000Z",
    },
    {
      id: ILIOS_SAMPLE_MAJOR_CUSTOMER_PROFILE_ID,
      companyName: "Harris County Secure Facilities",
      customerShortName: "Harris County",
      primaryAddress: {
        companyName: "Harris County Secure Facilities",
        attention: "James Spencer",
        lines: ["5300 Allen-Genoa Road", "Houston, TX 77048", "United States"],
      },
      billingAddress: {
        companyName: "Harris County Secure Facilities",
        attention: "Accounts Payable",
        lines: ["1001 Preston Street", "Houston, TX 77002", "United States"],
      },
      shippingAddress: {
        companyName: "Harris County Secure Facilities",
        attention: "James Spencer",
        lines: ["5300 Allen-Genoa Road", "Houston, TX 77048", "United States"],
      },
      shippingSameAsBillTo: false,
      serviceAddressLines: ["5300 Allen-Genoa Road", "Houston, TX 77048", "United States"],
      mainContactName: "James Spencer",
      mainContactEmail: "james.spencer@harriscountytx.gov",
      mainContactPhone: "832-555-0187",
      defaultOwnerUserId: majorOwner.id,
      defaultOwnerName: majorOwner.name,
      createdAt: "2026-05-20T09:20:00.000Z",
      updatedAt: "2026-05-20T09:20:00.000Z",
    },
  ];
}

export function getIliosSampleProposals(): SavedProposalRecord[] {
  const quickOwner = getIliosOwner("saulo@ilios-integrators.com");
  const majorOwner = getIliosOwner("vanderson@ilios-integrators.com");

  return [
    buildSampleProposal(
      buildIliosQuickQuote(),
      quickOwner,
      "2026-05-20T09:00:00.000Z",
      "2026-05-20T09:15:00.000Z",
      "Ilios Quick Quote Sample",
    ),
    buildSampleProposal(
      buildIliosMajorProjectQuote(),
      majorOwner,
      "2026-05-20T09:20:00.000Z",
      "2026-05-20T09:45:00.000Z",
      "Ilios Major Project Sample",
    ),
  ];
}

export function ensureIliosSampleProfiles(profiles: SavedCustomerProfile[]) {
  const sampleProfiles = getIliosSampleCustomerProfiles();
  const sampleIds = new Set(sampleProfiles.map((profile) => profile.id));
  const remaining = profiles.filter((profile) => !sampleIds.has(profile.id));
  return [...sampleProfiles, ...remaining].sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export function ensureIliosSampleProposalStore(store: ProposalStoreData): ProposalStoreData {
  const sampleProposals = getIliosSampleProposals();
  const sampleIds = new Set(sampleProposals.map((proposal) => proposal.id));
  const remaining = store.proposals.filter((proposal) => !sampleIds.has(proposal.id));
  const nextUsers = mockUsers.filter((user) => !store.users.some((entry) => entry.id === user.id));

  return {
    ...store,
    users: [...store.users, ...nextUsers],
    proposals: [...sampleProposals, ...remaining],
  };
}

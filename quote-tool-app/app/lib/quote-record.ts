import type { QuoteIntegrationState } from "@/app/lib/crm";

export type CurrencyCode = "USD" | "CAD" | "EUR" | string;
export type QuoteStatus = "draft" | "in_review" | "sent";
export type SectionAMode = "pool" | "per_kit";
export type QuoteType = "purchase" | "lease";
export type QuoteWorkflowMode = "quick_quote" | "major_project";

export type QuoteTextBlock = {
  enabled: boolean;
  heading?: string;
  customerContext?: string;
  body?: string;
  paragraphs: string[];
};

export type QuoteCustomFieldVisibility = "customer" | "internal";

export type QuoteCustomField = {
  id: string;
  label: string;
  value: string;
  visibility: QuoteCustomFieldVisibility;
};

export type AddressBlock = {
  companyName?: string;
  attention?: string;
  lines: string[];
};

export type QuoteParty = {
  name: string;
  logoText?: string;
  logoDataUrl?: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  addressLines: string[];
};

export type QuoteRevision = {
  version: string;
  changeDetails: string;
};

export type QuoteSectionState = {
  enabled: boolean;
  allowLineAdd: boolean;
  allowLineRemove: boolean;
  allowReorder: boolean;
  builderLabel: string;
};

export type PoolPricingRow = {
  id: string;
  rowType: "service" | "overage" | "terminal_fee" | "support";
  description: string;
  quantity?: number | null;
  unitLabel?: string | null;
  unitPrice?: number | null;
  monthlyRate?: number | null;
  totalMonthlyRate?: number | null;
  includedText?: string[];
  sourceLabel?: string;
};

export type PerKitPricingRow = {
  id: string;
  rowType: "service" | "terminal_fee" | "support";
  description: string;
  quantity?: number | null;
  unitLabel?: string | null;
  unitPrice?: number | null;
  monthlyRate?: number | null;
  totalMonthlyRate?: number | null;
  includedText?: string[];
  sourceLabel?: string;
};

export type EquipmentPricingRow = {
  id: string;
  sourceType: "standard" | "custom";
  itemName: string;
  itemCategory?: string;
  terminalType?: string;
  partNumber?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  description?: string;
  sourceLabel?: string;
};

export type ServicePricingRow = {
  id: string;
  sourceType: "standard" | "custom";
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unitLabel?: string;
  notes?: string;
  sourceLabel?: string;
  pricingStage?: "budgetary" | "final";
  serviceCategory?: "site_inspection" | "installation" | "custom";
};

export type QuoteMetadata = {
  proposalNumber: string;
  proposalDate: string;
  revisionVersion: string;
  documentTitle: string;
  documentSubtitle: string;
  customerShortName: string;
  customerProvider: "Starlink" | "UniSIM" | "T-Mobile";
  currencyCode: CurrencyCode;
  status: QuoteStatus;
  quoteType: QuoteType;
  workflowMode?: QuoteWorkflowMode;
  leaseTermMonths?: 12 | 24 | 36;
  leaseMarginPercent?: number;
  hasActiveDataAgreement?: boolean;
  ownerUserId?: string;
  ownerName?: string;
  accountId?: string;
  accountName?: string;
  lastTouchedAt?: string;
};

export type QuoteInternalMeta = {
  quoteId: string;
  quoteStatus: QuoteStatus;
  internalNotes?: string;
  crmOwnerLabel?: string;
  crmSyncReady?: boolean;
  savedProposalId?: string;
  savedCustomerProfileId?: string;
  workspaceOwnerId?: string;
  workspaceOwnerName?: string;
};

export type QuoteCommercialCostInputs = {
  oneTimeEquipmentCost: number;
  oneTimeLaborCost: number;
  oneTimeOtherCost: number;
  recurringVendorCost: number;
  recurringSupportCost: number;
  recurringOtherCost: number;
};

export type QuoteCommercialMeta = {
  optionLabel: string;
  comparisonGroup?: string;
  notes?: string;
};

export type QuoteCommercialState = {
  internalOnly: true;
  phase: "margin-foundation";
  meta: QuoteCommercialMeta;
  costs: QuoteCommercialCostInputs;
};

export type QuoteDocumentationDetails = {
  proposalTitle: string;
  proposalDateLabel: string;
  proposalNumberLabel: string;
  customerAddressHeading: string;
  inetAddressHeading: string;
  preparedByLabel?: string;
  inetSalesHeading?: string;
  billToHeading?: string;
  shipToHeading?: string;
};

export type QuoteApprovalDetails = {
  heading: string;
  signatureLabel: string;
  customerNameLabel: string;
  dateLabel: string;
  approvalNote?: string;
};

export type QuoteTermsSection = {
  generalStarlinkServiceTermsTitle: string;
  generalStarlinkServiceTerms: string[];
  pricingTermsTitle: string;
  pricingTerms: string[];
};

export type QuoteSectionA = QuoteSectionState & {
  mode: SectionAMode;
  title: string;
  introText?: string;
  explanatoryParagraphs?: string[];
  termMonths: number;
  poolRows: PoolPricingRow[];
  perKitRows: PerKitPricingRow[];
  computed: {
    terminalAccessFeeDefault: number;
    block50Default: number;
    block500Default: number;
    monthlyRecurringTotal: number;
  };
};

export type QuoteSectionB = QuoteSectionState & {
  title: string;
  introText?: string;
  lineItems: EquipmentPricingRow[];
  computed: {
    equipmentTotal: number;
  };
};

export type QuoteSectionC = QuoteSectionState & {
  title: string;
  introText?: string;
  lineItems: ServicePricingRow[];
  computed: {
    serviceTotal: number;
  };
};

export type QuoteDocumentRules = {
  preserveTemplateLook: true;
  keepRowsTogether: true;
  keepSectionHeadingWithContent: true;
  preventRowSplitAcrossPages: true;
  avoidOrphanedSectionHeaders: true;
};

export type MajorProjectLineType =
  | "hardware"
  | "software"
  | "subscription"
  | "installation"
  | "service"
  | "support"
  | "managed_service"
  | "optional_service"
  | "internal_labor"
  | "shipping"
  | "tax"
  | "other";

export type MajorProjectRevenueSchedule = "one_time" | "recurring";
export type MajorProjectCostBasis = "vendor_quote" | "msrp" | "estimate" | "internal_labor" | "blended" | "other";
export type MajorProjectResaleBasis = "fixed_fee" | "cost_plus" | "target_margin" | "pass_through" | "bundle" | "other";

export type MajorProjectComponent = {
  id: string;
  internalName: string;
  customerFacingLabel?: string;
  vendor: string;
  manufacturer?: string;
  category: string;
  lineType: MajorProjectLineType;
  quantity: number;
  unit: string;
  customerUnitPrice: number;
  customerExtendedPrice: number;
  vendorUnitCost: number;
  vendorExtendedCost: number;
  schedule: MajorProjectRevenueSchedule;
  costBasis: MajorProjectCostBasis;
  resaleBasis: MajorProjectResaleBasis;
  laborBucket?: string;
  serviceBucket?: string;
  passThrough: boolean;
  bundleAssignmentId?: string;
  notes?: string;
};

export type MajorProjectBundle = {
  id: string;
  internalName: string;
  customerFacingLabel: string;
  description?: string;
  componentIds: string[];
  includedCostComponentIds?: string[];
  includedRevenueComponentIds?: string[];
  schedule?: MajorProjectRevenueSchedule | "mixed";
  category?: string;
};

export type MajorProjectCustomerQuoteLine = {
  id: string;
  label: string;
  description?: string;
  bundleIds: string[];
  includedCostComponentIds?: string[];
  includedRevenueComponentIds?: string[];
  schedule?: MajorProjectRevenueSchedule | "mixed";
  presentationCategory?: "recurring" | "hardware" | "services" | "other";
};

export type MajorProjectVendorSummary = {
  vendor: string;
  manufacturer?: string;
  oneTimeRevenue: number;
  recurringRevenue: number;
  oneTimeCost: number;
  recurringCost: number;
};

export type MajorProjectOption = {
  id: string;
  label: string;
  description?: string;
  siteCount: number;
  monthlyRatePerSite: number;
  hardwarePerSite: number;
  installPerSite: number;
  otherOneTimePerSite: number;
  vendorRecurringPerSite: number;
  supportRecurringPerSite: number;
  otherRecurringPerSite: number;
  components?: MajorProjectComponent[];
  bundles?: MajorProjectBundle[];
  customerQuoteLines?: MajorProjectCustomerQuoteLine[];
  vendorSummary?: MajorProjectVendorSummary[];
};

export type MajorProjectSummary = {
  projectName: string;
  projectDescription: string;
  versionLabel: string;
  paymentTerms: string;
  billingStart: string;
  assumptions: string;
};

export type MajorProjectCommercialInputs = {
  termMonths: number;
  serviceMix: "managed-network" | "starlink-pool" | "starlink-per-site" | "hybrid";
  siteCount: number;
  activeSites: number;
  monthlyRatePerSite: number;
  oneTimeHardwarePerSite: number;
  oneTimeInstallPerSite: number;
  oneTimeOtherPerSite: number;
  recurringVendorPerSite: number;
  recurringSupportPerSite: number;
  recurringOtherPerSite: number;
  includeHardware: boolean;
  includeInstallation: boolean;
  includeOptionalServices: boolean;
  installationLabel: string;
  equipmentLabel: string;
  recurringLabel: string;
  optionalServicesLabel: string;
  optionalServicesAmount: number;
  overageRatePerGb: number;
  terminalFeePerSite: number;
};

export type MajorProjectState = {
  enabled: boolean;
  summary: MajorProjectSummary;
  commercial: MajorProjectCommercialInputs;
  options: MajorProjectOption[];
  activeOptionId: string;
};

export type QuoteRecord = {
  metadata: QuoteMetadata;
  commercial: QuoteCommercialState;
  majorProject: MajorProjectState;
  documentation: QuoteDocumentationDetails;
  approval: QuoteApprovalDetails;
  terms: QuoteTermsSection;
  customer: QuoteParty;
  inet: QuoteParty;
  billTo: AddressBlock;
  shipTo: AddressBlock;
  shippingSameAsBillTo: boolean;
  executiveSummary: QuoteTextBlock;
  customFields?: QuoteCustomField[];
  sections: {
    sectionA: QuoteSectionA;
    sectionB: QuoteSectionB;
    sectionC: QuoteSectionC;
  };
  revisionHistory: QuoteRevision[];
  internal: QuoteInternalMeta;
  integrations: QuoteIntegrationState;
  documentRules: QuoteDocumentRules;
};

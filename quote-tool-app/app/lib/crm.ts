export type CrmProvider = "salesforce" | "hubspot";
export type CrmConnectionStatus = "disconnected" | "configured" | "connected" | "error";
export type CrmSyncDirection = "push" | "pull" | "bidirectional";

export type QuoteCrmEntityType = "account" | "contact" | "deal" | "opportunity" | "quote" | "line_item";

export type CrmExternalReference = {
  provider: CrmProvider;
  entityType: QuoteCrmEntityType;
  externalId: string;
  externalLabel?: string;
  externalUrl?: string;
  lastSyncedAt?: string;
};

export type QuoteCrmReferences = {
  account?: CrmExternalReference;
  contact?: CrmExternalReference;
  deal?: CrmExternalReference;
  quote?: CrmExternalReference;
  lineItems?: CrmExternalReference[];
};

export type CrmFieldMapping = {
  provider: CrmProvider;
  internalField: string;
  externalField: string;
  direction: CrmSyncDirection;
  notes?: string;
};

export type CrmSyncPreference = {
  provider: CrmProvider;
  enabled: boolean;
  defaultDirection: CrmSyncDirection;
  autoCreateAccount: boolean;
  autoCreateDeal: boolean;
  autoAttachQuotePdf: boolean;
};

export type SalesforceConnectorConfig = {
  instanceUrl?: string;
  environment: "production" | "sandbox";
  clientId?: string;
  connectedAppLabel?: string;
  quoteObjectApiName?: string;
  opportunityObjectApiName?: string;
};

export type HubSpotConnectorConfig = {
  portalId?: string;
  appId?: string;
  privateAppLabel?: string;
  quoteObjectType?: string;
  dealObjectType?: string;
};

export type CrmConnectorRecord = {
  provider: CrmProvider;
  label: string;
  enabled: boolean;
  status: CrmConnectionStatus;
  description: string;
  lastValidatedAt?: string;
  syncPreference: CrmSyncPreference;
  fieldMappings: CrmFieldMapping[];
  config: SalesforceConnectorConfig | HubSpotConnectorConfig;
};

export type QuoteIntegrationState = {
  connectors: CrmConnectorRecord[];
  quoteReferences: QuoteCrmReferences;
  lastSyncSummary?: string;
};

export const defaultCrmFieldMappings: CrmFieldMapping[] = [
  {
    provider: "salesforce",
    internalField: "customer.name",
    externalField: "Account.Name",
    direction: "bidirectional",
    notes: "Default account name mapping",
  },
  {
    provider: "salesforce",
    internalField: "customer.contactEmail",
    externalField: "Contact.Email",
    direction: "bidirectional",
  },
  {
    provider: "salesforce",
    internalField: "metadata.proposalNumber",
    externalField: "Quote.Proposal_Number__c",
    direction: "push",
  },
  {
    provider: "hubspot",
    internalField: "customer.name",
    externalField: "company.name",
    direction: "bidirectional",
  },
  {
    provider: "hubspot",
    internalField: "customer.contactEmail",
    externalField: "contact.email",
    direction: "bidirectional",
  },
  {
    provider: "hubspot",
    internalField: "metadata.proposalNumber",
    externalField: "quote.hs_title",
    direction: "push",
  },
];

export function createDefaultIntegrationState(): QuoteIntegrationState {
  return {
    connectors: [
      {
        provider: "salesforce",
        label: "Salesforce",
        enabled: false,
        status: "disconnected",
        description: "Optional connector for syncing accounts, contacts, opportunities, and quote references.",
        syncPreference: {
          provider: "salesforce",
          enabled: false,
          defaultDirection: "push",
          autoCreateAccount: false,
          autoCreateDeal: false,
          autoAttachQuotePdf: false,
        },
        fieldMappings: defaultCrmFieldMappings.filter((mapping) => mapping.provider === "salesforce"),
        config: {
          environment: "sandbox",
          instanceUrl: "",
          clientId: "",
          connectedAppLabel: "",
          quoteObjectApiName: "SBQQ__Quote__c",
          opportunityObjectApiName: "Opportunity",
        },
      },
      {
        provider: "hubspot",
        label: "HubSpot",
        enabled: false,
        status: "disconnected",
        description: "Optional connector for syncing companies, contacts, deals, and quote references.",
        syncPreference: {
          provider: "hubspot",
          enabled: false,
          defaultDirection: "push",
          autoCreateAccount: false,
          autoCreateDeal: false,
          autoAttachQuotePdf: false,
        },
        fieldMappings: defaultCrmFieldMappings.filter((mapping) => mapping.provider === "hubspot"),
        config: {
          portalId: "",
          appId: "",
          privateAppLabel: "",
          quoteObjectType: "quotes",
          dealObjectType: "deals",
        },
      },
    ],
    quoteReferences: {},
    lastSyncSummary: "No CRM sync has run yet.",
  };
}

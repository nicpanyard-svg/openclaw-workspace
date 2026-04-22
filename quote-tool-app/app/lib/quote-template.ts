import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createBlankQuoteRecord(base: QuoteRecord = sampleQuoteRecord): QuoteRecord {
  const quote = deepClone(base);
  const now = new Date();
  const stamp = now.getTime();
  const proposalDate = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  quote.metadata.proposalNumber = `RCT-DRAFT-${stamp}`;
  quote.metadata.proposalDate = proposalDate;
  quote.metadata.revisionVersion = "1.0";
  quote.metadata.customerShortName = "";
  quote.metadata.accountId = undefined;
  quote.metadata.accountName = undefined;
  quote.metadata.status = "draft";
  quote.metadata.lastTouchedAt = now.toISOString();

  quote.documentation.proposalTitle = quote.metadata.documentTitle;
  quote.documentation.proposalDateLabel = proposalDate;
  quote.documentation.proposalNumberLabel = quote.metadata.proposalNumber;

  quote.customer.name = "";
  quote.customer.logoText = "";
  quote.customer.logoDataUrl = undefined;
  quote.customer.contactName = "";
  quote.customer.contactPhone = "";
  quote.customer.contactEmail = "";
  quote.customer.addressLines = [];

  quote.billTo = {
    companyName: "",
    attention: "",
    lines: [],
  };
  quote.shipTo = {
    companyName: "",
    attention: "",
    lines: [],
  };
  quote.shippingSameAsBillTo = true;

  quote.executiveSummary.enabled = false;
  quote.executiveSummary.customerContext = "";
  quote.executiveSummary.body = "";
  quote.executiveSummary.paragraphs = [];

  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.poolRows = [];
  quote.sections.sectionA.perKitRows = [];
  quote.sections.sectionA.explanatoryParagraphs = [];
  quote.sections.sectionA.computed.monthlyRecurringTotal = 0;
  quote.sections.sectionB.enabled = false;
  quote.sections.sectionB.lineItems = [];
  quote.sections.sectionB.computed.equipmentTotal = 0;

  quote.sections.sectionC.enabled = false;
  quote.sections.sectionC.lineItems = [];
  quote.sections.sectionC.computed.serviceTotal = 0;

  quote.customFields = [];

  quote.revisionHistory = [
    {
      version: "1.0",
      changeDetails: "Clean draft started from template.",
    },
  ];

  quote.internal.quoteId = `quote_${stamp}`;
  quote.internal.quoteStatus = "draft";
  quote.internal.internalNotes = "";
  quote.internal.crmSyncReady = false;
  quote.internal.savedProposalId = undefined;

  quote.integrations.quoteReferences = {};
  quote.integrations.lastSyncSummary = "New draft started from a clean quote template.";

  return quote;
}

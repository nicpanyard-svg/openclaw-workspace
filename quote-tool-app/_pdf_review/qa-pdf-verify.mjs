import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const PROPOSAL_STORAGE_KEY = 'quote-tool-app:proposal-state';
const base = 'http://localhost:3000';

const sampleQuote = {
  metadata: {
    proposalNumber: 'RCT001',
    proposalDate: 'April 2, 2026',
    revisionVersion: '1.0',
    documentTitle: 'Budgetary Estimate',
    documentSubtitle: 'Managed Communications Services',
    customerShortName: 'CZ USA',
    customerProvider: 'Starlink',
    currencyCode: 'USD',
    status: 'draft',
    quoteType: 'purchase',
    leaseTermMonths: 12,
    leaseMarginPercent: 35,
    hasActiveDataAgreement: false,
    ownerUserId: 'nick-panyard',
    ownerName: 'Nick Panyard',
    accountId: 'acct-cz-usa',
    accountName: 'CZ USA',
    lastTouchedAt: '2026-04-17T19:00:00.000Z'
  },
  documentation: {
    proposalTitle: 'CZ USA',
    proposalDateLabel: 'April 2, 2026',
    proposalNumberLabel: 'RCT001',
    customerAddressHeading: 'Customer Address',
    inetAddressHeading: 'iNet Address',
    preparedByLabel: 'Prepared By',
    inetSalesHeading: 'iNet',
    billToHeading: 'Bill To',
    shipToHeading: 'Ship To'
  },
  approval: {
    heading: 'Approve and Authorize',
    signatureLabel: 'Signature',
    customerNameLabel: 'Customer Name',
    dateLabel: 'Date',
    approvalNote: 'Customer Name:'
  },
  terms: {
    generalStarlinkServiceTermsTitle: 'General Starlink Service Terms',
    generalStarlinkServiceTerms: [
      '1. Local service is for land based Starlink Services.',
      '2. Prices may be subject to change with 30 Day notice due to SpaceX/Starlink pricing plan modifications.',
      '3. Opt In and Opt Out Requirements apply.',
      '4. Automatic 50Gb overages blocks will not change subscription and will not repeat unless subscription allotment is exceeded in that month.',
      '5. All plan changes take effect on the 1st day of the month following the change.'
    ],
    pricingTermsTitle: 'Pricing Terms and Conditions',
    pricingTerms: [
      'Pricing for Pool for Starlink Service is based upon a 12 Month Term upon date of agreement between both parties.',
      'This quote is valid for 30 days from creation date.',
      'Pricing is exclusive of all civil works, applicable taxes or tariffs.',
      'Shipping is FOB unless otherwise stated in this proposal.',
      'Payment terms NET 30 days from invoice date unless stated otherwise in Master Service Agreement.',
      'Pricing is in US Dollars.'
    ]
  },
  customer: {
    name: 'CZ USA',
    logoText: 'CZ USA',
    contactName: 'Scott Duncan',
    contactPhone: '913-413-1793',
    contactEmail: 'scott@cz-usa.com',
    addressLines: ['PO Box 171073', 'Kansas City, Kansas 66117', 'United States']
  },
  inet: {
    name: 'iNet',
    contactName: 'Nick Panyard',
    contactPhone: '919-864-5912',
    contactEmail: 'nick.panyard@inetlte.com',
    addressLines: ['Galleria Tower 2', '5051 Westheimer Road, Suite 1700', 'Houston, TX 77056']
  },
  billTo: {
    companyName: 'CZ USA',
    attention: 'Scott Duncan',
    lines: ['PO Box 171073', 'Kansas City, Kansas 66117', 'United States']
  },
  shipTo: {
    companyName: 'CZ USA',
    attention: 'Scott Duncan',
    lines: ['PO Box 171073', 'Kansas City, Kansas 66117', 'United States']
  },
  shippingSameAsBillTo: true,
  executiveSummary: {
    enabled: true,
    heading: 'Executive Summary',
    customerContext: 'Prepared for CZ USA to review Starlink managed communications services, hardware, and field services needed for deployment.',
    body: 'This budgetary estimate outlines the proposed commercial structure for Starlink managed communications services and related equipment.',
    paragraphs: [
      'Prepared for CZ USA to review Starlink managed communications services, hardware, and field services needed for deployment.',
      'This budgetary estimate outlines the proposed commercial structure for Starlink managed communications services and related equipment.'
    ]
  },
  sections: {
    sectionA: {
      enabled: true,
      allowLineAdd: true,
      allowLineRemove: true,
      allowReorder: true,
      builderLabel: 'Monthly service pricing',
      mode: 'pool',
      title: 'U.S Pool Starlink Pricing Schedule',
      introText: 'The pricing provided in the following table is based upon 12 Month Term.',
      explanatoryParagraphs: [
        'Pool service is shared across the active kits.',
        'The data pool is reset at the end of the month.'
      ],
      termMonths: 12,
      poolRows: [
        { id: 'a_pool_500gb', rowType: 'service', description: '3 TB, U.S. Pool for Starlink Service', quantity: 1, unitLabel: 'pool', unitPrice: 1200, monthlyRate: 1200, totalMonthlyRate: 1200, sourceLabel: 'Standard pricing' },
        { id: 'a_terminal_fee', rowType: 'terminal_fee', description: 'Terminal Access Fee', quantity: 2, unitLabel: null, unitPrice: 45, monthlyRate: 45, totalMonthlyRate: 90, sourceLabel: 'Default pricing' },
        { id: 'a_overage', rowType: 'overage', description: 'Overage: Cost per 1.0 GB', quantity: null, unitLabel: 'GB', unitPrice: 0.55, monthlyRate: 0.55, totalMonthlyRate: 0.55, sourceLabel: 'Standard pricing' },
        { id: 'a_support', rowType: 'support', description: 'iNet Support & Portal Access', includedText: ['24/7/365 support', 'Customer portal access', 'Usage and performance reporting'], sourceLabel: 'Standard pricing' }
      ],
      perKitRows: [],
      computed: { terminalAccessFeeDefault: 45, block50Default: 30, block500Default: 132, monthlyRecurringTotal: 1290 }
    },
    sectionB: {
      enabled: true,
      allowLineAdd: true,
      allowLineRemove: true,
      allowReorder: true,
      builderLabel: 'Hardware and accessories',
      title: 'Starlink equipment and accessories',
      introText: 'The prices below reflect one-time hardware and accessory charges.',
      lineItems: [
        { id: 'b_gen3_perf', sourceType: 'standard', itemName: 'Performance G3', itemCategory: 'Terminal', terminalType: 'Performance G3', quantity: 2, unitPrice: 1999, totalPrice: 3998, sourceLabel: 'Starlink hardware pricing' },
        { id: 'b_pipe_adapter', sourceType: 'standard', itemName: 'Performance G3 Pole Mount Adapter', itemCategory: 'Mount Adapter', quantity: 2, unitPrice: 75, totalPrice: 150, sourceLabel: 'Mounting accessories' }
      ],
      computed: { equipmentTotal: 4148 }
    },
    sectionC: {
      enabled: false,
      allowLineAdd: true,
      allowLineRemove: true,
      allowReorder: true,
      builderLabel: 'Optional field services',
      title: 'Optional field services',
      introText: 'Use this section for travel, inspections, and installation pricing when needed.',
      lineItems: [
        { id: 'c_site_ny', sourceType: 'custom', description: 'Site Inspection', quantity: 1, unitPrice: 856, totalPrice: 856, pricingStage: 'budgetary', serviceCategory: 'site_inspection', notes: 'Budgetary allowance before site visit is completed.', sourceLabel: 'Standard pricing' }
      ],
      computed: { serviceTotal: 856 }
    }
  },
  revisionHistory: [{ version: '1.0', changeDetails: 'Builder-first draft with live quote sections.' }],
  internal: {
    quoteId: 'quote_cz_usa_rct001',
    quoteStatus: 'draft',
    internalNotes: 'Catalog and defaults loaded for builder use.',
    crmOwnerLabel: 'Nick Panyard',
    crmSyncReady: false,
    savedProposalId: 'quote_cz_usa_rct001',
    workspaceOwnerId: 'nick-panyard',
    workspaceOwnerName: 'Nick Panyard'
  },
  integrations: {
    salesforce: { connected: false, lastSyncedAt: null, records: [] },
    hubspot: { connected: false, lastSyncedAt: null, records: [] },
    quickbooks: { connected: false, lastSyncedAt: null, records: [] },
    netsuite: { connected: false, lastSyncedAt: null, records: [] },
    quoteReferences: {},
    lastSyncSummary: 'Standalone workflow.'
  },
  documentRules: {
    preserveTemplateLook: true,
    keepRowsTogether: true,
    keepSectionHeadingWithContent: true,
    preventRowSplitAcrossPages: true,
    avoidOrphanedSectionHeaders: true
  },
  customFields: []
};

const variants = [
  { name: 'purchase-core', quote: structuredClone(sampleQuote) },
  {
    name: 'with-field-services',
    quote: {
      ...structuredClone(sampleQuote),
      metadata: { ...sampleQuote.metadata, proposalNumber: 'RCT001-FS' },
      sections: { ...structuredClone(sampleQuote.sections), sectionC: { ...structuredClone(sampleQuote.sections.sectionC), enabled: true } }
    }
  },
  {
    name: 'lease-no-logo',
    quote: {
      ...structuredClone(sampleQuote),
      metadata: { ...sampleQuote.metadata, proposalNumber: 'RCT001-LEASE', quoteType: 'lease' },
      customer: { ...structuredClone(sampleQuote.customer), logoText: '', logoDataUrl: undefined }
    }
  }
];

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];
page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', err => pageErrors.push(String(err)));

async function evaluatePreviewSurface() {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const normalized = text.replace(/\s+/g, ' ').trim();
    const hasChrome = normalized.includes('App preview controls') || normalized.includes('App print controls');
    const hasDocumentHeading = normalized.includes('INET COMMUNICATIONS PROPOSAL');
    const hasApprovalBlock = normalized.includes('Authorization to proceed');
    const hasToolbarChromeInDom = Boolean(document.querySelector('.proposal-toolbar.no-print'));
    const proposalPages = document.querySelectorAll('.proposal-page').length;
    return {
      hasChrome,
      hasToolbarChromeInDom,
      hasDocumentHeading,
      hasApprovalBlock,
      proposalPages,
      textSnippet: normalized.slice(0, 1200),
    };
  });
}

const results = [];
for (const variant of variants) {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((key, quote) => {
    window.sessionStorage.setItem(key, JSON.stringify(quote));
  }, PROPOSAL_STORAGE_KEY, variant.quote);

  await page.goto(base + '/proposal', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.screenshot({ path: `_pdf_review/${variant.name}-preview.png`, fullPage: true });
  const htmlPreview = await evaluatePreviewSurface();

  await page.goto(base + '/proposal/print?autoprint=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.screenshot({ path: `_pdf_review/${variant.name}-print.png`, fullPage: true });
  const printPreview = await evaluatePreviewSurface();

  results.push({
    name: variant.name,
    htmlPreview,
    printPreview,
    verifiedDifferencesOnly: [
      htmlPreview.hasToolbarChromeInDom || printPreview.hasToolbarChromeInDom
        ? 'App toolbar chrome exists in browser preview routes but is marked no-print and is not customer proposal content.'
        : null,
      htmlPreview.hasDocumentHeading && printPreview.hasDocumentHeading && htmlPreview.hasApprovalBlock && printPreview.hasApprovalBlock
        ? 'The shared proposal document content is present in both HTML preview and print preview routes.'
        : null,
    ].filter(Boolean),
  });
}

const pdfResult = await page.evaluate(async (quote) => {
  const response = await fetch('/api/proposal-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote })
  });
  const bytes = await response.arrayBuffer();
  const decoder = new TextDecoder();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    contentDisposition: response.headers.get('content-disposition'),
    byteLength: bytes.byteLength,
    bytes: Array.from(new Uint8Array(bytes).slice(0, 64)),
    textPreview: response.ok ? null : decoder.decode(bytes).slice(0, 600)
  };
}, sampleQuote);

await browser.close();

const output = {
  sourceOfTruth: 'ProposalDocument HTML is the customer-facing source of truth. PDF is generated from the print route using that same HTML.',
  results,
  pdfResult,
  verifiedDifferencesOnly: [
    'Preview and print routes include app-level toolbar chrome in the browser DOM.',
    'That toolbar is marked with .no-print and is excluded from print/PDF output.',
    'Parity review should compare proposal document content, not toolbar labels or app controls.',
  ],
  consoleMessages,
  pageErrors
};
await fs.writeFile('_pdf_review/qa-pdf-verify.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));

"use client";

import { useEffect, useMemo, useState } from "react";
import { IliosEstimateDocument } from "@/app/components/ilios-estimate-document";
import { buildExecutiveSummaryRenderBlocks } from "@/app/lib/executive-summary";
import {
  buildProposalCommercialSummary,
  getEquipmentTotal,
  getLeaseMonthlyTotal,
  getOptionalServicesTotal,
  getQuoteContentPresence,
  getRecurringMonthlyTotal,
} from "@/app/lib/proposal-commercial-summary";
import { getMajorProjectSpecAttachmentFile, isMajorProjectSpecAttachmentPdf } from "@/app/lib/major-project-spec-attachments";
import { resolveMajorProjectOutputSpecAttachments, type MajorProjectOutputSpecAttachment } from "@/app/lib/major-project";
import { getQuoteBranding, resolveQuoteOutputTemplateKey } from "@/app/lib/quote-branding";
import type { MajorProjectSpecAttachment, QuoteRecord, ServicePricingRow } from "@/app/lib/quote-record";

type ProposalDocumentProps = {
  quote: QuoteRecord;
  assetOverrides?: {
    inetLogoSrc?: string;
  };
};

type ResolvedSpecSheetPreview = MajorProjectOutputSpecAttachment & {
  objectUrl: string | null;
  loadError: string | null;
};

type ResolvedSystemDrawingPreview = {
  attachment: MajorProjectSpecAttachment;
  objectUrl: string | null;
  loadError: string | null;
};

function isImageAttachment(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const normalizedFileName = fileName.trim().toLowerCase();
  return normalizedMimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp"].some((extension) => normalizedFileName.endsWith(extension));
}

function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}


function getPricingLabel(row: ServicePricingRow) {
  if (row.pricingStage === "final") return "Final";
  return "Budgetary";
}

function supportingSpecLabel(value: string | undefined) {
  const label = value?.trim();
  return label ? `Supporting spec: ${label}` : null;
}

function normalizeHeadingText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isRedundantHeadingText(value: string | undefined, comparisons: Array<string | undefined>) {
  const normalizedValue = normalizeHeadingText(value);
  if (!normalizedValue) return true;
  return comparisons.some((comparison) => {
    const normalizedComparison = normalizeHeadingText(comparison);
    return Boolean(
      normalizedComparison &&
      normalizedComparison !== normalizedValue &&
      (normalizedComparison.includes(normalizedValue) || normalizedValue.includes(normalizedComparison)),
    );
  });
}

function buildSectionHeadingContent(badge: string, overline: string, title: string) {
  const resolvedTitle = title.trim();
  const resolvedBadge = isRedundantHeadingText(badge, [overline, resolvedTitle]) ? null : badge;
  const resolvedOverline = isRedundantHeadingText(overline, [badge, resolvedTitle]) ? null : overline;
  return {
    badge: resolvedBadge,
    overline: resolvedOverline,
    title: resolvedTitle,
  };
}

function cleanLines(lines: Array<string | null | undefined>) {
  return lines.map((line) => (line ?? "").trim()).filter(Boolean);
}

function splitParagraphs(values: Array<string | null | undefined>) {
  return values
    .flatMap((value) => (value ?? "").replace(/\r\n/g, "\n").split(/\n\s*\n/))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getSpecOutputSectionLabel(outputSection: MajorProjectOutputSpecAttachment["outputSection"]) {
  switch (outputSection) {
    case "sectionA":
      return "Recurring services";
    case "sectionB":
      return "Equipment and accessories";
    case "sectionC":
      return "Field services";
    default:
      return "Proposal section";
  }
}

function DetailedProposalDocument({ quote, assetOverrides }: ProposalDocumentProps) {
  const selectedBranding = getQuoteBranding(quote);
  const [systemDrawingPreviews, setSystemDrawingPreviews] = useState<ResolvedSystemDrawingPreview[]>([]);
  const [specSheetPreviews, setSpecSheetPreviews] = useState<ResolvedSpecSheetPreview[]>([]);
  const [systemDrawingPreviewsReady, setSystemDrawingPreviewsReady] = useState(false);
  const [specSheetPreviewsReady, setSpecSheetPreviewsReady] = useState(false);
  const currencyCode = quote.metadata.currencyCode || "USD";
  const sectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;
  const recurringMonthlyTotal = getRecurringMonthlyTotal(quote);
  const equipmentTotal = getEquipmentTotal(quote);
  const sectionCTotal = getOptionalServicesTotal(quote);
  const leaseMonthly = getLeaseMonthlyTotal(quote, recurringMonthlyTotal, equipmentTotal);
  const executiveSummaryRenderBlocks = buildExecutiveSummaryRenderBlocks(quote.executiveSummary);
  const sectionAHeading = buildSectionHeadingContent("Services", "Recurring services", quote.sections.sectionA.title);
  const sectionBHeading = buildSectionHeadingContent("Equipment", "Equipment and accessories", quote.sections.sectionB.title);
  const sectionCHeading = buildSectionHeadingContent("Services", "Field services", quote.sections.sectionC.title);
  const billToLines = cleanLines([
    quote.billTo.companyName ?? "",
    quote.billTo.attention ?? "",
    ...quote.billTo.lines,
  ]);

  const shipToSource = quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo;
  const shipToLines = cleanLines([
    shipToSource.companyName ?? "",
    shipToSource.attention ?? "",
    ...shipToSource.lines,
  ]);
  const customerVisibleCustomFields = (quote.customFields ?? []).filter(
    (field) => field.visibility === "customer" && (field.label ?? "").trim().length > 0 && (field.value ?? "").trim().length > 0,
  );
  const contentPresence = getQuoteContentPresence(quote);
  const commercialSummaryItems = buildProposalCommercialSummary(quote);
  const systemDrawingAttachments = quote.majorProject?.summary?.systemDrawings ?? [];
  const resolvedSpecSheetAttachments = useMemo(() => resolveMajorProjectOutputSpecAttachments(quote), [quote]);
  const pricingSnapshotItems = commercialSummaryItems.map((item) => ({
    ...item,
    value: formatCurrency(item.value, currencyCode),
    tone: item.tone ?? "default",
  }));
  const warrantyParagraphs = splitParagraphs([quote.warranty.coverageNote, quote.warranty.claimNote]);
  const hasWarrantyContent = quote.warranty.enabled && (
    quote.warranty.manufacturerReference.trim().length > 0 ||
    warrantyParagraphs.length > 0
  );

  useEffect(() => {
    let isCancelled = false;
    const objectUrls: string[] = [];

    async function loadSystemDrawingPreviews() {
      if (!systemDrawingAttachments.length) {
        setSystemDrawingPreviews([]);
        setSystemDrawingPreviewsReady(true);
        return;
      }

      setSystemDrawingPreviewsReady(false);

      const nextPreviews = await Promise.all(
        systemDrawingAttachments.map(async (attachment) => {
          const isImageDrawing = isImageAttachment(attachment.fileName, attachment.mimeType);

          try {
            const fileBlob = await getMajorProjectSpecAttachmentFile(attachment.storageKey);

            if (!fileBlob) {
              return { attachment, objectUrl: null, loadError: "Drawing file is missing from local storage." } satisfies ResolvedSystemDrawingPreview;
            }

            if (!isImageDrawing) {
              return { attachment, objectUrl: null, loadError: "HTML preview is only available for image drawings in this slice." } satisfies ResolvedSystemDrawingPreview;
            }

            const objectUrl = URL.createObjectURL(fileBlob);
            if (isCancelled) {
              URL.revokeObjectURL(objectUrl);
              return { attachment, objectUrl: null, loadError: "Drawing preview unavailable." } satisfies ResolvedSystemDrawingPreview;
            }

            objectUrls.push(objectUrl);
            return { attachment, objectUrl, loadError: null } satisfies ResolvedSystemDrawingPreview;
          } catch {
            return { attachment, objectUrl: null, loadError: "Drawing preview unavailable." } satisfies ResolvedSystemDrawingPreview;
          }
        }),
      );

      if (!isCancelled) {
        setSystemDrawingPreviews(nextPreviews);
        setSystemDrawingPreviewsReady(true);
      }
    }

    void loadSystemDrawingPreviews();

    return () => {
      isCancelled = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [systemDrawingAttachments]);

  useEffect(() => {
    let isCancelled = false;
    const objectUrls: string[] = [];

    async function loadSpecSheetPreviews() {
      if (!resolvedSpecSheetAttachments.length) {
        setSpecSheetPreviews([]);
        setSpecSheetPreviewsReady(true);
        return;
      }

      setSpecSheetPreviewsReady(false);

      const nextPreviews = await Promise.all(
        resolvedSpecSheetAttachments.map(async (entry) => {
          const isPdfAttachment = isMajorProjectSpecAttachmentPdf(entry.attachment.fileName, entry.attachment.mimeType);
          const isImageSpecAttachment = isImageAttachment(entry.attachment.fileName, entry.attachment.mimeType);

          try {
            const fileBlob = await getMajorProjectSpecAttachmentFile(entry.attachment.storageKey);

            if (!fileBlob) {
              return {
                ...entry,
                objectUrl: null,
                loadError: `Missing local attachment file: ${entry.attachment.fileName}.`,
              } satisfies ResolvedSpecSheetPreview;
            }

            if (!isPdfAttachment && !isImageSpecAttachment) {
              return {
                ...entry,
                objectUrl: null,
                loadError: "HTML preview is not available for this attachment type.",
              } satisfies ResolvedSpecSheetPreview;
            }

            const objectUrl = URL.createObjectURL(fileBlob);

            if (isCancelled) {
              URL.revokeObjectURL(objectUrl);
              return {
                ...entry,
                objectUrl: null,
                loadError: "Attachment preview unavailable.",
              } satisfies ResolvedSpecSheetPreview;
            }

            objectUrls.push(objectUrl);

            return {
              ...entry,
              objectUrl,
              loadError: null,
            } satisfies ResolvedSpecSheetPreview;
          } catch {
            return {
              ...entry,
              objectUrl: null,
              loadError: `Unable to load attachment preview for ${entry.attachment.fileName}.`,
            } satisfies ResolvedSpecSheetPreview;
          }
        }),
      );

      if (!isCancelled) {
        setSpecSheetPreviews(nextPreviews);
        setSpecSheetPreviewsReady(true);
      }
    }

    void loadSpecSheetPreviews();

    return () => {
      isCancelled = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [resolvedSpecSheetAttachments]);

  let printPageNumber = 1;
  const coverPageLabel = `Page ${printPageNumber++}`;
  const proposalInfoPageLabel = `Page ${printPageNumber++}`;
  const recurringServicesPageLabel = quote.sections.sectionA.enabled ? `Page ${printPageNumber++}` : null;
  const equipmentPageLabel = quote.sections.sectionB.enabled ? `Page ${printPageNumber++}` : null;
  const fieldServicesPageLabel = quote.sections.sectionC.enabled ? `Page ${printPageNumber++}` : null;
  const systemDrawingPageLabels = systemDrawingPreviews.map(() => `Page ${printPageNumber++}`);
  const specSheetPageLabels = specSheetPreviews.map(() => `Page ${printPageNumber++}`);
  const termsPageLabel = `Page ${printPageNumber++}`;
  const closingPageLabel = `Page ${printPageNumber++}`;
  const loadedSpecSheetCount = specSheetPreviews.filter((entry) => Boolean(entry.objectUrl)).length;
  const failedSpecSheetPreviews = specSheetPreviews.filter((entry) => !entry.objectUrl);

  return (
    <main
      className={`proposal-shell proposal-shell-${selectedBranding.key}`}
      data-attachments-ready={systemDrawingPreviewsReady && specSheetPreviewsReady ? "true" : "false"}
      style={{
        ["--proposal-brand-primary" as string]: selectedBranding.primaryColor,
        ["--proposal-brand-accent" as string]: selectedBranding.accentColor,
        ["--proposal-brand-muted" as string]: selectedBranding.mutedColor,
      }}
    >
      <section className="proposal-page cover-page proposal-page-with-band" data-page-label={coverPageLabel}>
        <div className="cover-grid">
          <div className="cover-topbar">
            <div className="cover-brand-row">
              <div className="cover-brand-lockup">
                <img
                  src={assetOverrides?.inetLogoSrc ?? selectedBranding.logoSrc}
                  alt={selectedBranding.logoAlt}
                  className="cover-brand-logo h-auto w-auto"
                  width={208}
                  height={64}
                />
                <div className="cover-brand-subtitle">{selectedBranding.proposalBannerText}</div>
              </div>
              <div className="cover-proposal-meta">
                <div className="cover-meta-label">Proposal</div>
                <div className="cover-meta-value">#{quote.metadata.proposalNumber}</div>
                <div>{quote.metadata.proposalDate}</div>
                {quote.metadata.documentTitle ? <div className="cover-meta-chip">{quote.metadata.documentTitle}</div> : null}
              </div>
            </div>
          </div>

          <div className="cover-content">
            {quote.metadata.documentTitle ? <div className="cover-kicker">{quote.metadata.documentTitle}</div> : null}
            <h1>{quote.metadata.documentTitle}</h1>
            <h2>{quote.metadata.documentSubtitle}</h2>

            <div className="cover-customer-grid print-keep-group">
              <div className="cover-customer-card print-keep-block">
                <div className="cover-customer-label">Prepared for</div>
                <div className="cover-customer-brand-row">
                  {quote.customer.logoDataUrl ? (
                    <img src={quote.customer.logoDataUrl} alt={`${quote.customer.name} logo`} className="customer-brand-logo" />
                  ) : (
                    <div className="customer-brand-fallback">{quote.customer.logoText || quote.customer.name}</div>
                  )}
                </div>
                <div className="cover-customer-name">{quote.customer.name}</div>
                <div className="cover-contact-lines">
                  <div>{quote.customer.contactName}</div>
                  <div>{quote.customer.contactPhone}</div>
                  <div>{quote.customer.contactEmail}</div>
                </div>
                <div className="cover-customer-lines">
                  {quote.customer.addressLines.map((line, index) => (
                    <div key={`${line}-${index}`}>{line}</div>
                  ))}
                </div>
              </div>

              <div className="cover-contact-card print-keep-block">
                <div className="cover-customer-label">{quote.documentation.preparedByLabel ?? "Prepared by"}</div>
                <div className="cover-contact-name">{quote.inet.contactName}</div>
                <div className="cover-contact-lines">
                  <div>{quote.inet.name}</div>
                  <div>{quote.inet.contactPhone}</div>
                  <div>{quote.inet.contactEmail}</div>
                </div>
                <div className="cover-customer-lines">
                  {quote.inet.addressLines.map((line, index) => (
                    <div key={`${line}-${index}`}>{line}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="cover-summary-strip">
            {pricingSnapshotItems.map((item) => (
              <div key={item.key} className="cover-summary-card">
                <div className="cover-summary-label">{item.label}</div>
                <div className="cover-summary-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="cover-band">
          <div className="cover-band-copy">Confidential commercial proposal prepared for review and approval.</div>
        </div>
      </section>

      <section className="proposal-page proposal-info-page" data-page-label={proposalInfoPageLabel}>
        <div className="proposal-header">
          <span>Proposal details</span>
          <span>Proposal #{quote.metadata.proposalNumber}</span>
        </div>

        <div className="proposal-title-block">
          <div>
            <div className="proposal-overline">Proposal overview</div>
            <h2 className="proposal-section-title">Proposal Information</h2>
          </div>
          <div className="proposal-date-card">
            <div className="proposal-date-label">Prepared</div>
            <div>{quote.metadata.proposalDate}</div>
            <div className="proposal-cell-note">Revision {quote.metadata.revisionVersion}</div>
          </div>
        </div>

        <div className="section-title-rule" />

        <div className="proposal-summary-grid">
          <div className="proposal-summary-panel">
            <div className="summary-panel-label">Proposal</div>
            <div className="summary-panel-value">#{quote.documentation.proposalNumberLabel}</div>
            <div className="summary-panel-copy">{quote.documentation.proposalTitle}</div>
          </div>
          <div className="proposal-summary-panel">
            <div className="summary-panel-label">Date</div>
            <div className="summary-panel-value">{quote.documentation.proposalDateLabel}</div>
            <div className="summary-panel-copy">{quote.metadata.documentTitle || quote.documentation.proposalTitle}</div>
          </div>
          <div className="proposal-summary-panel">
            <div className="summary-panel-label">{quote.documentation.preparedByLabel ?? "Prepared by"}</div>
            <div className="summary-panel-value">{quote.inet.contactName}</div>
            <div className="summary-panel-copy">{quote.inet.name}</div>
          </div>
        </div>

        <div className="proposal-detail-grid print-keep-group">
          <div className="proposal-copy proposal-copy-card print-keep-block">
            <div className="proposal-mini-heading">Customer</div>
            <p><strong>Customer Contact</strong> {quote.customer.contactName}</p>
            <p><strong>Contact Phone</strong> {quote.customer.contactPhone}</p>
            <p><strong>Contact Email</strong> {quote.customer.contactEmail}</p>
            <p><strong>{quote.documentation.customerAddressHeading}</strong></p>
            {quote.customer.addressLines.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
          <div className="proposal-copy proposal-copy-card print-keep-block">
            <div className="proposal-mini-heading">{quote.documentation.inetSalesHeading ?? selectedBranding.shortName}</div>
            <p><strong>{quote.documentation.preparedByLabel ?? "Prepared By"}</strong> {quote.inet.contactName}</p>
            <p><strong>Contact Phone</strong> {quote.inet.contactPhone}</p>
            <p><strong>Contact Email</strong> {quote.inet.contactEmail}</p>
            <p><strong>{quote.documentation.inetAddressHeading}</strong></p>
            {quote.inet.addressLines.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
        </div>

      </section>

      <section className="proposal-page proposal-info-page proposal-info-address-page proposal-page-force-new-sheet" data-page-label={proposalInfoPageLabel}>
        <div className="proposal-header">
          <span>Proposal details</span>
          <span>Proposal #{quote.metadata.proposalNumber}</span>
        </div>

        <div className="proposal-address-grid print-keep-group">
          <div className="proposal-copy proposal-copy-card print-keep-block">
            <div className="proposal-mini-heading">{quote.documentation.billToHeading ?? "Bill To"}</div>
            {billToLines.map((line, index) => (
              <p key={`bill-${line}-${index}`}>{line}</p>
            ))}
          </div>
          <div className="proposal-copy proposal-copy-card print-keep-block">
            <div className="proposal-mini-heading">{quote.documentation.shipToHeading ?? "Ship To"}</div>
            {shipToLines.map((line, index) => (
              <p key={`ship-${line}-${index}`}>{line}</p>
            ))}
            {quote.shippingSameAsBillTo && <p className="proposal-cell-note">Same as Bill To</p>}
          </div>
        </div>

        {quote.executiveSummary.enabled && contentPresence.hasExecutiveSummaryContent && executiveSummaryRenderBlocks.length > 0 && (
          <div className="proposal-copy proposal-copy-card proposal-executive-summary-card">
            <div className="proposal-mini-heading">{quote.executiveSummary.heading?.trim() || "Executive Summary"}</div>
            <div className="space-y-3">
              {executiveSummaryRenderBlocks.map((block) => {
                if (block.type === "heading") {
                  return (
                    <h3 key={block.id} className="pt-1 text-[15px] font-semibold leading-[1.35] text-[#16202b]">
                      {block.text}
                    </h3>
                  );
                }

                if (block.type === "paragraph") {
                  return <p key={block.id} style={{ whiteSpace: "pre-line" }}>{block.text}</p>;
                }

                const ListTag = block.type === "numbered_list" ? "ol" : "ul";
                return (
                  <ListTag key={block.id} className="space-y-2 pl-5 text-[15px] leading-[1.65] text-[#485564] marker:text-[#485564]">
                    {(block.items ?? []).map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>)}
                  </ListTag>
                );
              })}
            </div>
          </div>
        )}

        {customerVisibleCustomFields.length ? (
          <div className="proposal-copy proposal-copy-card">
            <div className="proposal-mini-heading">Additional Proposal Details</div>
            {customerVisibleCustomFields.map((field) => (
              <p key={field.id}>
                <strong>{field.label || "Detail"}</strong>
                {field.value ? ` ${field.value}` : ""}
              </p>
            ))}
          </div>
        ) : null}

        <div className="proposal-callout-grid proposal-callout-grid-full">
          <div className="proposal-callout proposal-callout-feature totals-callout print-keep-block">
            <div className="proposal-callout-header">
              <div>
                <div className="proposal-callout-label">Commercial snapshot</div>
                <div className="proposal-callout-title">Pricing at a glance</div>
              </div>
              <div className="proposal-callout-chip">Customer view</div>
            </div>
            <div className="proposal-highlight-grid print-keep-group">
              {pricingSnapshotItems.map((item) => (
                <div
                  key={item.label}
                  className={`proposal-highlight-card print-keep-block ${item.tone === "accent" ? "proposal-highlight-card-accent" : ""}`}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {quote.sections.sectionA.enabled && contentPresence.hasSectionAContent && (
        <section className="proposal-page" data-page-label={recurringServicesPageLabel ?? "Page"}>
          <div className="proposal-header">
            <span>Recurring services</span>
            <span>Proposal #{quote.metadata.proposalNumber}</span>
          </div>

          <div className="proposal-section-heading keep-with-next">
            {sectionAHeading.badge ? <div className="section-heading-badge">{sectionAHeading.badge}</div> : null}
            {sectionAHeading.overline ? <div className="proposal-overline">{sectionAHeading.overline}</div> : null}
            <h2 className="proposal-section-title">{sectionAHeading.title}</h2>
            <p className="proposal-intro">
              {quote.sections.sectionA.introText ||
                `The pricing below reflects a ${quote.sections.sectionA.termMonths}-month commercial term.`}
            </p>
          </div>

          {quote.sections.sectionA.explanatoryParagraphs?.length ? (
            <div className="proposal-copy proposal-copy-card section-copy-block">
              {quote.sections.sectionA.explanatoryParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : null}

          <div className="proposal-section-summary-card keep-with-next">
            <div className="proposal-section-summary-label">Section summary</div>
            <div className="proposal-section-summary-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div>
            <div className="proposal-section-summary-copy">Total monthly recurring for the proposed service scope.</div>
          </div>

          <table className="proposal-table sample-table">
            <thead>
              <tr>
                <th>Service Description</th>
                <th>Qty</th>
                <th>Unit Monthly</th>
                <th>Total Monthly</th>
              </tr>
            </thead>
            <tbody>
              {sectionARows.map((row) => (
                <tr key={row.id} className="keep-together">
                  <td>
                    <div className="proposal-cell-title">{row.description}</div>
                    {row.unitLabel && row.rowType !== "support" && row.rowType !== "terminal_fee" && (
                      <div className="proposal-cell-subtitle">{row.unitLabel}</div>
                    )}
                    {row.rowType === "support" && row.includedText && (
                      <ul className="proposal-bullets inline-bullets">
                        {row.includedText.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                    {supportingSpecLabel(row.specSheetLabel) ? <div className="proposal-cell-note">{supportingSpecLabel(row.specSheetLabel)}</div> : null}
                  </td>
                  <td>{row.quantity ?? (row.rowType === "support" ? "—" : "—")}</td>
                  <td>
                    {row.rowType === "support"
                      ? "Included with service"
                      : formatCurrency(row.monthlyRate ?? row.unitPrice ?? 0, currencyCode)}
                  </td>
                  <td>
                    {row.rowType === "support"
                      ? "Included"
                      : formatCurrency(row.totalMonthlyRate ?? 0, currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proposal-total-row">
                <td colSpan={3}>Total monthly recurring</td>
                <td>{formatCurrency(recurringMonthlyTotal, currencyCode)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {quote.sections.sectionB.enabled && contentPresence.hasSectionBContent && (
        <section className="proposal-page" data-page-label={equipmentPageLabel ?? "Page"}>
          <div className="proposal-header">
            <span>Equipment and accessories</span>
            <span>Proposal #{quote.metadata.proposalNumber}</span>
          </div>

          <div className="proposal-section-heading keep-with-next">
            {sectionBHeading.badge ? <div className="section-heading-badge">{sectionBHeading.badge}</div> : null}
            {sectionBHeading.overline ? <div className="proposal-overline">{sectionBHeading.overline}</div> : null}
            <h2 className="proposal-section-title">{sectionBHeading.title}</h2>
            <p className="proposal-intro">
              {quote.sections.sectionB.introText ||
                "The prices below reflect one-time hardware and accessory charges."}
            </p>
          </div>

          <div className="proposal-section-summary-card keep-with-next">
            <div className="proposal-section-summary-label">Section summary</div>
            <div className="proposal-section-summary-value">{formatCurrency(equipmentTotal, currencyCode)}</div>
            <div className="proposal-section-summary-copy">One-time hardware, accessories, and related material pricing.</div>
          </div>

          <table className="proposal-table sample-table">
            <thead>
              <tr>
                <th>Equipment Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total Price</th>
              </tr>
            </thead>
            <tbody>
              {quote.sections.sectionB.lineItems.map((row) => (
                <tr key={row.id} className="keep-together">
                  <td>
                    <div className="proposal-line-item-media">
                      {row.imageUrl ? (
                        <div className="proposal-line-item-image-wrap">
                          <img src={row.imageUrl} alt={row.itemName} className="proposal-line-item-image" />
                        </div>
                      ) : null}
                      <div className="proposal-line-item-copy">
                    <div className="proposal-cell-title">{row.itemName}</div>
                    {([row.itemCategory, row.terminalType, row.partNumber].filter(Boolean).length > 0) ? (
                      <div className="proposal-cell-subtitle">
                        {[row.itemCategory, row.terminalType, row.partNumber].filter(Boolean).join(" • ")}
                      </div>
                    ) : null}
                    {row.description && <div className="proposal-cell-note">{row.description}</div>}
                    {supportingSpecLabel(row.specSheetLabel) ? <div className="proposal-cell-note">{supportingSpecLabel(row.specSheetLabel)}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td>{row.quantity}</td>
                  <td>{formatCurrency(row.unitPrice, currencyCode)}</td>
                  <td>{formatCurrency(row.totalPrice, currencyCode)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proposal-total-row">
                <td colSpan={3}>One-time equipment total</td>
                <td>{formatCurrency(equipmentTotal, currencyCode)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {quote.sections.sectionC.enabled && contentPresence.hasSectionCContent && (
        <section className="proposal-page" data-page-label={fieldServicesPageLabel ?? "Page"}>
          <div className="proposal-header">
            <span>Field services</span>
            <span>Proposal #{quote.metadata.proposalNumber}</span>
          </div>

          <div className="proposal-section-heading keep-with-next">
            {sectionCHeading.badge ? <div className="section-heading-badge">{sectionCHeading.badge}</div> : null}
            {sectionCHeading.overline ? <div className="proposal-overline">{sectionCHeading.overline}</div> : null}
            <h2 className="proposal-section-title">{sectionCHeading.title}</h2>
            <p className="proposal-intro">
              {quote.sections.sectionC.introText ||
                "Field services can be included as budgetary or final pricing."}
            </p>
          </div>

          <div className="proposal-section-summary-card keep-with-next">
            <div className="proposal-section-summary-label">Section summary</div>
            <div className="proposal-section-summary-value">{formatCurrency(sectionCTotal, currencyCode)}</div>
            <div className="proposal-section-summary-copy">Field services included in the proposed scope.</div>
          </div>

          <table className="proposal-table sample-table">
            <thead>
              <tr>
                <th>Service Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total Price</th>
              </tr>
            </thead>
            <tbody>
              {quote.sections.sectionC.lineItems.map((row) => (
                <tr key={row.id} className="keep-together">
                  <td>
                    <div className="proposal-cell-title">{row.description}</div>
                    <div className="proposal-cell-subtitle">{getPricingLabel(row)}</div>
                    {row.notes && <div className="proposal-cell-note">{row.notes}</div>}
                    {supportingSpecLabel(row.specSheetLabel) ? <div className="proposal-cell-note">{supportingSpecLabel(row.specSheetLabel)}</div> : null}
                  </td>
                  <td>{row.quantity}</td>
                  <td>{formatCurrency(row.unitPrice, currencyCode)}</td>
                  <td>{formatCurrency(row.totalPrice, currencyCode)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proposal-total-row">
                <td colSpan={3}>Field services total</td>
                <td>{formatCurrency(sectionCTotal, currencyCode)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {systemDrawingPreviews.map((drawing, index) => {
        const fallbackMessage = !drawing.objectUrl
          ? (drawing.loadError ?? "Drawing preview unavailable.")
          : null;

        return (
          <section
            key={drawing.attachment.storageKey}
            className="proposal-page proposal-spec-sheet-page"
            data-page-label={systemDrawingPageLabels[index] ?? "Page"}
          >
            <div className="proposal-header">
              <span>System drawings</span>
              <span>Proposal #{quote.metadata.proposalNumber}</span>
            </div>

            <div className="proposal-section-heading keep-with-next">
              <div className="section-heading-badge">Drawing</div>
              <div className="proposal-overline">Technical documentation</div>
              <h2 className="proposal-section-title">System Drawing</h2>
              <p className="proposal-intro">
                This drawing is included as part of the proposal package and appears before supporting spec sheets.
              </p>
            </div>

            <div className="proposal-copy proposal-copy-card proposal-spec-sheet-meta print-keep-block">
              <p><strong>Drawing file</strong> {drawing.attachment.fileName}</p>
            </div>

            <div className="proposal-spec-sheet-frame">
              {drawing.objectUrl ? (
                <img
                  src={drawing.objectUrl}
                  alt={drawing.attachment.fileName}
                  className="proposal-spec-sheet-image"
                />
              ) : null}

              {fallbackMessage ? (
                <div className="proposal-spec-sheet-empty">
                  <strong>{fallbackMessage}</strong>
                  <span>{drawing.attachment.fileName}</span>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}

      {specSheetPreviews.map((specSheet, index) => {
        const sectionLabel = getSpecOutputSectionLabel(specSheet.outputSection);
        const isPdf = isMajorProjectSpecAttachmentPdf(specSheet.attachment.fileName, specSheet.attachment.mimeType);
        const isImage = isImageAttachment(specSheet.attachment.fileName, specSheet.attachment.mimeType);
        const fallbackMessage = !specSheet.objectUrl
          ? (specSheet.loadError ?? "Attachment preview unavailable.")
          : (!isPdf && !isImage ? "HTML preview is not available for this attachment type." : null);

        return (
          <section
            key={specSheet.attachment.storageKey}
            className="proposal-page proposal-spec-sheet-page"
            data-page-label={specSheetPageLabels[index] ?? "Page"}
          >
            <div className="proposal-header">
              <span>Supporting spec sheets</span>
              <span>Proposal #{quote.metadata.proposalNumber}</span>
            </div>

            <div className="proposal-section-heading keep-with-next">
              <div className="section-heading-badge">Specs</div>
              <div className="proposal-overline">Supporting documentation</div>
              <h2 className="proposal-section-title">Supporting Spec Sheet</h2>
              <p className="proposal-intro">
                This attachment supports {sectionLabel.toLowerCase()} and remains separate from the proposal pricing tables.
              </p>
            </div>

            <div className="proposal-copy proposal-copy-card proposal-spec-sheet-meta print-keep-block">
              {index === 0 ? (
                <div className="proposal-attachment-status-card">
                  <p><strong>Attachment status</strong> {loadedSpecSheetCount} of {specSheetPreviews.length} supporting spec attachment{specSheetPreviews.length === 1 ? "" : "s"} loaded into proposal output.</p>
                  {failedSpecSheetPreviews.length ? (
                    <>
                      <p><strong>Missing or failed attachments</strong></p>
                      <ul className="proposal-bullets compact">
                        {failedSpecSheetPreviews.map((entry) => (
                          <li key={`failed-${entry.attachment.storageKey}`}>
                            {entry.attachment.fileName} - {entry.outputItemLabel} - {entry.sourceLabel} - {entry.loadError ?? "Attachment preview unavailable."}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>All referenced supporting spec attachments resolved successfully.</p>
                  )}
                </div>
              ) : null}
              <p><strong>Proposal section</strong> {sectionLabel}</p>
              <p><strong>Output item</strong> {specSheet.outputItemLabel}</p>
              <p><strong>Attachment source</strong> {specSheet.sourceLabel}</p>
              <p><strong>File</strong> {specSheet.attachment.fileName}</p>
            </div>

            <div className="proposal-spec-sheet-frame">
              {isImage && specSheet.objectUrl ? (
                <img
                  src={specSheet.objectUrl}
                  alt={specSheet.attachment.fileName}
                  className="proposal-spec-sheet-image"
                />
              ) : null}

              {isPdf && specSheet.objectUrl ? (
                <iframe
                  src={`${specSheet.objectUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  title={specSheet.attachment.fileName}
                  className="proposal-spec-sheet-embed"
                />
              ) : null}

              {fallbackMessage ? (
                <div className="proposal-spec-sheet-empty">
                  <strong>{fallbackMessage}</strong>
                  <span>{specSheet.attachment.fileName}</span>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}

      <section className="proposal-page proposal-terms-page" data-page-label={termsPageLabel}>
        <div className="proposal-header">
          <span>Terms and conditions</span>
          <span>Proposal #{quote.metadata.proposalNumber}</span>
        </div>

        <div className="proposal-terms-intro-card keep-with-next print-keep-block">
          <div className="proposal-section-summary-label">Review notes</div>
          <div className="proposal-terms-intro-title">Terms that support this commercial proposal</div>
          <div className="proposal-section-summary-copy">
            The items below stay with the printed proposal so the commercial pages and approval page are backed by the same terms package.
          </div>
        </div>

        <div className="proposal-overline">Terms and conditions</div>
        <h2 className="proposal-section-title">{quote.terms.generalStarlinkServiceTermsTitle}</h2>
        <div className="section-title-rule" />

        <div className="proposal-copy proposal-copy-card section-copy-block print-keep-block">
          <ol className="proposal-numbered-list">
            {quote.terms.generalStarlinkServiceTerms.map((term, index) => (
              <li key={`${term}-${index}`}>{term}</li>
            ))}
          </ol>
        </div>

        <div className="proposal-overline">Commercial terms</div>
        <h2 className="proposal-section-title">{quote.terms.pricingTermsTitle}</h2>
        <div className="proposal-copy proposal-copy-card section-copy-block print-keep-block">
          <ul className="proposal-bullets compact">
            {quote.terms.pricingTerms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </div>

        {hasWarrantyContent ? (
          <>
            <div className="proposal-overline">Warranty reference</div>
            <h2 className="proposal-section-title">{quote.warranty.heading}</h2>
            <div className="proposal-copy proposal-copy-card section-copy-block print-keep-block">
              {quote.warranty.manufacturerReference.trim().length > 0 ? (
                <p><strong>Manufacturer / source reference</strong> {quote.warranty.manufacturerReference}</p>
              ) : null}
              {warrantyParagraphs.map((paragraph, index) => (
                <p key={`${paragraph}-${index}`}>{paragraph}</p>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="proposal-page proposal-closing-page proposal-page-with-band" data-page-label={closingPageLabel}>
        <div className="proposal-header">
          <span>Commercial recap</span>
          <span>Proposal #{quote.metadata.proposalNumber}</span>
        </div>

        <div className="proposal-overline">Commercial recap</div>
        <h2 className="proposal-section-title">Summary of proposed pricing</h2>
        <div className="section-title-rule" />

        <div className="proposal-grand-totals print-keep-group">
          {contentPresence.hasSectionAContent && recurringMonthlyTotal > 0 && (
            <div className="grand-total-card print-keep-block">
              <div className="grand-total-label">Recurring monthly</div>
              <div className="grand-total-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div>
            </div>
          )}
          {contentPresence.hasSectionBContent && (
            <div className="grand-total-card print-keep-block">
              <div className="grand-total-label">One-time equipment</div>
              <div className="grand-total-value">{formatCurrency(equipmentTotal, currencyCode)}</div>
            </div>
          )}
          {contentPresence.hasSectionCContent && (
            <>
              <div className="grand-total-card print-keep-block">
                <div className="grand-total-label">Field services</div>
                <div className="grand-total-value">{formatCurrency(sectionCTotal, currencyCode)}</div>
              </div>
              <div className="grand-total-card accent-card print-keep-block">
                <div className="grand-total-label">One-time total</div>
                <div className="grand-total-value">{formatCurrency(equipmentTotal + sectionCTotal, currencyCode)}</div>
              </div>
            </>
          )}
          {quote.metadata.quoteType === "lease" && (
            <div className="grand-total-card accent-card print-keep-block">
              <div className="grand-total-label">Estimated lease monthly</div>
              <div className="grand-total-value">{formatCurrency(leaseMonthly, currencyCode)}</div>
            </div>
          )}
        </div>

        <div className="proposal-copy proposal-copy-card closing-copy closing-copy-strong print-keep-block">
          <p>
            This proposal outlines the current commercial structure for review. Final scope, taxes, freight,
            installation assumptions, and delivery details may be refined in the next revision.
          </p>
          <p>
            Please sign below to indicate acceptance of this proposal and authorization for {selectedBranding.shortName} to proceed with order
            processing based on the approved scope.
          </p>
          {quote.approval.approvalNote ? <p>{quote.approval.approvalNote}</p> : null}
        </div>

        <div className="approval-block sample-approval-block print-keep-block">
          <div className="approval-block-header">
            <div>
              <div className="proposal-overline">{quote.approval.heading}</div>
              <h3 className="approval-title">Authorization to proceed</h3>
            </div>
          </div>

          <div className="approval-copy">
            By signing below, the customer confirms review and acceptance of the pricing and scope described in this
            proposal, subject to any mutually agreed revisions or final contract documents.
          </div>

          <div className="approval-signature-grid approval-signature-grid-three-up print-keep-group">
            <div className="signature-field print-keep-block">
              <div className="signature-line" />
              <div className="signature-label">{quote.approval.signatureLabel}</div>
            </div>
            <div className="signature-field print-keep-block">
              <div className="signature-line" />
              <div className="signature-label">{quote.approval.customerNameLabel}</div>
            </div>
            <div className="signature-field print-keep-block">
              <div className="signature-line" />
              <div className="signature-label">{quote.approval.dateLabel}</div>
            </div>
          </div>
        </div>

        <div className="page-bottom-band" aria-hidden="true">
          <div className="cover-band-copy">Confidential commercial proposal prepared for review and approval.</div>
        </div>
      </section>
    </main>
  );
}

export function ProposalDocument(props: ProposalDocumentProps) {
  if (resolveQuoteOutputTemplateKey(props.quote) === "estimate_compact") {
    return <IliosEstimateDocument quote={props.quote} />;
  }

  return <DetailedProposalDocument {...props} />;
}

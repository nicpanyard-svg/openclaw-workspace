import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  buildProposalPdfViewModel,
  formatCurrency,
  type ProposalPdfViewModel,
} from "@/app/lib/proposal-pdf";
import type { QuoteRecord, ServicePricingRow } from "@/app/lib/quote-record";

Font.registerHyphenationCallback((word) => [word]);

const INET_LOGO_SRC = `${process.cwd()}\\public\\inet-logo.png`;

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 16,
    fontSize: 9.25,
    color: "#232a31",
    fontFamily: "Helvetica",
    lineHeight: 1.42,
    backgroundColor: "#ffffff",
  },
  pageWithBand: {
    position: "relative",
    paddingBottom: 74,
  },
  pageFrame: {
    position: "absolute",
    top: 10,
    left: 8,
    right: 8,
    bottom: 10,
    borderWidth: 1,
    borderColor: "rgba(219,226,233,0.9)",
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5eaef",
  },
  headerBarText: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#7d8996",
  },
  overline: {
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#8a96a3",
  },
  titleBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 18,
  },
  sectionHeading: {
    marginBottom: 14,
  },
  sectionBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#f7e7e7",
    color: "#8c1212",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 1.12,
    color: "#18222c",
    fontWeight: 700,
  },
  sectionRule: {
    width: "100%",
    height: 2,
    marginTop: 14,
    marginBottom: 16,
    backgroundColor: "#ae0910",
    opacity: 0.22,
  },
  introText: {
    fontSize: 10.5,
    lineHeight: 1.52,
    color: "#485564",
    marginTop: 6,
  },
  coverTopbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
  },
  brandLockup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  logo: {
    width: 220,
    height: 70,
    objectFit: "contain",
  },
  brandSubtitle: {
    fontSize: 8.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#6f7c89",
  },
  coverMetaCard: {
    width: 154,
    alignItems: "flex-end",
    textAlign: "right",
    fontSize: 9.5,
    color: "#586574",
    lineHeight: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e1e6ed",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  coverMetaValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: 700,
    color: "#16202b",
  },
  coverMetaChip: {
    marginTop: 7,
    borderRadius: 999,
    backgroundColor: "#f7eaea",
    color: "#8c1212",
    fontSize: 8,
    fontWeight: 700,
    paddingVertical: 4,
    paddingHorizontal: 10,
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  coverContent: {
    paddingTop: 42,
    flexGrow: 1,
  },
  coverKicker: {
    fontSize: 9,
    color: "#8e98a4",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  coverTitle: {
    marginTop: 12,
    maxWidth: 440,
    fontSize: 29,
    lineHeight: 1.04,
    color: "#1a2430",
    fontWeight: 700,
  },
  coverSubtitle: {
    marginTop: 8,
    maxWidth: 380,
    fontSize: 15.5,
    lineHeight: 1.22,
    color: "#56616d",
  },
  coverCustomerGrid: {
    marginTop: 18,
    flexDirection: "row",
    gap: 12,
  },
  coverCustomerCardWide: {
    width: "54%",
  },
  coverCustomerCardNarrow: {
    width: "46%",
  },
  card: {
    borderWidth: 1,
    borderColor: "#d7dde5",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  miniHeading: {
    marginBottom: 8,
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#7d8996",
  },
  coverContactName: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 1.1,
    fontWeight: 700,
    color: "#17202b",
  },
  cardLine: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: "#556270",
    marginTop: 1,
  },
  coverCustomerBrandRow: {
    minHeight: 40,
    justifyContent: "center",
    marginTop: 8,
  },
  customerBrandLogo: {
    maxWidth: 140,
    maxHeight: 42,
    objectFit: "contain",
  },
  customerBrandFallback: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#d7dde5",
    backgroundColor: "#fafbfd",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: "#18222c",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  coverSummaryStrip: {
    marginTop: "auto",
    flexDirection: "row",
    gap: 10,
    paddingTop: 20,
  },
  coverSummaryCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e7ec",
    backgroundColor: "rgba(250,252,254,0.96)",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#8a96a3",
  },
  coverSummaryValue: {
    marginTop: 6,
    fontSize: 18,
    lineHeight: 1,
    fontWeight: 700,
    color: "#16202b",
  },
  bottomBand: {
    position: "absolute",
    left: -12,
    right: -12,
    bottom: -10,
    height: 56,
    backgroundColor: "#a70a10",
  },
  bottomBandInner: {
    position: "absolute",
    left: 28,
    right: 28,
    top: 10,
    height: 2,
    backgroundColor: "#d86e6e",
  },
  bottomBandText: {
    position: "absolute",
    left: 28,
    right: 28,
    top: 22,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.92)",
  },
  dateCard: {
    minWidth: 108,
    borderWidth: 1,
    borderColor: "#e1e6ed",
    borderRadius: 12,
    backgroundColor: "#fbfcfe",
    paddingVertical: 9,
    paddingHorizontal: 11,
    textAlign: "right",
    fontSize: 9.5,
    color: "#4e5a67",
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  summaryPanel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d7dde5",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  summaryPanelValue: {
    marginTop: 5,
    fontSize: 16,
    lineHeight: 1.12,
    color: "#16202b",
    fontWeight: 700,
  },
  summaryPanelCopy: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 1.45,
    color: "#61707d",
  },
  twoColumn: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  half: {
    flex: 1,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.52,
    color: "#485564",
    marginTop: 4,
  },
  cellNote: {
    marginTop: 6,
    fontSize: 9,
    lineHeight: 1.45,
    color: "#61707d",
  },
  calloutGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  calloutSpacer: {
    flex: 1,
  },
  calloutCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d7dde5",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  totalsStack: {
    marginTop: 8,
    gap: 8,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  totalsRowLabel: {
    fontSize: 9.5,
    color: "#485564",
  },
  totalsRowValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "#16202b",
  },
  totalsAccentRow: {
    borderWidth: 1,
    borderColor: "#f0cbcb",
    backgroundColor: "#fff8f8",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  table: {
    width: "100%",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d9e0e7",
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    width: "100%",
  },
  tableHead: {
    backgroundColor: "#f5f7fa",
    borderBottomWidth: 1,
    borderBottomColor: "#dfe5ec",
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#ebeff4",
  },
  tableRowAlt: {
    backgroundColor: "#fbfcfe",
  },
  totalRow: {
    backgroundColor: "#f8fafc",
  },
  th: {
    fontSize: 8,
    fontWeight: 700,
    color: "#556270",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    textAlign: "left",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  td: {
    fontSize: 9.25,
    paddingVertical: 9,
    paddingHorizontal: 10,
    color: "#2e3944",
  },
  tdStrong: {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#18222c",
    marginBottom: 2,
  },
  tdSub: {
    fontSize: 8.5,
    color: "#61707d",
    lineHeight: 1.45,
    marginTop: 2,
  },
  tdNote: {
    fontSize: 8.5,
    color: "#61707d",
    lineHeight: 1.45,
    marginTop: 5,
  },
  inlineBullets: {
    marginTop: 6,
    gap: 3,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  bulletGlyph: {
    fontSize: 9,
    color: "#495665",
  },
  bulletText: {
    fontSize: 9,
    lineHeight: 1.45,
    color: "#495665",
    flex: 1,
  },
  colWide: { width: "58%" },
  colNarrow: { width: "10%" },
  colMid: { width: "16%" },
  paragraphCard: {
    borderWidth: 1,
    borderColor: "#d7dde5",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  numberedTerm: {
    fontSize: 10,
    lineHeight: 1.52,
    color: "#485564",
    marginTop: 4,
  },
  closingTotals: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  grandTotalCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d7dde5",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  grandTotalValue: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 1.1,
    fontWeight: 700,
    color: "#16202b",
  },
  approvalBlock: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#d7dde5",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  approvalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  approvalBrandMark: {
    minWidth: 96,
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#dfe5ec",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.98)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  approvalBrandLogo: {
    width: 78,
    height: 24,
    objectFit: "contain",
    opacity: 0.9,
  },
  approvalTitle: {
    marginTop: 4,
    fontSize: 17,
    lineHeight: 1.1,
    color: "#18222c",
    fontWeight: 700,
  },
  approvalChip: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#f6f8fb",
    borderWidth: 1,
    borderColor: "#d9e0e7",
    fontSize: 8.5,
    color: "#61707d",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: 700,
  },
  approvalCopy: {
    marginTop: 10,
    fontSize: 10,
    lineHeight: 1.52,
    color: "#485564",
  },
  signatureGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  signatureField: {
    flex: 1,
    minHeight: 64,
    justifyContent: "flex-end",
  },
  signatureLine: {
    height: 1,
    backgroundColor: "#7c8894",
    marginBottom: 9,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#61707d",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: 700,
  },
});

function renderTextLines(lines: string[]) {
  return lines.map((line, index) => (
    <Text key={`${line}-${index}`} style={styles.cardLine}>
      {line}
    </Text>
  ));
}

function getPricingLabel(row: ServicePricingRow) {
  return row.pricingStage === "final" ? "Final" : "Budgetary";
}

function TableRow({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

function Cell({ children, style }: { children?: React.ReactNode; style?: any }) {
  return <View style={style}>{children}</View>;
}

function SupportBullets({ items }: { items?: string[] }) {
  if (!items?.length) return null;

  return (
    <View style={styles.inlineBullets}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <Text style={styles.bulletGlyph}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ProposalPdfPages({ model }: { model: ProposalPdfViewModel }) {
  const coverSummaryItems = [
    {
      label: "Monthly recurring",
      value: formatCurrency(model.recurringMonthlyTotal, model.currencyCode),
    },
    {
      label: "One-time equipment",
      value: formatCurrency(model.equipmentTotal, model.currencyCode),
    },
    ...(model.quoteType === "lease"
      ? [{ label: "Estimated lease monthly", value: formatCurrency(model.leaseMonthly, model.currencyCode) }]
      : model.sectionCEnabled
        ? [{ label: "Optional services", value: formatCurrency(model.serviceTotal, model.currencyCode) }]
        : []),
  ];

  return (
    <>
      <Page size="LETTER" style={[styles.page, styles.pageWithBand]}>
        <View style={styles.pageFrame} fixed />

        <View style={styles.coverTopbar}>
          <View style={styles.brandLockup}>
            <Image src={INET_LOGO_SRC} style={styles.logo} />
            <Text style={styles.brandSubtitle}>iNet Communications Proposal</Text>
          </View>
          <View style={styles.coverMetaCard}>
            <Text style={styles.overline}>Proposal</Text>
            <Text style={styles.coverMetaValue}>#{model.proposalNumber}</Text>
            <Text>{model.proposalDate}</Text>
            <Text style={styles.coverMetaChip}>Budgetary Estimate</Text>
          </View>
        </View>

        <View style={styles.coverContent}>
          <Text style={styles.coverKicker}>Budgetary Estimate</Text>
          <Text style={styles.coverTitle}>{model.documentTitle}</Text>
          <Text style={styles.coverSubtitle}>{model.documentSubtitle}</Text>

          <View style={styles.coverCustomerGrid}>
            <View style={[styles.card, styles.coverCustomerCardWide]}>
              <Text style={styles.overline}>Prepared for</Text>
              <View style={styles.coverCustomerBrandRow}>
                {model.customerLogoDataUrl ? (
                  <Image src={model.customerLogoDataUrl} style={styles.customerBrandLogo} />
                ) : (
                  <Text style={styles.customerBrandFallback}>{model.customerLogoText || model.customerName}</Text>
                )}
              </View>
              <Text style={styles.coverContactName}>{model.customerName}</Text>
              <Text style={styles.cardLine}>{model.customerContactName}</Text>
              <Text style={styles.cardLine}>{model.customerContactPhone}</Text>
              <Text style={styles.cardLine}>{model.customerContactEmail}</Text>
              {renderTextLines(model.customerAddressLines)}
            </View>

            <View style={[styles.card, styles.coverCustomerCardNarrow]}>
              <Text style={styles.overline}>{model.documentation.preparedByLabel ?? "Prepared By"}</Text>
              <Text style={styles.coverContactName}>{model.inetContactName}</Text>
              <Text style={styles.cardLine}>{model.inetName}</Text>
              <Text style={styles.cardLine}>{model.inetContactPhone}</Text>
              <Text style={styles.cardLine}>{model.inetContactEmail}</Text>
              {renderTextLines(model.inetAddressLines)}
            </View>
          </View>

          <View style={styles.coverSummaryStrip}>
            {coverSummaryItems.map((item) => (
              <View key={item.label} style={styles.coverSummaryCard}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <Text style={styles.coverSummaryValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottomBand} fixed>
          <View style={styles.bottomBandInner} />
          <Text style={styles.bottomBandText}>Confidential commercial proposal prepared for review and approval.</Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.pageFrame} fixed />

        <View style={styles.headerBar}>
          <Text style={styles.headerBarText}>Proposal details</Text>
          <Text style={styles.headerBarText}>Proposal #{model.proposalNumber}</Text>
        </View>

        <View style={styles.titleBlock}>
          <View>
            <Text style={styles.overline}>Proposal overview</Text>
            <Text style={styles.sectionTitle}>Proposal Information</Text>
          </View>
          <View style={styles.dateCard}>
            <Text style={styles.summaryLabel}>Prepared</Text>
            <Text>{model.proposalDate}</Text>
          </View>
        </View>

        <View style={styles.sectionRule} />

        <View style={styles.summaryGrid}>
          <View style={styles.summaryPanel}>
            <Text style={styles.summaryLabel}>Proposal</Text>
            <Text style={styles.summaryPanelValue}>#{model.documentation.proposalNumberLabel}</Text>
            <Text style={styles.summaryPanelCopy}>{model.documentation.proposalTitle}</Text>
          </View>
          <View style={styles.summaryPanel}>
            <Text style={styles.summaryLabel}>Date</Text>
            <Text style={styles.summaryPanelValue}>{model.documentation.proposalDateLabel}</Text>
            <Text style={styles.summaryPanelCopy}>Budgetary Estimate</Text>
          </View>
          <View style={styles.summaryPanel}>
            <Text style={styles.summaryLabel}>{model.documentation.preparedByLabel ?? "Prepared By"}</Text>
            <Text style={styles.summaryPanelValue}>{model.inetContactName}</Text>
            <Text style={styles.summaryPanelCopy}>{model.inetName}</Text>
          </View>
        </View>

        <View style={styles.twoColumn}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.miniHeading}>Customer</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>Customer Contact</Text> {model.customerContactName}</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>Contact Phone</Text> {model.customerContactPhone}</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>Contact Email</Text> {model.customerContactEmail}</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>{model.documentation.customerAddressHeading}</Text></Text>
            {renderTextLines(model.customerAddressLines)}
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.miniHeading}>{model.documentation.inetSalesHeading ?? "iNet"}</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>{model.documentation.preparedByLabel ?? "Prepared By"}</Text> {model.inetContactName}</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>Contact Phone</Text> {model.inetContactPhone}</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>Contact Email</Text> {model.inetContactEmail}</Text>
            <Text style={styles.paragraph}><Text style={{ fontWeight: 700 }}>{model.documentation.inetAddressHeading}</Text></Text>
            {renderTextLines(model.inetAddressLines)}
          </View>
        </View>

        <View style={styles.twoColumn}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.miniHeading}>{model.documentation.billToHeading ?? "Bill To"}</Text>
            {renderTextLines(model.billToLines)}
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.miniHeading}>{model.documentation.shipToHeading ?? "Ship To"}</Text>
            {renderTextLines(model.shipToLines)}
            {model.shippingSameAsBillTo ? <Text style={styles.cellNote}>Same as Bill To</Text> : null}
          </View>
        </View>

        {model.executiveSummaryEnabled && model.executiveSummaryParagraphs.length > 0 ? (
          <View style={styles.paragraphCard}>
            <Text style={styles.miniHeading}>{model.executiveSummaryHeading}</Text>
            {model.executiveSummaryParagraphs.map((paragraph, index) => (
              <Text key={index} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ) : null}

        {model.customerVisibleCustomFields?.length ? (
          <View style={styles.paragraphCard}>
            <Text style={styles.miniHeading}>Additional Proposal Details</Text>
            {model.customerVisibleCustomFields.map((field) => (
              <Text key={field.id} style={styles.paragraph}>
                <Text style={{ fontWeight: 700 }}>{field.label || "Detail"}</Text>
                {field.value ? ` ${field.value}` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.calloutGrid}>
          <View style={styles.calloutSpacer} />
          <View style={styles.calloutCard}>
            <Text style={styles.summaryLabel}>Commercial snapshot</Text>
            <View style={styles.totalsStack}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsRowLabel}>Recurring monthly</Text>
                <Text style={styles.totalsRowValue}>{formatCurrency(model.recurringMonthlyTotal, model.currencyCode)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsRowLabel}>One-time equipment</Text>
                <Text style={styles.totalsRowValue}>{formatCurrency(model.equipmentTotal, model.currencyCode)}</Text>
              </View>
              {model.sectionCEnabled ? (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsRowLabel}>Optional services</Text>
                  <Text style={styles.totalsRowValue}>{formatCurrency(model.serviceTotal, model.currencyCode)}</Text>
                </View>
              ) : null}
              {model.quoteType === "lease" ? (
                <View style={[styles.totalsRow, styles.totalsAccentRow]}>
                  <Text style={styles.totalsRowLabel}>Estimated lease monthly</Text>
                  <Text style={styles.totalsRowValue}>{formatCurrency(model.leaseMonthly, model.currencyCode)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Page>

      {model.sectionAEnabled ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.pageFrame} fixed />

          <View style={styles.headerBar}>
            <Text style={styles.headerBarText}>Recurring services</Text>
            <Text style={styles.headerBarText}>Proposal #{model.proposalNumber}</Text>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionBadge}>Services</Text>
            <Text style={styles.overline}>Recurring services</Text>
            <Text style={styles.sectionTitle}>{model.sectionATitle}</Text>
            <Text style={styles.introText}>{model.sectionAIntro}</Text>
          </View>

          {model.sectionAExplanatoryParagraphs.length ? (
            <View style={styles.paragraphCard}>
              {model.sectionAExplanatoryParagraphs.map((paragraph, index) => (
                <Text key={index} style={styles.paragraph}>{paragraph}</Text>
              ))}
            </View>
          ) : null}

          <View style={styles.table}>
            <TableRow style={styles.tableHead}>
              <Cell style={styles.colWide}><Text style={styles.th}>Service Description</Text></Cell>
              <Cell style={styles.colNarrow}><Text style={styles.th}>Qty</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Unit Monthly</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Total Monthly</Text></Cell>
            </TableRow>

            {model.sectionARows.map((row, index) => (
              <TableRow key={row.id} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : null]}>
                <Cell style={styles.colWide}>
                  <View style={styles.td}>
                    <Text style={styles.tdStrong}>{row.description}</Text>
                    {row.unitLabel && row.rowType !== "support" && row.rowType !== "terminal_fee" ? (
                      <Text style={styles.tdSub}>{row.unitLabel}</Text>
                    ) : null}
                    {row.rowType === "support" ? <SupportBullets items={row.includedText} /> : null}
                  </View>
                </Cell>
                <Cell style={styles.colNarrow}>
                  <Text style={styles.td}>{row.quantity ?? "—"}</Text>
                </Cell>
                <Cell style={styles.colMid}>
                  <Text style={styles.td}>
                    {row.rowType === "support"
                      ? "Included with service"
                      : formatCurrency(row.monthlyRate ?? row.unitPrice ?? 0, model.currencyCode)}
                  </Text>
                </Cell>
                <Cell style={styles.colMid}>
                  <Text style={styles.td}>
                    {row.rowType === "support"
                      ? "Included"
                      : formatCurrency(row.totalMonthlyRate ?? 0, model.currencyCode)}
                  </Text>
                </Cell>
              </TableRow>
            ))}

            <TableRow style={styles.totalRow}>
              <Cell style={styles.colWide}><Text style={styles.td}>Total monthly recurring</Text></Cell>
              <Cell style={styles.colNarrow} />
              <Cell style={styles.colMid} />
              <Cell style={styles.colMid}>
                <Text style={styles.td}>{formatCurrency(model.recurringMonthlyTotal, model.currencyCode)}</Text>
              </Cell>
            </TableRow>
          </View>
        </Page>
      ) : null}

      {model.sectionBEnabled ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.pageFrame} fixed />

          <View style={styles.headerBar}>
            <Text style={styles.headerBarText}>Equipment and accessories</Text>
            <Text style={styles.headerBarText}>Proposal #{model.proposalNumber}</Text>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionBadge}>Equipment</Text>
            <Text style={styles.overline}>Equipment and accessories</Text>
            <Text style={styles.sectionTitle}>{model.sectionBTitle}</Text>
            <Text style={styles.introText}>{model.sectionBIntro}</Text>
          </View>

          <View style={styles.table}>
            <TableRow style={styles.tableHead}>
              <Cell style={styles.colWide}><Text style={styles.th}>Equipment Description</Text></Cell>
              <Cell style={styles.colNarrow}><Text style={styles.th}>Qty</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Unit Price</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Total Price</Text></Cell>
            </TableRow>

            {model.equipmentRows.map((row, index) => (
              <TableRow key={row.id} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : null]}>
                <Cell style={styles.colWide}>
                  <View style={styles.td}>
                    <Text style={styles.tdStrong}>{row.itemName}</Text>
                    <Text style={styles.tdSub}>{[row.itemCategory, row.terminalType, row.partNumber].filter(Boolean).join(" • ") || "Hardware line item"}</Text>
                    {row.description ? <Text style={styles.tdNote}>{row.description}</Text> : null}
                  </View>
                </Cell>
                <Cell style={styles.colNarrow}><Text style={styles.td}>{row.quantity}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.unitPrice, model.currencyCode)}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.totalPrice, model.currencyCode)}</Text></Cell>
              </TableRow>
            ))}

            <TableRow style={styles.totalRow}>
              <Cell style={styles.colWide}><Text style={styles.td}>One-time equipment total</Text></Cell>
              <Cell style={styles.colNarrow} />
              <Cell style={styles.colMid} />
              <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(model.equipmentTotal, model.currencyCode)}</Text></Cell>
            </TableRow>
          </View>
        </Page>
      ) : null}

      {model.sectionCEnabled ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.pageFrame} fixed />

          <View style={styles.headerBar}>
            <Text style={styles.headerBarText}>Optional field services</Text>
            <Text style={styles.headerBarText}>Proposal #{model.proposalNumber}</Text>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionBadge}>Services</Text>
            <Text style={styles.overline}>Optional field services</Text>
            <Text style={styles.sectionTitle}>{model.sectionCTitle}</Text>
            <Text style={styles.introText}>{model.sectionCIntro}</Text>
          </View>

          <View style={styles.table}>
            <TableRow style={styles.tableHead}>
              <Cell style={styles.colWide}><Text style={styles.th}>Service Description</Text></Cell>
              <Cell style={styles.colNarrow}><Text style={styles.th}>Qty</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Unit Price</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Total Price</Text></Cell>
            </TableRow>

            {model.serviceRows.map((row, index) => (
              <TableRow key={row.id} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : null]}>
                <Cell style={styles.colWide}>
                  <View style={styles.td}>
                    <Text style={styles.tdStrong}>{row.description}</Text>
                    <Text style={styles.tdSub}>{getPricingLabel(row)}</Text>
                    {row.notes ? <Text style={styles.tdNote}>{row.notes}</Text> : null}
                  </View>
                </Cell>
                <Cell style={styles.colNarrow}><Text style={styles.td}>{row.quantity}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.unitPrice, model.currencyCode)}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.totalPrice, model.currencyCode)}</Text></Cell>
              </TableRow>
            ))}

            <TableRow style={styles.totalRow}>
              <Cell style={styles.colWide}><Text style={styles.td}>Optional services total</Text></Cell>
              <Cell style={styles.colNarrow} />
              <Cell style={styles.colMid} />
              <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(model.serviceTotal, model.currencyCode)}</Text></Cell>
            </TableRow>
          </View>
        </Page>
      ) : null}

      <Page size="LETTER" style={styles.page}>
        <View style={styles.pageFrame} fixed />

        <View style={styles.headerBar}>
          <Text style={styles.headerBarText}>Terms and conditions</Text>
          <Text style={styles.headerBarText}>Proposal #{model.proposalNumber}</Text>
        </View>

        <Text style={styles.overline}>Terms and conditions</Text>
        <Text style={styles.sectionTitle}>{model.terms.generalStarlinkServiceTermsTitle}</Text>
        <View style={styles.sectionRule} />

        <View style={styles.paragraphCard}>
          {model.terms.generalStarlinkServiceTerms.map((term, index) => (
            <Text key={`${term}-${index}`} style={styles.numberedTerm}>{term}</Text>
          ))}
        </View>

        <View style={{ marginTop: 14 }}>
          <Text style={styles.overline}>Commercial terms</Text>
          <Text style={styles.sectionTitle}>{model.terms.pricingTermsTitle}</Text>
        </View>

        <View style={styles.paragraphCard}>
          {model.terms.pricingTerms.map((term) => (
            <View key={term} style={styles.bulletRow}>
              <Text style={styles.bulletGlyph}>•</Text>
              <Text style={styles.bulletText}>{term}</Text>
            </View>
          ))}
        </View>
      </Page>

      <Page size="LETTER" style={[styles.page, styles.pageWithBand]}>
        <View style={styles.pageFrame} fixed />

        <View style={styles.headerBar}>
          <Text style={styles.headerBarText}>Commercial recap</Text>
          <Text style={styles.headerBarText}>Proposal #{model.proposalNumber}</Text>
        </View>

        <Text style={styles.overline}>Commercial recap</Text>
        <Text style={styles.sectionTitle}>Summary of proposed pricing</Text>
        <View style={styles.sectionRule} />

        <View style={styles.closingTotals}>
          <View style={styles.grandTotalCard}>
            <Text style={styles.summaryLabel}>Recurring monthly</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(model.recurringMonthlyTotal, model.currencyCode)}</Text>
          </View>
          <View style={styles.grandTotalCard}>
            <Text style={styles.summaryLabel}>One-time equipment</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(model.equipmentTotal, model.currencyCode)}</Text>
          </View>
          {model.sectionCEnabled ? (
            <View style={styles.grandTotalCard}>
              <Text style={styles.summaryLabel}>Optional services</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(model.serviceTotal, model.currencyCode)}</Text>
            </View>
          ) : null}
          {model.quoteType === "lease" ? (
            <View style={[styles.grandTotalCard, { borderColor: "#f0cbcb", backgroundColor: "#fff8f8" }]}>
              <Text style={styles.summaryLabel}>Estimated lease monthly</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(model.leaseMonthly, model.currencyCode)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.paragraphCard}>
          <Text style={styles.paragraph}>
            This proposal outlines the current commercial structure for review. Final scope, taxes, freight,
            installation assumptions, and delivery details may be refined in the next revision.
          </Text>
          <Text style={styles.paragraph}>
            Please sign below to indicate acceptance of this proposal and authorization for iNet to proceed with order
            processing based on the approved scope.
          </Text>
        </View>

        <View style={styles.approvalBlock}>
          <View style={styles.approvalHeader}>
            <View>
              <Text style={styles.overline}>{model.approval.heading}</Text>
              <Text style={styles.approvalTitle}>Authorization to proceed</Text>
            </View>
            <View style={styles.approvalBrandMark}>
              <Image src={INET_LOGO_SRC} style={styles.approvalBrandLogo} />
            </View>
          </View>

          <Text style={styles.approvalCopy}>
            By signing below, the customer confirms review and acceptance of the pricing and scope described in this
            proposal, subject to any mutually agreed revisions or final contract documents.
          </Text>

          <View style={styles.signatureGrid}>
            <View style={styles.signatureField}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>{model.approval.signatureLabel}</Text>
            </View>
            <View style={styles.signatureField}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>{model.approval.customerNameLabel}</Text>
            </View>
            <View style={styles.signatureField}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>{model.approval.dateLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomBand} fixed>
          <View style={styles.bottomBandInner} />
          <Text style={styles.bottomBandText}>Confidential commercial proposal prepared for review and approval.</Text>
        </View>
      </Page>
    </>
  );
}

export function ProposalPdfDocument({ quote }: { quote: QuoteRecord }) {
  const model = buildProposalPdfViewModel(quote);

  return (
    <Document title={`${model.proposalNumber} Proposal`} author="RapidQuote" subject={model.documentTitle}>
      <ProposalPdfPages model={model} />
    </Document>
  );
}

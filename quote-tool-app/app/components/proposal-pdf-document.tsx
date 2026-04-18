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

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 34,
    paddingHorizontal: 28,
    fontSize: 10,
    color: "#232a31",
    fontFamily: "Helvetica",
    lineHeight: 1.45,
  },
  coverPage: {
    backgroundColor: "#ffffff",
  },
  coverTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
  },
  logo: {
    width: 130,
    height: 42,
    objectFit: "contain",
  },
  coverMeta: {
    width: 166,
    alignItems: "flex-end",
    gap: 4,
  },
  eyebrow: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#8b96a3",
    fontWeight: 700,
  },
  coverMetaValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "#16202b",
  },
  chip: {
    marginTop: 5,
    borderRadius: 999,
    backgroundColor: "#f7e7e7",
    color: "#850000",
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  titleKicker: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#8b96a3",
    marginBottom: 8,
  },
  coverTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: "#16202b",
    marginBottom: 6,
    maxWidth: 420,
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#5a6572",
    marginBottom: 18,
    maxWidth: 380,
  },
  twoColumn: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dde3e8",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fbfcfe",
  },
  cardTitle: {
    fontSize: 8.5,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#8b96a3",
    marginBottom: 8,
    fontWeight: 700,
  },
  cardStrong: {
    fontSize: 12,
    fontWeight: 700,
    color: "#16202b",
    marginBottom: 6,
  },
  cardLine: {
    marginBottom: 2,
    color: "#4d5b68",
  },
  summaryStrip: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e1e6ec",
    padding: 10,
  },
  summaryLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    color: "#8b96a3",
    letterSpacing: 1,
    marginBottom: 5,
    fontWeight: 700,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
    color: "#16202b",
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#16202b",
    marginTop: 3,
  },
  sectionRule: {
    height: 1,
    backgroundColor: "#dbe2e9",
    marginTop: 10,
  },
  introText: {
    marginTop: 10,
    color: "#5a6572",
    lineHeight: 1.5,
  },
  paragraphCard: {
    borderWidth: 1,
    borderColor: "#e1e6ec",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fcfdff",
    marginBottom: 12,
  },
  paragraph: {
    marginBottom: 8,
    color: "#3c4753",
    lineHeight: 1.5,
  },
  row: {
    flexDirection: "row",
    width: "100%",
  },
  table: {
    borderWidth: 1,
    borderColor: "#dbe2e9",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 12,
  },
  tableHead: {
    backgroundColor: "#f3f6fa",
    borderBottomWidth: 1,
    borderBottomColor: "#dbe2e9",
  },
  th: {
    fontSize: 8.5,
    fontWeight: 700,
    color: "#4c5965",
    paddingVertical: 8,
    paddingHorizontal: 8,
    textTransform: "uppercase",
  },
  td: {
    fontSize: 9.5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    color: "#2e3944",
  },
  tdStrong: {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#16202b",
    marginBottom: 2,
  },
  tdSub: {
    fontSize: 8.5,
    color: "#66717d",
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f5",
  },
  totalRow: {
    backgroundColor: "#fbfcfe",
  },
  totalText: {
    fontWeight: 700,
    color: "#16202b",
  },
  colWide: { width: "55%" },
  colNarrow: { width: "13%" },
  colMid: { width: "16%" },
  bullet: {
    fontSize: 8.5,
    color: "#60707f",
    marginTop: 2,
  },
  totalsGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  totalCard: {
    flexGrow: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#dde3e8",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fbfcfe",
  },
  totalCardAccent: {
    borderColor: "#e7c7c7",
    backgroundColor: "#fff7f7",
  },
  approvalBlock: {
    borderWidth: 1,
    borderColor: "#d6dde4",
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
    backgroundColor: "#ffffff",
  },
  signatureGrid: {
    flexDirection: "row",
    gap: 14,
    marginTop: 24,
  },
  signatureField: {
    flex: 1,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#7b8794",
    height: 24,
    marginBottom: 6,
  },
  signatureLabel: {
    fontSize: 8.5,
    color: "#60707f",
  },
  footerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  smallMuted: {
    fontSize: 8.5,
    color: "#8b96a3",
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

function TableRow({ children, header = false }: { children: React.ReactNode; header?: boolean }) {
  return <View style={header ? styles.row : [styles.row, styles.tableRowBorder]}>{children}</View>;
}

function Cell({ children, style }: { children?: React.ReactNode; style?: any }) {
  return <View style={style}>{children}</View>;
}

function ProposalPdfPages({ model }: { model: ProposalPdfViewModel }) {
  return (
    <>
      <Page size="LETTER" style={[styles.page, styles.coverPage]}>
        <View style={styles.coverTop}>
          <Image src="/inet-logo.png" style={styles.logo} />
          <View style={styles.coverMeta}>
            <Text style={styles.eyebrow}>Proposal</Text>
            <Text style={styles.coverMetaValue}>#{model.proposalNumber}</Text>
            <Text>{model.proposalDate}</Text>
            <Text style={styles.chip}>Budgetary Estimate</Text>
          </View>
        </View>

        <Text style={styles.titleKicker}>Budgetary Estimate</Text>
        <Text style={styles.coverTitle}>{model.documentTitle}</Text>
        <Text style={styles.coverSubtitle}>{model.documentSubtitle}</Text>

        <View style={styles.twoColumn}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Prepared for</Text>
            <Text style={styles.cardStrong}>{model.customerName}</Text>
            <Text style={styles.cardLine}>{model.customerContactName}</Text>
            <Text style={styles.cardLine}>{model.customerContactPhone}</Text>
            <Text style={styles.cardLine}>{model.customerContactEmail}</Text>
            {renderTextLines(model.customerAddressLines)}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{model.documentation.preparedByLabel ?? "Prepared By"}</Text>
            <Text style={styles.cardStrong}>{model.inetContactName}</Text>
            <Text style={styles.cardLine}>{model.inetName}</Text>
            <Text style={styles.cardLine}>{model.inetContactPhone}</Text>
            <Text style={styles.cardLine}>{model.inetContactEmail}</Text>
            {renderTextLines(model.inetAddressLines)}
          </View>
        </View>

        <View style={styles.summaryStrip}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Monthly recurring</Text>
            <Text style={styles.summaryValue}>{formatCurrency(model.recurringMonthlyTotal, model.currencyCode)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>One-time equipment</Text>
            <Text style={styles.summaryValue}>{formatCurrency(model.equipmentTotal, model.currencyCode)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{model.quoteType === "lease" ? "Estimated lease monthly" : "Optional services"}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(model.quoteType === "lease" ? model.leaseMonthly : model.serviceTotal, model.currencyCode)}
            </Text>
          </View>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.footerHeader}>
          <Text style={styles.eyebrow}>Proposal details</Text>
          <Text style={styles.smallMuted}>Proposal #{model.proposalNumber}</Text>
        </View>
        <View style={styles.sectionHeader}>
          <Text style={styles.eyebrow}>Proposal overview</Text>
          <Text style={styles.sectionTitle}>Proposal Information</Text>
          <View style={styles.sectionRule} />
        </View>

        <View style={[styles.twoColumn, { marginBottom: 12 }]}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Title</Text>
            <Text style={styles.cardStrong}>{model.documentation.proposalTitle}</Text>
            <Text style={styles.cardLine}>#{model.documentation.proposalNumberLabel}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Prepared</Text>
            <Text style={styles.cardStrong}>{model.documentation.proposalDateLabel}</Text>
            <Text style={styles.cardLine}>Budgetary Estimate</Text>
          </View>
        </View>

        <View style={[styles.twoColumn, { marginBottom: 12 }]}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Customer Information</Text>
            <Text style={styles.cardLine}>Customer Contact: {model.customerContactName}</Text>
            <Text style={styles.cardLine}>Contact Phone: {model.customerContactPhone}</Text>
            <Text style={styles.cardLine}>Contact Email: {model.customerContactEmail}</Text>
            <Text style={[styles.cardLine, { marginTop: 6 }]}>{model.documentation.customerAddressHeading}</Text>
            {renderTextLines(model.customerAddressLines)}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{model.documentation.inetSalesHeading ?? "iNet Sales"}</Text>
            <Text style={styles.cardLine}>{model.documentation.preparedByLabel ?? "Prepared By"}: {model.inetContactName}</Text>
            <Text style={styles.cardLine}>Contact Phone: {model.inetContactPhone}</Text>
            <Text style={styles.cardLine}>Contact Email: {model.inetContactEmail}</Text>
            <Text style={[styles.cardLine, { marginTop: 6 }]}>{model.documentation.inetAddressHeading}</Text>
            {renderTextLines(model.inetAddressLines)}
          </View>
        </View>

        <View style={styles.twoColumn}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{model.documentation.billToHeading ?? "Bill To"}</Text>
            {renderTextLines(model.billToLines)}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{model.documentation.shipToHeading ?? "Ship To"}</Text>
            {renderTextLines(model.shipToLines)}
            {model.shippingSameAsBillTo ? <Text style={styles.cardLine}>Same as Bill To</Text> : null}
          </View>
        </View>

        {model.executiveSummaryEnabled && model.executiveSummaryParagraphs.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <View style={styles.paragraphCard}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>{model.executiveSummaryHeading}</Text>
              {model.executiveSummaryParagraphs.map((paragraph, index) => (
                <Text key={index} style={styles.paragraph}>{paragraph}</Text>
              ))}
            </View>
          </View>
        ) : null}
      </Page>

      {model.sectionAEnabled ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.footerHeader}>
            <Text style={styles.eyebrow}>Recurring services</Text>
            <Text style={styles.smallMuted}>Proposal #{model.proposalNumber}</Text>
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.eyebrow}>Services</Text>
            <Text style={styles.sectionTitle}>{model.sectionATitle}</Text>
            <Text style={styles.introText}>{model.sectionAIntro}</Text>
            <View style={styles.sectionRule} />
          </View>

          {model.sectionAExplanatoryParagraphs.length ? (
            <View style={styles.paragraphCard}>
              {model.sectionAExplanatoryParagraphs.map((paragraph, index) => (
                <Text key={index} style={styles.paragraph}>{paragraph}</Text>
              ))}
            </View>
          ) : null}

          <View style={styles.table}>
            <TableRow header>
              <Cell style={styles.colWide}><Text style={styles.th}>Service Description</Text></Cell>
              <Cell style={styles.colNarrow}><Text style={styles.th}>Qty</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Unit Monthly</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Total Monthly</Text></Cell>
            </TableRow>

            {model.sectionARows.map((row) => (
              <TableRow key={row.id}>
                <Cell style={styles.colWide}>
                  <Text style={styles.tdStrong}>{row.description}</Text>
                  {row.unitLabel && row.rowType !== "support" && row.rowType !== "terminal_fee" ? (
                    <Text style={styles.tdSub}>{row.unitLabel}</Text>
                  ) : null}
                  {row.rowType === "support" && row.includedText?.length
                    ? row.includedText.map((item) => (
                        <Text key={item} style={styles.bullet}>• {item}</Text>
                      ))
                    : null}
                </Cell>
                <Cell style={styles.colNarrow}><Text style={styles.td}>{row.quantity ?? (row.rowType === "support" ? "Included" : "—")}</Text></Cell>
                <Cell style={styles.colMid}>
                  <Text style={styles.td}>
                    {row.rowType === "support" ? "Included" : formatCurrency(row.monthlyRate ?? row.unitPrice ?? 0, model.currencyCode)}
                  </Text>
                </Cell>
                <Cell style={styles.colMid}>
                  <Text style={styles.td}>
                    {row.rowType === "support" ? "Included" : formatCurrency(row.totalMonthlyRate ?? 0, model.currencyCode)}
                  </Text>
                </Cell>
              </TableRow>
            ))}

            <TableRow>
              <Cell style={[styles.colWide, styles.totalRow]}>
                <Text style={[styles.td, styles.totalText]}>Total monthly recurring</Text>
              </Cell>
              <Cell style={[styles.colNarrow, styles.totalRow]} />
              <Cell style={[styles.colMid, styles.totalRow]} />
              <Cell style={[styles.colMid, styles.totalRow]}>
                <Text style={[styles.td, styles.totalText]}>{formatCurrency(model.recurringMonthlyTotal, model.currencyCode)}</Text>
              </Cell>
            </TableRow>
          </View>
        </Page>
      ) : null}

      {model.sectionBEnabled ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.footerHeader}>
            <Text style={styles.eyebrow}>Equipment and accessories</Text>
            <Text style={styles.smallMuted}>Proposal #{model.proposalNumber}</Text>
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.eyebrow}>Equipment</Text>
            <Text style={styles.sectionTitle}>{model.sectionBTitle}</Text>
            <Text style={styles.introText}>{model.sectionBIntro}</Text>
            <View style={styles.sectionRule} />
          </View>

          <View style={styles.table}>
            <TableRow header>
              <Cell style={styles.colWide}><Text style={styles.th}>Equipment Description</Text></Cell>
              <Cell style={styles.colNarrow}><Text style={styles.th}>Qty</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Unit Price</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Total Price</Text></Cell>
            </TableRow>

            {model.equipmentRows.map((row) => (
              <TableRow key={row.id}>
                <Cell style={styles.colWide}>
                  <Text style={styles.tdStrong}>{row.itemName}</Text>
                  <Text style={styles.tdSub}>{[row.itemCategory, row.terminalType, row.partNumber].filter(Boolean).join(" • ") || "Hardware line item"}</Text>
                  {row.description ? <Text style={styles.tdSub}>{row.description}</Text> : null}
                </Cell>
                <Cell style={styles.colNarrow}><Text style={styles.td}>{row.quantity}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.unitPrice, model.currencyCode)}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.totalPrice, model.currencyCode)}</Text></Cell>
              </TableRow>
            ))}

            <TableRow>
              <Cell style={[styles.colWide, styles.totalRow]}>
                <Text style={[styles.td, styles.totalText]}>One-time equipment total</Text>
              </Cell>
              <Cell style={[styles.colNarrow, styles.totalRow]} />
              <Cell style={[styles.colMid, styles.totalRow]} />
              <Cell style={[styles.colMid, styles.totalRow]}>
                <Text style={[styles.td, styles.totalText]}>{formatCurrency(model.equipmentTotal, model.currencyCode)}</Text>
              </Cell>
            </TableRow>
          </View>
        </Page>
      ) : null}

      {model.sectionCEnabled ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.footerHeader}>
            <Text style={styles.eyebrow}>Optional field services</Text>
            <Text style={styles.smallMuted}>Proposal #{model.proposalNumber}</Text>
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.eyebrow}>Services</Text>
            <Text style={styles.sectionTitle}>{model.sectionCTitle}</Text>
            <Text style={styles.introText}>{model.sectionCIntro}</Text>
            <View style={styles.sectionRule} />
          </View>

          <View style={styles.table}>
            <TableRow header>
              <Cell style={styles.colWide}><Text style={styles.th}>Service Description</Text></Cell>
              <Cell style={styles.colNarrow}><Text style={styles.th}>Qty</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Unit Price</Text></Cell>
              <Cell style={styles.colMid}><Text style={styles.th}>Total Price</Text></Cell>
            </TableRow>

            {model.serviceRows.map((row) => (
              <TableRow key={row.id}>
                <Cell style={styles.colWide}>
                  <Text style={styles.tdStrong}>{row.description}</Text>
                  <Text style={styles.tdSub}>{getPricingLabel(row)}</Text>
                  {row.notes ? <Text style={styles.tdSub}>{row.notes}</Text> : null}
                </Cell>
                <Cell style={styles.colNarrow}><Text style={styles.td}>{row.quantity}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.unitPrice, model.currencyCode)}</Text></Cell>
                <Cell style={styles.colMid}><Text style={styles.td}>{formatCurrency(row.totalPrice, model.currencyCode)}</Text></Cell>
              </TableRow>
            ))}

            <TableRow>
              <Cell style={[styles.colWide, styles.totalRow]}>
                <Text style={[styles.td, styles.totalText]}>Optional services total</Text>
              </Cell>
              <Cell style={[styles.colNarrow, styles.totalRow]} />
              <Cell style={[styles.colMid, styles.totalRow]} />
              <Cell style={[styles.colMid, styles.totalRow]}>
                <Text style={[styles.td, styles.totalText]}>{formatCurrency(model.serviceTotal, model.currencyCode)}</Text>
              </Cell>
            </TableRow>
          </View>
        </Page>
      ) : null}

      <Page size="LETTER" style={styles.page}>
        <View style={styles.footerHeader}>
          <Text style={styles.eyebrow}>Terms and conditions</Text>
          <Text style={styles.smallMuted}>Proposal #{model.proposalNumber}</Text>
        </View>
        <View style={styles.sectionHeader}>
          <Text style={styles.eyebrow}>Terms and conditions</Text>
          <Text style={styles.sectionTitle}>{model.terms.generalStarlinkServiceTermsTitle}</Text>
          <View style={styles.sectionRule} />
        </View>

        <View style={styles.paragraphCard}>
          {model.terms.generalStarlinkServiceTerms.map((term, index) => (
            <Text key={`${term}-${index}`} style={styles.paragraph}>{term}</Text>
          ))}
        </View>

        <View style={[styles.sectionHeader, { marginTop: 6 }]}>
          <Text style={styles.eyebrow}>Commercial terms</Text>
          <Text style={styles.sectionTitle}>{model.terms.pricingTermsTitle}</Text>
        </View>
        <View style={styles.paragraphCard}>
          {model.terms.pricingTerms.map((term) => (
            <Text key={term} style={styles.paragraph}>• {term}</Text>
          ))}
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.footerHeader}>
          <Text style={styles.eyebrow}>Commercial recap</Text>
          <Text style={styles.smallMuted}>Proposal #{model.proposalNumber}</Text>
        </View>
        <View style={styles.sectionHeader}>
          <Text style={styles.eyebrow}>Commercial recap</Text>
          <Text style={styles.sectionTitle}>Summary of proposed pricing</Text>
          <View style={styles.sectionRule} />
        </View>

        <View style={styles.totalsGrid}>
          <View style={styles.totalCard}>
            <Text style={styles.summaryLabel}>Recurring monthly</Text>
            <Text style={styles.summaryValue}>{formatCurrency(model.recurringMonthlyTotal, model.currencyCode)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.summaryLabel}>One-time equipment</Text>
            <Text style={styles.summaryValue}>{formatCurrency(model.equipmentTotal, model.currencyCode)}</Text>
          </View>
          {model.sectionCEnabled ? (
            <View style={styles.totalCard}>
              <Text style={styles.summaryLabel}>Optional services</Text>
              <Text style={styles.summaryValue}>{formatCurrency(model.serviceTotal, model.currencyCode)}</Text>
            </View>
          ) : null}
          {model.quoteType === "lease" ? (
            <View style={[styles.totalCard, styles.totalCardAccent]}>
              <Text style={styles.summaryLabel}>Estimated lease monthly</Text>
              <Text style={styles.summaryValue}>{formatCurrency(model.leaseMonthly, model.currencyCode)}</Text>
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
          <Text style={styles.eyebrow}>{model.approval.heading}</Text>
          <Text style={[styles.sectionTitle, { fontSize: 16, marginTop: 4 }]}>Authorization to proceed</Text>
          <Text style={[styles.introText, { marginTop: 8 }]}>
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

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { buildEstimateTemplateModel } from "@/app/lib/estimate-template";
import type { QuoteRecord } from "@/app/lib/quote-record";

function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    backgroundColor: "#ffffff",
    color: "#24313d",
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#d6e0e7",
    paddingBottom: 18,
  },
  overline: {
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#617b8e",
    fontWeight: 700,
  },
  title: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: 700,
    color: "#1f2d3a",
  },
  subtitle: {
    marginTop: 6,
    maxWidth: 320,
    color: "#4f6576",
  },
  companyName: {
    fontSize: 17,
    fontWeight: 700,
    color: "#3388AA",
  },
  metaCard: {
    width: 185,
    borderWidth: 1,
    borderColor: "#d6e0e7",
    borderRadius: 12,
    backgroundColor: "#f8fbfc",
    padding: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
  },
  sectionGrid: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  sectionCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d6e0e7",
    borderRadius: 12,
    backgroundColor: "#fbfdfe",
    padding: 12,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: "#617b8e",
    fontWeight: 700,
    marginBottom: 8,
  },
  line: {
    marginTop: 2,
    color: "#4f6576",
  },
  table: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#d6e0e7",
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#3388AA",
    color: "#ffffff",
    fontWeight: 700,
    paddingVertical: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e8eef2",
    paddingVertical: 8,
  },
  cellNumber: { width: "6%", paddingHorizontal: 8 },
  cellItem: { width: "22%", paddingHorizontal: 8 },
  cellDescription: { width: "28%", paddingHorizontal: 8 },
  cellQty: { width: "10%", paddingHorizontal: 8 },
  cellSchedule: { width: "12%", paddingHorizontal: 8 },
  cellRate: { width: "11%", paddingHorizontal: 8 },
  cellAmount: { width: "11%", paddingHorizontal: 8 },
  lowerGrid: {
    marginTop: 18,
    flexDirection: "row",
    gap: 12,
  },
  notesCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d6e0e7",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fbfdfe",
  },
  totalsCard: {
    width: 180,
    borderWidth: 1,
    borderColor: "#d6e0e7",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f8fbfc",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  totalGrand: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d6e0e7",
    fontSize: 13,
    fontWeight: 700,
    color: "#1f2d3a",
  },
  signatureCard: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#d6e0e7",
    borderRadius: 12,
    padding: 12,
  },
  signatureGrid: {
    marginTop: 18,
    flexDirection: "row",
    gap: 12,
  },
  signatureField: {
    flex: 1,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#9baab6",
    height: 22,
  },
  signatureLabel: {
    marginTop: 6,
    fontSize: 9,
    color: "#60707f",
  },
});

export function IliosEstimatePdfDocument({ quote }: { quote: QuoteRecord }) {
  const model = buildEstimateTemplateModel(quote);
  if (!model) {
    return null;
  }

  const currencyCode = quote.metadata.currencyCode || "USD";

  return (
    <Document title={`${model.proposalNumber} Estimate`} author={model.companyLegalName} subject={model.documentTitle}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.overline}>{model.documentTitle}</Text>
            <Text style={styles.title}>{model.companyLegalName}</Text>
            <Text style={styles.subtitle}>{model.documentSubtitle}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.sectionLabel}>Estimate details</Text>
            <View style={styles.metaRow}><Text>Estimate no.</Text><Text>{model.proposalNumber}</Text></View>
            <View style={styles.metaRow}><Text>Date</Text><Text>{model.proposalDate}</Text></View>
            {model.expirationDate ? <View style={styles.metaRow}><Text>Expires</Text><Text>{model.expirationDate}</Text></View> : null}
            {model.providerPreparedBy ? <View style={styles.metaRow}><Text>Prepared by</Text><Text>{model.providerPreparedBy}</Text></View> : null}
          </View>
        </View>

        <View style={styles.sectionGrid}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Estimate from</Text>
            {model.providerLines.map((line) => <Text key={line} style={styles.line}>{line}</Text>)}
          </View>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Bill to</Text>
            {model.billToLines.map((line) => <Text key={line} style={styles.line}>{line}</Text>)}
          </View>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Ship to</Text>
            {model.shipToLines.map((line) => <Text key={line} style={styles.line}>{line}</Text>)}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.cellNumber}>#</Text>
            <Text style={styles.cellItem}>Product or service</Text>
            <Text style={styles.cellDescription}>Description</Text>
            <Text style={styles.cellQty}>Qty</Text>
            <Text style={styles.cellSchedule}>Schedule</Text>
            <Text style={styles.cellRate}>Rate</Text>
            <Text style={styles.cellAmount}>Amount</Text>
          </View>
          {model.lineItems.map((item) => (
            <View style={styles.tableRow} key={item.id}>
              <Text style={styles.cellNumber}>{item.sequence}.</Text>
              <Text style={styles.cellItem}>{item.label}</Text>
              <Text style={styles.cellDescription}>{item.description || "-"}</Text>
              <Text style={styles.cellQty}>{item.quantity ?? "-"}{item.unit ? ` ${item.unit}` : ""}</Text>
              <Text style={styles.cellSchedule}>{item.schedule === "monthly" ? "Monthly" : "One-time"}</Text>
              <Text style={styles.cellRate}>{formatCurrency(item.rate, currencyCode)}</Text>
              <Text style={styles.cellAmount}>{formatCurrency(item.amount, currencyCode)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.lowerGrid}>
          <View style={styles.notesCard}>
            {model.noteParagraphs.length ? (
              <>
                <Text style={styles.sectionLabel}>Note to customer</Text>
                {model.noteParagraphs.map((paragraph) => <Text key={paragraph} style={styles.line}>{paragraph}</Text>)}
              </>
            ) : null}
            {model.paymentTerms ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: model.noteParagraphs.length ? 12 : 0 }]}>Payment terms</Text>
                <Text style={styles.line}>{model.paymentTerms}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.totalsCard}>
            <Text style={styles.sectionLabel}>Totals</Text>
            <View style={styles.totalRow}><Text>Subtotal</Text><Text>{formatCurrency(model.subtotal, currencyCode)}</Text></View>
            <View style={styles.totalRow}><Text>Sales tax</Text><Text>{formatCurrency(model.salesTaxAmount, currencyCode)}</Text></View>
            <View style={[styles.totalRow, styles.totalGrand]}><Text>Total</Text><Text>{formatCurrency(model.total, currencyCode)}</Text></View>
          </View>
        </View>

        <View style={styles.signatureCard}>
          <Text style={styles.sectionLabel}>{model.signatureHeading}</Text>
          <Text style={styles.line}>{model.signatureNote || "Sign below to indicate acceptance of this estimate."}</Text>
          <View style={styles.signatureGrid}>
            {["Signature", "Customer name", "Date"].map((label) => (
              <View style={styles.signatureField} key={label}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

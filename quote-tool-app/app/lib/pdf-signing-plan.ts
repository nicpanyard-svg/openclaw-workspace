import type { QuoteRecord } from "@/app/lib/quote-record";

export type PdfSigningFieldType = "signature" | "text" | "date";

export type PdfSigningFieldSpec = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  label: string;
  type: PdfSigningFieldType;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  toolTip?: string;
};

export type PdfSigningPlan = {
  strategy: "server-rendered-pdf-plus-acroform";
  outputName: string;
  editableFields: PdfSigningFieldSpec[];
  lockedDocument: true;
  finalPageApprovalBlock: {
    pageIndex: -1;
    anchor: "approval-block";
    coordinateSpace: "pdf-points-from-bottom-left";
    pageSize: {
      width: 612;
      height: 792;
    };
    notes: string[];
  };
  implementationNotes: {
    currentPocScope: string[];
    nextTechnicalStep: string;
    recommendedLibraries: string[];
    digitalSigningRealityCheck: string[];
  };
  notes: string[];
};

/**
 * Narrow planning utility for a signable RapidQuote PDF.
 *
 * Intent:
 * - render the proposal itself as static PDF content
 * - leave only the customer approval area interactive
 * - keep this in the document-generation lane without introducing
 *   workflow/orchestration concerns
 *
 * This is still a POC contract, not the final signing pipeline.
 */
export function buildPdfSigningPlan(quote: QuoteRecord): PdfSigningPlan {
  const signatureLabel = quote.approval.signatureLabel || "Signature";
  const customerNameLabel = quote.approval.customerNameLabel || "Customer Name";
  const dateLabel = quote.approval.dateLabel || "Date";

  return {
    strategy: "server-rendered-pdf-plus-acroform",
    outputName: `${quote.metadata.proposalNumber || "proposal"}-signable.pdf`,
    editableFields: [
      {
        pageIndex: -1,
        x: 72,
        y: 122,
        width: 180,
        height: 28,
        name: "customer_signature",
        label: signatureLabel,
        type: "signature",
        required: true,
        placeholder: "Customer applies PDF signature here",
        toolTip: "Primary customer signature field",
      },
      {
        pageIndex: -1,
        x: 270,
        y: 122,
        width: 180,
        height: 24,
        name: "customer_name",
        label: customerNameLabel,
        type: "text",
        required: true,
        placeholder: "Printed customer name",
        toolTip: "Customer printed name",
      },
      {
        pageIndex: -1,
        x: 468,
        y: 122,
        width: 72,
        height: 24,
        name: "signature_date",
        label: dateLabel,
        type: "date",
        required: true,
        placeholder: "MM/DD/YYYY",
        toolTip: "Signature date",
      },
    ],
    lockedDocument: true,
    finalPageApprovalBlock: {
      pageIndex: -1,
      anchor: "approval-block",
      coordinateSpace: "pdf-points-from-bottom-left",
      pageSize: {
        width: 612,
        height: 792,
      },
      notes: [
        "pageIndex = -1 means resolve these fields against the final page approval block after pagination is finalized.",
        "Coordinates are intentionally aligned to the existing 8.5 x 11 proposal layout so the PDF pass can map UI layout to AcroForm rectangles.",
        "All non-approval content should be flattened/static in the output PDF.",
      ],
    },
    implementationNotes: {
      currentPocScope: [
        "Generate a PDF with static proposal content and only three live AcroForm fields in the approval area.",
        "Do not add workflow, routing, or remote e-sign ceremony behavior.",
        "Treat signature support as PDF-viewer-native signing where available.",
      ],
      nextTechnicalStep:
        "Add a server-side PDF generation route that renders the proposal as PDF, overlays these three AcroForm fields on the final page, and marks the rest of the document read-only/flattened.",
      recommendedLibraries: [
        "@react-pdf/renderer or headless browser print-to-PDF for the static document render",
        "pdf-lib for AcroForm field placement and read-only flags",
      ],
      digitalSigningRealityCheck: [
        "A fillable signature field is not the same thing as a cryptographically applied digital certificate signature.",
        "True certificate-backed digital signing usually needs either a dedicated signing service or a certificate-handling pipeline after PDF generation.",
        "For this POC, the realistic target is a PDF that exposes a signature field Adobe/other viewers can sign, while keeping the rest of the document non-editable.",
      ],
    },
    notes: [
      "All proposal content should render as static PDF content.",
      "Only the approval area should remain interactive/fillable.",
      "This output contract is designed so Jill can keep owning product/UI while engineering tests the PDF generation lane behind it.",
    ],
  };
}

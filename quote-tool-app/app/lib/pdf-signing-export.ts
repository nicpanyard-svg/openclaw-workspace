import type { QuoteRecord } from "@/app/lib/quote-record";
import type { PdfSigningFieldSpec, PdfSigningPlan } from "@/app/lib/pdf-signing-plan";

export type PdfFieldRect = {
  left: number;
  bottom: number;
  width: number;
  height: number;
};

export type ResolvedPdfSigningField = PdfSigningFieldSpec & {
  pageIndex: number;
  rect: PdfFieldRect;
};

export type PdfExportContract = {
  fileName: string;
  strategy: PdfSigningPlan["strategy"];
  sourceDocumentUrl: string;
  proposalNumber: string;
  lockedDocument: true;
  interactivePageIndexes: number[];
  finalPageIndex: number;
  pageSize: PdfSigningPlan["finalPageApprovalBlock"]["pageSize"];
  coordinateSpace: PdfSigningPlan["finalPageApprovalBlock"]["coordinateSpace"];
  fields: ResolvedPdfSigningField[];
  implementationNotes: PdfSigningPlan["implementationNotes"];
  notes: string[];
};

export type BuildPdfExportContractOptions = {
  proposalPath?: string;
  origin?: string;
  finalPageIndex?: number;
};

function normalizeOrigin(origin?: string) {
  if (!origin) return "http://localhost:3000";
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

function normalizePath(path?: string) {
  if (!path) return "/proposal?print=1";
  return path.startsWith("/") ? path : `/${path}`;
}

function toFieldRect(field: PdfSigningFieldSpec): PdfFieldRect {
  return {
    left: field.x,
    bottom: field.y,
    width: field.width,
    height: field.height,
  };
}

function resolveFieldPageIndex(field: PdfSigningFieldSpec, finalPageIndex: number) {
  return field.pageIndex === -1 ? finalPageIndex : field.pageIndex;
}

export function resolvePdfSigningFields(plan: PdfSigningPlan, finalPageIndex: number): ResolvedPdfSigningField[] {
  return plan.editableFields.map((field) => ({
    ...field,
    pageIndex: resolveFieldPageIndex(field, finalPageIndex),
    rect: toFieldRect(field),
  }));
}

export function buildPdfExportContract(
  quote: QuoteRecord,
  plan: PdfSigningPlan,
  options: BuildPdfExportContractOptions = {},
): PdfExportContract {
  const finalPageIndex = options.finalPageIndex ?? 0;
  const sourceDocumentUrl = `${normalizeOrigin(options.origin)}${normalizePath(options.proposalPath)}`;
  const fields = resolvePdfSigningFields(plan, finalPageIndex);
  const interactivePageIndexes = Array.from(new Set(fields.map((field) => field.pageIndex))).sort((a, b) => a - b);

  return {
    fileName: plan.outputName,
    strategy: plan.strategy,
    sourceDocumentUrl,
    proposalNumber: quote.metadata.proposalNumber || "proposal",
    lockedDocument: true,
    interactivePageIndexes,
    finalPageIndex,
    pageSize: plan.finalPageApprovalBlock.pageSize,
    coordinateSpace: plan.finalPageApprovalBlock.coordinateSpace,
    fields,
    implementationNotes: plan.implementationNotes,
    notes: [
      ...plan.notes,
      `Resolve pageIndex -1 to the generated PDF final page index (${finalPageIndex}).`,
      "Render the proposal as a static PDF first, then overlay only these AcroForm fields.",
      "Keep this contract document-generation-only; do not add approval workflow state here.",
    ],
  };
}

export function buildProposalPdfUrl(proposalPath?: string, origin?: string) {
  return `${normalizeOrigin(origin)}${normalizePath(proposalPath)}`;
}

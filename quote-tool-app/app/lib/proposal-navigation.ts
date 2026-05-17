export function buildProposalPreviewPath(proposalId?: string | null) {
  if (!proposalId) return "/proposal";
  return `/proposal?proposalId=${encodeURIComponent(proposalId)}`;
}

export function buildProposalPrintPath(proposalId?: string | null) {
  if (!proposalId) return "/proposal/print";
  return `/proposal/print?proposalId=${encodeURIComponent(proposalId)}`;
}

export function buildProposalPdfPreviewPath(proposalId?: string | null) {
  const printPath = buildProposalPrintPath(proposalId);
  return `${printPath}${printPath.includes("?") ? "&" : "?"}pdfPreview=1`;
}

export function buildProposalNotFoundPath(proposalId?: string | null) {
  if (!proposalId) return "/proposals/not-found";
  return `/proposals/not-found?proposalId=${encodeURIComponent(proposalId)}`;
}

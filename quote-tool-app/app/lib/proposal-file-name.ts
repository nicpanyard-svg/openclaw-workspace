import type { QuoteRecord } from "@/app/lib/quote-record";

function fileNamePart(value: string | undefined, maxBytes: number) {
  const clean = (value ?? "").normalize("NFC").replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "").replace(/[<>:"/\\|?*]/g, "-");
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of clean) {
    bytes += encoder.encode(character).length;
    if (bytes > maxBytes) break;
    result += character;
  }
  return result.replace(/^[. -]+|[. -]+$/g, "");
}

export function buildProposalPdfFileName(quote: QuoteRecord) {
  const customer = quote.customer.name?.trim() || quote.metadata.accountName?.trim() || quote.metadata.customerShortName;
  const title = quote.metadata.documentTitle?.trim()
    || (quote.metadata.workflowMode === "major_project" ? quote.majorProject?.summary.projectName : "");
  // Reserve space for the quote number even when customer names or titles are long.
  const parts = [fileNamePart(customer, 70), fileNamePart(title, 100), fileNamePart(quote.metadata.proposalNumber, 50)];
  let name = parts.filter(Boolean).join(" - ") || "proposal";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = "_" + name;
  return name + ".pdf";
}

export function buildProposalPdfContentDisposition(quote: QuoteRecord) {
  const fileName = buildProposalPdfFileName(quote);
  const fallback = fileName.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7e]/g, "-");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

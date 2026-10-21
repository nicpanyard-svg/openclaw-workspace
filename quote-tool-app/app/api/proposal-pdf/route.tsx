import { missingProcessingRequirements } from "@/app/lib/processing-requirements";
import { NextResponse } from "next/server";
import {
  cacheProposalPdfQuote,
  cleanupCachedProposalPdfQuote,
} from "@/app/lib/proposal-pdf-cache";
import { renderHtmlPdf } from "@/app/lib/proposal-html-pdf";
import { buildProposalPdfContentDisposition } from "@/app/lib/proposal-file-name";
import { buildMajorProjectMetrics } from "@/app/lib/major-project";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { apiErrorResponse, ApiInputError, readJsonBody } from "@/app/lib/api-input";
import { checkServerAccess, getPdfOrigin } from "@/app/lib/server-access";
import {
  PROPOSAL_STORAGE_FALLBACK_KEY,
  PROPOSAL_STORAGE_KEY,
  serializeQuoteRecord,
  deserializeQuoteRecord,
} from "@/app/lib/proposal-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = checkServerAccess(request);
  if (denied) return denied;
  try {
    const body = (await readJsonBody(request)) as { quote?: QuoteRecord; proposalId?: string | null } | null;
    const quote = body?.quote && deserializeQuoteRecord(JSON.stringify(body.quote));
    if (!body || (body.proposalId !== undefined && body.proposalId !== null && typeof body.proposalId !== "string")) throw new ApiInputError("Invalid proposal payload.");
    const proposalId = body.proposalId ?? null;

    if (!quote) {
      return NextResponse.json({ error: "Missing quote payload." }, { status: 400 });
    }

    const quoteProposalId = quote.internal?.savedProposalId ?? quote.internal?.quoteId ?? null;
    if (proposalId && quoteProposalId && proposalId !== quoteProposalId) {
      return NextResponse.json({ error: "Requested proposal does not match the export payload." }, { status: 400 });
    }

    if (quote.metadata.workflowMode === "major_project" && quote.majorProject?.enabled) {
      const billingIssues = buildMajorProjectMetrics(quote).validation.issues.filter((issue) => issue.code === "mixed_annual_billing");
      if (billingIssues.length) return NextResponse.json({ error: billingIssues.map((issue) => issue.message).join(" ") }, { status: 400 });
    }

    const missingFields = missingProcessingRequirements(quote);
    if (missingFields.length) return NextResponse.json({ error: "Complete required quote information before creating the quote.", missingFields }, { status: 422 });

    const origin = getPdfOrigin(request);
    const serializedQuote = serializeQuoteRecord(quote);
    const token = await cacheProposalPdfQuote(quote, proposalId ?? quoteProposalId);

    try {
      const pdf = await renderHtmlPdf(
        `${origin}/proposal/print?autoprint=0&pdf=1&token=${encodeURIComponent(token)}&proposalId=${encodeURIComponent(proposalId ?? quoteProposalId ?? "")}`,
        undefined,
        {
          localStorage: {
            [PROPOSAL_STORAGE_FALLBACK_KEY]: serializedQuote,
          },
          sessionStorage: {
            [PROPOSAL_STORAGE_KEY]: serializedQuote,
          },
        },
      );
      return new NextResponse(Buffer.from(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": buildProposalPdfContentDisposition(quote),
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await cleanupCachedProposalPdfQuote(token);
    }
  } catch (error) {
    return apiErrorResponse(error, "generate the proposal PDF");
  }
}

import { NextResponse } from "next/server";
import {
  buildProposalPdfFileName,
  cacheProposalPdfQuote,
  cleanupCachedProposalPdfQuote,
} from "@/app/lib/proposal-pdf-cache";
import { renderHtmlPdf } from "@/app/lib/proposal-html-pdf";
import type { QuoteRecord } from "@/app/lib/quote-record";
import {
  PROPOSAL_STORAGE_FALLBACK_KEY,
  PROPOSAL_STORAGE_KEY,
  serializeQuoteRecord,
} from "@/app/lib/proposal-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { quote?: QuoteRecord; proposalId?: string | null };
    const quote = body.quote;
    const proposalId = body.proposalId ?? null;

    if (!quote) {
      return NextResponse.json({ error: "Missing quote payload." }, { status: 400 });
    }

    const quoteProposalId = quote.internal?.savedProposalId ?? quote.internal?.quoteId ?? null;
    if (proposalId && quoteProposalId && proposalId !== quoteProposalId) {
      return NextResponse.json({ error: "Requested proposal does not match the export payload." }, { status: 400 });
    }

    const requestUrl = new URL(request.url);
    const serializedQuote = serializeQuoteRecord(quote);
    const token = await cacheProposalPdfQuote(quote, proposalId ?? quoteProposalId);

    try {
      const pdf = await renderHtmlPdf(
        `${requestUrl.origin}/proposal/print?autoprint=0&pdf=1&token=${encodeURIComponent(token)}&proposalId=${encodeURIComponent(proposalId ?? quoteProposalId ?? "")}`,
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
      const fileName = buildProposalPdfFileName(quote);

      return new NextResponse(Buffer.from(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await cleanupCachedProposalPdfQuote(token);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate proposal PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import {
  buildProposalPdfFileName,
  cacheProposalPdfQuote,
  cleanupCachedProposalPdfQuote,
} from "@/app/lib/proposal-pdf-cache";
import type { QuoteRecord } from "@/app/lib/quote-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let token: string | null = null;

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

    token = await cacheProposalPdfQuote(quote, proposalId ?? quoteProposalId);

    const { renderHtmlPdf } = await import("@/app/lib/proposal-html-pdf");
    const requestUrl = new URL(request.url);
    const proposalPrintUrl = `${requestUrl.origin}/proposal/print?token=${encodeURIComponent(token)}&autoprint=0&pdf=1${proposalId || quoteProposalId ? `&proposalId=${encodeURIComponent(proposalId ?? quoteProposalId ?? "")}` : ""}`;
    const pdf = await renderHtmlPdf(proposalPrintUrl);
    const fileName = buildProposalPdfFileName(quote);

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate proposal PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await cleanupCachedProposalPdfQuote(token);
  }
}

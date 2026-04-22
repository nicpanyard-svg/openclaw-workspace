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
    const body = (await request.json()) as { quote?: QuoteRecord };
    const quote = body.quote;

    if (!quote) {
      return NextResponse.json({ error: "Missing quote payload." }, { status: 400 });
    }

    token = await cacheProposalPdfQuote(quote);

    const { renderHtmlPdf } = await import("@/app/lib/proposal-html-pdf");
    const requestUrl = new URL(request.url);
    const proposalPrintUrl = `${requestUrl.origin}/proposal/print?token=${encodeURIComponent(token)}&autoprint=0&pdf=1`;
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

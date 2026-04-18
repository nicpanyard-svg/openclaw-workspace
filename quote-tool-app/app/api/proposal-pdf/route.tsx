import { NextResponse } from "next/server";
import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
import { renderHtmlPdf } from "@/app/lib/proposal-html-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { quote?: unknown; download?: boolean };
    const parsedQuote = deserializeQuoteRecord(body.quote ? JSON.stringify(body.quote) : null);
    const quote = parsedQuote ?? sampleQuoteRecord;
    const payload = encodeURIComponent(JSON.stringify(quote));
    const previewUrl = new URL(`/proposal/print?quote=${payload}&mode=pdf`, request.url);
    const pdfBuffer = await renderHtmlPdf(previewUrl.toString());
    const fileName = `${quote.metadata.proposalNumber || "proposal"}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${body.download ? "attachment" : "inline"}; filename=\"${fileName}\"`,
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    console.error("Failed to generate proposal PDF", error);
    return NextResponse.json({ error: "Failed to generate proposal PDF" }, { status: 500 });
  }
}

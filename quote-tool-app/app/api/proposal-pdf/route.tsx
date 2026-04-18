import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ProposalPdfDocument } from "@/app/components/proposal-pdf-document";
import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { quote?: unknown; download?: boolean };
    const parsedQuote = deserializeQuoteRecord(body.quote ? JSON.stringify(body.quote) : null);
    const quote = parsedQuote ?? sampleQuoteRecord;
    const pdfBuffer = await renderToBuffer(<ProposalPdfDocument quote={quote} />);
    const fileName = `${quote.metadata.proposalNumber || "proposal"}.pdf`;
    const pdfBytes = new Uint8Array(pdfBuffer);

    return new NextResponse(pdfBytes, {
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

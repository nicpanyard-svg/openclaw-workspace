import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { quote?: unknown; download?: boolean };
    const parsedQuote = deserializeQuoteRecord(body.quote ? JSON.stringify(body.quote) : null);
    const quote = parsedQuote ?? sampleQuoteRecord;
    const cssPath = join(process.cwd(), "app", "globals.css");
    const cssText = await readFile(cssPath, "utf8");
    const payload = encodeURIComponent(JSON.stringify(quote));
    const previewUrl = new URL(`/proposal/print?quote=${payload}&mode=pdf`, request.url);
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        deviceScaleFactor: 1,
        viewport: {
          width: 1400,
          height: 1800,
        },
      });

      await page.route("**/app/globals.css", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/css; charset=utf-8",
          body: cssText,
        });
      });

      await page.goto(previewUrl.toString(), { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });

      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
      });

      await page.close();
      const fileName = `${quote.metadata.proposalNumber || "proposal"}.pdf`;

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${body.download ? "attachment" : "inline"}; filename=\"${fileName}\"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error("Failed to generate proposal PDF", error);
    return NextResponse.json({ error: "Failed to generate proposal PDF" }, { status: 500 });
  }
}

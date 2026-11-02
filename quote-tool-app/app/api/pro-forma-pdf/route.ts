import fs from "node:fs/promises";
import path from "node:path";
import { ApiInputError, apiErrorResponse, readJsonBody } from "@/app/lib/api-input";
import { checkServerAccess } from "@/app/lib/server-access";
import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import { buildProFormaFileName, buildProFormaInvoice } from "@/app/lib/pro-forma";
import { buildProFormaHtml } from "@/app/lib/pro-forma-html";
import { renderHtmlContentPdf } from "@/app/lib/proposal-html-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = checkServerAccess(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request) as { quote?: unknown } | null;
    const quote = body?.quote ? deserializeQuoteRecord(JSON.stringify(body.quote)) : null;
    if (!quote) throw new ApiInputError("Missing or invalid quote payload.");
    const invoice = buildProFormaInvoice(quote);
    if (invoice.errors.length) return Response.json({ error: "Complete the invoice and quote details before exporting.", missingFields: invoice.errors }, { status: 422 });
    // Use only the configured company asset. No user-provided remote URL reaches Chromium.
    const logoPath = invoice.logoSrc === "/ilios-logo.svg"
      ? path.join(process.cwd(), "public/ilios-logo.svg")
      : path.join(process.cwd(), "public/inet-logo.png");
    const logoBytes = await fs.readFile(logoPath);
    const mime = invoice.logoSrc.endsWith(".svg") ? "image/svg+xml" : "image/png";
    const html = buildProFormaHtml(invoice, `data:${mime};base64,${logoBytes.toString("base64")}`);
    const pdf = await renderHtmlContentPdf(html, {
      margin: { top: "32px", right: "36px", bottom: "48px", left: "36px" },
      displayHeaderFooter: true, headerTemplate: '<div style="width:100%;text-align:right;padding-right:36px;font:8px Arial;color:#65717a">PRO FORMA INVOICE</div>',
      footerTemplate: '<div style="width:100%;text-align:center;font:9px Arial;color:#65717a">Pro Forma Invoice | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    });
    const name = buildProFormaFileName(quote);
    const fallback = name.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7e]/g, "-");
    const encoded = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(Buffer.from(pdf), { headers: {
      "Content-Type": "application/pdf", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    } });
  } catch (error) { return apiErrorResponse(error, "generate the pro forma invoice PDF"); }
}

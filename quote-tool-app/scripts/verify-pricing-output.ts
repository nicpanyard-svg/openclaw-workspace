import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { proFormaFixture } from "./pro-forma-fixtures";
import { finalReviewKey } from "../app/lib/final-quote-review";

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const output = path.resolve(`tmp/pricing-output-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const quote = proFormaFixture();
  quote.sections.sectionB.lineItems[0].priceStatus = "allowance";
  quote.sections.sectionC.lineItems.push({ id: "included", sourceType: "custom", description: "Included configuration", quantity: 1, unitPrice: 0, totalPrice: 0, priceStatus: "included" });
  quote.sections.sectionB.lineItems.push({ id: "tbd-option", sourceType: "custom", itemName: "Optional controller awaiting price", quantity: 1, unitPrice: 0, totalPrice: 0, optional: true, priceStatus: "tbd" });
  quote.customerOutput!.commercialConfirmation = finalReviewKey(quote);
  for (const route of ["proposal-pdf", "pro-forma-pdf"]) {
    const payload = structuredClone(quote);
    // This fixture's pro forma-only sentinel lives in a customer-visible service description.
    if (route === "proposal-pdf") payload.sections.sectionA.poolRows[0].includedText = ["Network monitoring"];
    const response = await fetch(new URL(`/api/${route}`, base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote: payload }) });
    if (!response.ok) throw new Error(`${route}: ${response.status} ${await response.text()}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(path.join(output, `${route}.pdf`), bytes);
    const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    let text = "";
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => "str" in item ? item.str : "").join(" ");
      text += `${pageText}\n`;
      if (/Included configuration|Optional controller awaiting price/.test(pageText)) {
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext("2d"), viewport } as never).promise;
        await writeFile(path.join(output, `${route}-page-${index}.png`), canvas.toBuffer("image/png"));
      }
    }
    assert.match(text, /Allowance/);
    assert.match(text, /Included configuration/);
    assert.doesNotMatch(text, /INTERNAL_COST_SECRET|Pricing needs review|Draft pricing is incomplete/);
    if (route === "proposal-pdf") {
      assert.match(text, /Optional controller awaiting price/);
      assert.match(text, /TBD/);
    } else {
      assert.match(text, /2,692\.25/);
      assert.doesNotMatch(text, /Sales signature|Accounting signature/);
    }
    await writeFile(path.join(output, `${route}.txt`), text);
    await pdf.destroy();
  }
  console.log(`Pricing PDF checks passed: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

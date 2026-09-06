import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { degrees, PDFDocument, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderProposalPdfPreview, type ProposalPreviewPage } from "./proposal-pdf-preview";

function installCanvas(t: TestContext, failEncoding = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvases: Array<{ width: number; height: number }> = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => {
    const canvas = createCanvas(1, 1);
    canvases.push(canvas);
    return Object.assign(canvas, { toBlob: (done: (blob: Blob | null) => void) => done(failEncoding ? null : new Blob([new Uint8Array(canvas.toBuffer("image/png"))], { type: "image/png" })) });
  } } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return canvases;
}

async function fixture() {
  const source = await PDFDocument.create();
  const portrait = source.addPage([612, 792]);
  portrait.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.8, 0.1, 0.2) });
  const rotated = source.addPage([612, 792]);
  rotated.setRotation(degrees(90));
  rotated.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.1, 0.7, 0.3) });
  const large = source.addPage([4000, 2000]);
  large.drawRectangle({ x: 0, y: 0, width: 4000, height: 2000, color: rgb(0.1, 0.3, 0.8) });
  return getDocument({ data: await source.save() }).promise;
}

test("renders every actual PDF page in order with correct rotation and bounded dimensions", async (t) => {
  const canvases = installCanvas(t);
  const document = await fixture();
  t.after(() => document.destroy());
  const pages: ProposalPreviewPage[] = [];
  await renderProposalPdfPreview(document, new AbortController().signal, (page) => pages.push(page));
  assert.deepEqual(pages.map((page) => [page.pageNumber, page.pageCount]), [[1, 3], [2, 3], [3, 3]]);
  assert.ok(pages[0].width < pages[0].height);
  assert.ok(pages[1].width > pages[1].height);
  assert.equal(pages[2].width / pages[2].height, 2);
  for (const [index, page] of pages.entries()) {
    assert.equal(page.blob.type, "image/png");
    assert.ok(page.width * page.height <= 2_005_000);
    assert.ok(Math.max(page.width, page.height) <= 2400);
    const image = await loadImage(Buffer.from(await page.blob.arrayBuffer()));
    const canvas = createCanvas(page.width, page.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    assert.ok(ctx.getImageData(20, 20, 1, 1).data[index] > 150, `page ${index + 1} should retain its source color`);
  }
  assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});

test("cancelling after a page prevents publishing subsequent pages", async (t) => {
  const canvases = installCanvas(t);
  const document = await fixture();
  t.after(() => document.destroy());
  const controller = new AbortController();
  const pages: number[] = [];
  await assert.rejects(renderProposalPdfPreview(document, controller.signal, (page) => {
    pages.push(page.pageNumber);
    controller.abort();
  }), { name: "AbortError" });
  assert.deepEqual(pages, [1]);
  assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});

test("an already cancelled preview does not allocate canvases", async (t) => {
  const canvases = installCanvas(t);
  const document = await fixture();
  t.after(() => document.destroy());
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(renderProposalPdfPreview(document, controller.signal, () => assert.fail("No page should be published")), { name: "AbortError" });
  assert.equal(canvases.length, 0);
});

test("failed encoding reports the error and releases the page canvas", async (t) => {
  const canvases = installCanvas(t, true);
  const document = await fixture();
  t.after(() => document.destroy());
  await assert.rejects(renderProposalPdfPreview(document, new AbortController().signal, () => assert.fail("No page should be published")), /Could not render the spec sheet page/);
  assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});

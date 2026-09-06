import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyMajorProjectToQuote } from "./major-project";
import { getProposalAttachments } from "./proposal-attachments";
import { assembleFinalProposalPdf, ProposalPdfAssemblyError } from "./proposal-spec-pdf-assembly";
import type { MajorProjectSpecAttachment } from "./quote-record";
import { createBlankQuoteRecord } from "./quote-template";

function file(storageKey: string, mimeType = "application/pdf", fileName = `${storageKey}.pdf`): MajorProjectSpecAttachment {
  return { storageKey, fileName, mimeType, sizeBytes: 100, updatedAt: "2026-09-05T00:00:00.000Z" };
}

function drawingQuote(attachments: MajorProjectSpecAttachment[]) {
  const quote = createBlankQuoteRecord();
  quote.majorProject.summary.systemDrawings = attachments;
  return quote;
}

async function pdfBlob(document: PDFDocument) {
  return new Blob([new Uint8Array(await document.save())], { type: "application/pdf" });
}

async function makePdf(labels: string[], size: [number, number] = [612, 792]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.setTitle("Commercial content remains intact");
  labels.forEach((label, index) => {
    const page = document.addPage(size);
    page.drawText(label, { x: 50 + index, y: size[1] - 100, size: 18, font });
    page.drawRectangle({ x: 40, y: 80, width: 70, height: 90, color: rgb(0.8, 0.1, 0.2) });
  });
  return pdfBlob(document);
}

async function readPdf(blob: Blob) {
  return getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true }).promise;
}

async function textPages(blob: Blob) {
  const document = await readPdf(blob);
  try {
    const pages = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const content = await (await document.getPage(index)).getTextContent();
      pages.push(content.items.filter((item) => "str" in item).map((item) => ({ text: item.str, transform: item.transform, width: item.width, height: item.height })));
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

test("preserves every commercial page, then appends deduplicated specs and drawings in exact index order", async () => {
  const quote = createBlankQuoteRecord();
  const option = quote.majorProject.options[0];
  option.components = [];
  option.bundles = [];
  option.customerQuoteLines = [];
  option.simpleRows = ["second", "first", "second"].map((key, index) => ({
    id: `item-${index}`, label: `Item ${index}`, bucket: "hardware", quantity: 1,
    customerUnitPrice: 100, customerExtendedPrice: 100, ourUnitCost: 10, ourExtendedCost: 10, specSheetAttachment: file(key),
  }));
  quote.majorProject.summary.systemDrawings = [file("drawing"), file("first"), file("drawing")];
  const outputQuote = applyMajorProjectToQuote(quote);
  const base = await makePdf(["COVER", "COMMERCIAL", "APPENDIX INDEX"]);
  const files = new Map([
    ["second", await makePdf(["SPEC SECOND PAGE 1", "SPEC SECOND PAGE 2"], [1000, 500])],
    ["first", await makePdf(["SPEC FIRST"])],
    ["drawing", await makePdf(["SYSTEM DRAWING"])],
  ]);
  const calls: string[] = [];
  const result = await assembleFinalProposalPdf(base, outputQuote, {
    loadAttachment: async (key) => {
      calls.push(key);
      if (key === "second") await new Promise((resolve) => setTimeout(resolve, 10));
      return files.get(key);
    },
    proposalId: "QUOTE-123",
  });
  assert.equal(result.type, "application/pdf");
  assert.deepEqual(calls, ["second", "first", "drawing"]);
  assert.deepEqual(getProposalAttachments(outputQuote).map((entry) => entry.id), ["A1", "A2", "A3"]);
  const before = await textPages(base);
  const pages = await textPages(result);
  assert.equal(pages.length, 7);
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(pages[index].filter((item) => item.text && !item.text.startsWith("Page ") && item.text !== "QUOTE-123"), before[index].filter((item) => item.text));
  }
  const sourceLabels = ["COVER", "COMMERCIAL", "APPENDIX INDEX", "SPEC SECOND PAGE 1", "SPEC SECOND PAGE 2", "SPEC FIRST", "SYSTEM DRAWING"];
  pages.forEach((items, index) => {
    assert.ok(items.some((item) => item.text === sourceLabels[index]));
    assert.deepEqual(items.filter((item) => /^Page \d+ of \d+$/.test(item.text)).map((item) => item.text), [`Page ${index + 1} of 7`]);
    assert.ok(items.some((item) => item.text === "QUOTE-123"));
    assert.equal(items.find((item) => item.text === `Page ${index + 1} of 7`)!.transform[5], 18);
  });
  assert.ok(pages[3].some((item) => item.text === "A1 - Specification - second.pdf"));
  assert.ok(pages[4].some((item) => item.text === "2/2"));
  assert.ok(pages[5].some((item) => item.text === "A2 - Specification - first.pdf"));
  assert.ok(pages[6].some((item) => item.text === "A3 - System drawing - drawing.pdf"));
  const loaded = await PDFDocument.load(await result.arrayBuffer());
  assert.equal(loaded.getTitle(), "Commercial content remains intact");
  assert.deepEqual(loaded.getPages().map((page) => page.getSize()), Array(7).fill({ width: 612, height: 792 }));
});

test("no attachments still finalizes all numbers without touching base page sizes, rotations, or content", async () => {
  const original = await PDFDocument.load(await (await makePdf(["ILIOS ESTIMATE", "ESTIMATE TOTAL"])).arrayBuffer());
  original.getPage(1).setSize(792, 612);
  original.getPage(1).setRotation(degrees(90));
  const base = await pdfBlob(original);
  const result = await assembleFinalProposalPdf(base, createBlankQuoteRecord(), { loadAttachment: async () => assert.fail("must not load unassigned files") });
  const loaded = await PDFDocument.load(await result.arrayBuffer());
  assert.equal(loaded.getPageCount(), 2);
  assert.deepEqual(loaded.getPages().map((page) => [page.getMediaBox(), page.getRotation()]), original.getPages().map((page) => [page.getMediaBox(), page.getRotation()]));
  const before = await textPages(base);
  const after = await textPages(result);
  after.forEach((items, index) => {
    assert.deepEqual(items.filter((item) => item.text && !item.text.startsWith("Page ")), before[index].filter((item) => item.text));
    assert.deepEqual(items.filter((item) => item.text.startsWith("Page ")).map((item) => item.text), [`Page ${index + 1} of 2`]);
  });
});

test("loads every unique assigned file and reports all missing, unsupported, corrupt, and inaccessible names together", async () => {
  const attachments = [file("missing"), file("bad-pdf"), file("bad-png", "image/png", "bad.png"), file("bad-jpeg", "image/jpeg", "bad.jpg"),
    file("webp", "image/webp", "diagram.webp"), file("gif", "image/gif", "diagram.gif"), file("denied"), file("valid")];
  const quote = drawingQuote([...attachments, attachments[0]]);
  const valid = await makePdf(["VALID"]);
  const calls: string[] = [];
  await assert.rejects(assembleFinalProposalPdf(await makePdf(["BASE"]), quote, {
    loadAttachment: async (key) => {
      calls.push(key);
      if (key === "missing") return undefined;
      if (key === "denied") throw new Error("IndexedDB unavailable");
      if (key === "valid") return valid;
      return new Blob(["corrupt bytes"]);
    },
  }), (error: unknown) => {
    assert.ok(error instanceof ProposalPdfAssemblyError);
    assert.deepEqual(error.failures.map((failure) => failure.fileName), attachments.slice(0, -1).map((attachment) => attachment.fileName));
    assert.deepEqual(error.failures.map((failure) => failure.id), ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]);
    assert.match(error.failures[0].reason, /missing/);
    for (const index of [1, 2, 3]) assert.match(error.failures[index].reason, /corrupt/);
    for (const index of [4, 5]) assert.match(error.failures[index].reason, /unsupported.*convert GIF\/WebP/);
    assert.match(error.failures[6].reason, /could not be loaded/);
    attachments.slice(0, -1).forEach((attachment) => assert.ok(error.message.includes(attachment.fileName)));
    return true;
  });
  assert.deepEqual(calls, attachments.map((attachment) => attachment.storageKey));
});

test("an entirely missing appendix rejects instead of returning a commercial-only PDF", async () => {
  await assert.rejects(assembleFinalProposalPdf(await makePdf(["BASE"]), drawingQuote([file("missing")]), {
    loadAttachment: async () => undefined,
  }), /A1 - missing.pdf: missing file/);
});

test("a synchronous loader failure does not prevent checking the remaining files", async () => {
  const calls: string[] = [];
  await assert.rejects(assembleFinalProposalPdf(await makePdf(["BASE"]), drawingQuote([file("throws"), file("missing")]), {
    loadAttachment: (key) => {
      calls.push(key);
      if (key === "throws") throw new Error("Storage initialization failed");
      return Promise.resolve(undefined);
    },
  }), (error: unknown) => {
    assert.ok(error instanceof ProposalPdfAssemblyError);
    assert.deepEqual(error.failures.map((failure) => failure.fileName), ["throws.pdf", "missing.pdf"]);
    return true;
  });
  assert.deepEqual(calls, ["throws", "missing"]);
});

test("corrupt commercial PDF rejects clearly even without attachments", async () => {
  await assert.rejects(assembleFinalProposalPdf(new Blob(["not a PDF"]), createBlankQuoteRecord()), /commercial\/base PDF is corrupt or unreadable/);
});

test("valid blank attachment pages are preserved, not treated as failed embeds", async () => {
  const blank = await PDFDocument.create();
  blank.addPage([612, 792]);
  const result = await assembleFinalProposalPdf(await makePdf(["BASE"]), drawingQuote([file("blank")]), { loadAttachment: async () => pdfBlob(blank) });
  const pages = await textPages(result);
  assert.equal(pages.length, 2);
  assert.ok(pages[1].some((item) => item.text === "Page 2 of 2"));
  assert.ok(pages[1].some((item) => item.text === "A1 - System drawing - blank.pdf"));
});

test("rejects form/annotation PDFs rather than silently discarding visible field values", async () => {
  const annotated = await PDFDocument.create();
  const page = annotated.addPage();
  const field = annotated.getForm().createTextField("terminal");
  field.setText("Terminal 123");
  field.addToPage(page);
  await assert.rejects(assembleFinalProposalPdf(await makePdf(["BASE"]), drawingQuote([file("form")]), {
    loadAttachment: async () => pdfBlob(annotated),
  }), /form.pdf: unsupported PDF annotations; export a flattened PDF/);
});

for (const rotation of [0, 90, 180, 270]) {
  test(`fits complete offset-MediaBox PDF artwork at ${rotation} degrees inside the reserved margins`, async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([1000, 1400]);
    page.setMediaBox(100, 200, 1000, 1400);
    page.setCropBox(300, 400, 500, 600);
    page.setRotation(degrees(rotation));
    const points = [[105, 205, rgb(1, 0, 0)], [1065, 205, rgb(0, 1, 0)], [105, 1565, rgb(0, 0, 1)], [1065, 1565, rgb(1, 0, 1)]] as const;
    points.forEach(([x, y, color]) => page.drawRectangle({ x, y, width: 30, height: 30, color }));
    const result = await assembleFinalProposalPdf(await makePdf(["BASE"]), drawingQuote([file("large")]), { loadAttachment: async () => pdfBlob(source) });
    const document = await readPdf(result);
    try {
      const appended = await document.getPage(2);
      const canvas = createCanvas(612, 792);
      const context = canvas.getContext("2d");
      await appended.render({ canvas: null, canvasContext: context as unknown as CanvasRenderingContext2D, viewport: appended.getViewport({ scale: 1 }) }).promise;
      const pixels = context.getImageData(0, 0, 612, 792).data;
      const counts = [0, 0, 0, 0];
      const coordinateSums = Array.from({ length: 4 }, () => [0, 0]);
      for (let y = 0; y < 792; y += 1) {
        for (let x = 0; x < 612; x += 1) {
          const offset = (y * 612 + x) * 4;
          const [r, g, b] = pixels.slice(offset, offset + 3);
          const colorIndex = r > 240 && g < 15 && b < 15 ? 0 : r < 15 && g > 240 && b < 15 ? 1
            : r < 15 && g < 15 && b > 240 ? 2 : r > 240 && g < 15 && b > 240 ? 3 : -1;
          if (colorIndex < 0) continue;
          counts[colorIndex] += 1;
          coordinateSums[colorIndex][0] += x;
          coordinateSums[colorIndex][1] += y;
          assert.ok(x >= 36 && x < 576 && y >= 48 && y < 744, `source content escaped margin at ${x},${y}`);
        }
      }
      counts.forEach((count, index) => assert.ok(count > 80, `corner ${index} was lost or clipped (${count} pixels)`));
      const expectedQuadrants = rotation === 0 ? [[false, true], [true, true], [false, false], [true, false]]
        : rotation === 90 ? [[false, false], [false, true], [true, false], [true, true]]
          : rotation === 180 ? [[true, false], [false, false], [true, true], [false, true]]
            : [[true, true], [true, false], [false, true], [false, false]];
      assert.deepEqual(coordinateSums.map(([x, y], index) => [x / counts[index] > 306, y / counts[index] > 396]), expectedQuadrants);
    } finally {
      await document.destroy();
    }
  });
}

for (const format of ["png", "jpeg"] as const) {
  test(`appends ${format} at Letter size without cropping, with an attachment header and final number`, async () => {
    const canvas = createCanvas(800, 200);
    const context = canvas.getContext("2d");
    context.fillStyle = "#00ff00";
    context.fillRect(0, 0, 800, 200);
    const bytes = format === "png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg");
    const image = new Blob([new Uint8Array(bytes)], { type: `image/${format}` });
    const entry = file("image", `image/${format}`, `diagram.${format}`);
    const result = await assembleFinalProposalPdf(await makePdf(["BASE"]), drawingQuote([entry]), { loadAttachment: async () => image });
    const text = await textPages(result);
    assert.equal(text.length, 2);
    assert.ok(text[1].some((item) => item.text === `A1 - System drawing - diagram.${format}`));
    assert.ok(text[1].some((item) => item.text === "Page 2 of 2"));
    const document = await readPdf(result);
    try {
      const appended = await document.getPage(2);
      assert.deepEqual(appended.view, [0, 0, 612, 792]);
      const resultCanvas = createCanvas(612, 792);
      const resultContext = resultCanvas.getContext("2d");
      await appended.render({ canvas: null, canvasContext: resultContext as unknown as CanvasRenderingContext2D, viewport: appended.getViewport({ scale: 1 }) }).promise;
      for (const [x, y] of [[37, 330], [574, 330], [37, 461], [574, 461]]) {
        const [r, g, b] = resultContext.getImageData(x, y, 1, 1).data;
        assert.ok(r < 10 && g > 240 && b < 10, `missing image corner at ${x},${y}`);
      }
      assert.deepEqual(Array.from(resultContext.getImageData(306, 50, 1, 1).data), [255, 255, 255, 255]);
    } finally {
      await document.destroy();
    }
  });
}

test("long Unicode filenames do not crash or overlap the continuation label", async () => {
  const entry = file("unicode", "application/pdf", "\u8bbe\u5907-" + "Long attachment title ".repeat(30) + ".pdf");
  const result = await assembleFinalProposalPdf(await makePdf(["BASE"]), drawingQuote([entry]), { loadAttachment: async () => makePdf(["ARTWORK"]) });
  const text = (await textPages(result))[1];
  const header = text.find((item) => item.text.startsWith("A1 - "))!;
  const continuation = text.find((item) => item.text === "1/1")!;
  assert.match(header.text, /\.\.\.$/);
  assert.ok(header.transform[4] + header.width < continuation.transform[4]);
});

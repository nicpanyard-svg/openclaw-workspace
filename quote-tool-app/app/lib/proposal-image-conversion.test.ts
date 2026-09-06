import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { convertProposalImageToPng } from "./proposal-image-conversion";

function replaceGlobal(t: TestContext, name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
}

for (const format of ["webp", "gif"] as const) {
  for (const offscreen of [true, false]) {
    test(`decodes real ${format} pixels using the ${offscreen ? "offscreen" : "HTML"} canvas path`, async (t) => {
      const source = createCanvas(120, 60);
      const context = source.getContext("2d");
      context.fillStyle = "#c7192d";
      context.fillRect(0, 0, 60, 40);
      context.fillStyle = "#17a054";
      context.fillRect(60, 0, 60, 40);
      const bytes = format === "webp" ? source.encodeSync("webp", 100) : source.encodeSync("gif", 100);
      let closed = 0;
      replaceGlobal(t, "createImageBitmap", async (blob: Blob) => Object.assign(await loadImage(Buffer.from(await blob.arrayBuffer())), { close: () => { closed++; } }));
      class NativeCanvas {
        private canvas;
        constructor(width: number, height: number) { this.canvas = createCanvas(width, height); }
        getContext() { return this.canvas.getContext("2d"); }
        async convertToBlob() { return new Blob([new Uint8Array(this.canvas.toBuffer("image/png"))], { type: "image/png" }); }
      }
      replaceGlobal(t, "OffscreenCanvas", offscreen ? NativeCanvas : undefined);
      replaceGlobal(t, "document", { createElement: () => {
        const canvas = createCanvas(1, 1);
        return Object.assign(canvas, { toBlob: (done: (blob: Blob) => void) => done(new Blob([new Uint8Array(canvas.toBuffer("image/png"))], { type: "image/png" })) });
      } });
      const output = await convertProposalImageToPng(new Blob([new Uint8Array(bytes)], { type: "image/" + format }));
      assert.equal(output.type, "image/png");
      assert.equal(closed, 1);
      const decoded = await loadImage(Buffer.from(await output.arrayBuffer()));
      assert.equal(decoded.width, 120);
      assert.equal(decoded.height, 60);
      const result = createCanvas(120, 60).getContext("2d");
      result.drawImage(decoded, 0, 0);
      assert.ok(result.getImageData(10, 10, 1, 1).data[0] > 150);
      assert.ok(result.getImageData(70, 10, 1, 1).data[1] > 100);
      assert.equal(result.getImageData(10, 50, 1, 1).data[3], 0);
    });
  }
}

test("conversion releases the decoded bitmap when PNG encoding fails", async (t) => {
  let closed = false;
  replaceGlobal(t, "createImageBitmap", async () => ({ width: 1, height: 1, close: () => { closed = true; } }));
  replaceGlobal(t, "OffscreenCanvas", class {
    getContext() { return { drawImage: () => undefined }; }
    convertToBlob() { return Promise.reject(new Error("PNG encoding failed")); }
  });
  await assert.rejects(convertProposalImageToPng(new Blob()), /PNG encoding failed/);
  assert.equal(closed, true);
});

test("unreadable image bytes reject conversion", async (t) => {
  replaceGlobal(t, "createImageBitmap", async (blob: Blob) => loadImage(Buffer.from(await blob.arrayBuffer())));
  await assert.rejects(convertProposalImageToPng(new Blob(["invalid WebP bytes"], { type: "image/webp" })));
});

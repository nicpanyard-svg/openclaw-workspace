import assert from "node:assert/strict";
import test from "node:test";
import { ApiInputError, MAX_API_BODY_BYTES, readBoundedBody, readJsonBody, readUpload } from "./api-input";
import { checkServerAccess, getPdfOrigin } from "./server-access";
import { cacheProposalPdfQuote, cleanupCachedProposalPdfQuote, readCachedProposalPdfQuote } from "./proposal-pdf-cache";
import { createBlankQuoteRecord } from "./quote-template";

test("JSON uploads reject malformed bodies and cross-site browser requests", async () => {
  await assert.rejects(readJsonBody(new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })), /Invalid JSON/);
  await assert.rejects(readJsonBody(new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://elsewhere.test" }, body: "{}" })), (e) => e instanceof ApiInputError && e.status === 403);
});

test("request limits apply even without Content-Length", async () => {
  await assert.rejects(readBoundedBody(new Request("http://localhost/api/test", { method: "POST", body: new Uint8Array(MAX_API_BODY_BYTES + 1) })), (e) => e instanceof ApiInputError && e.status === 413);
});

test("origin checks use the public Host when Next supplies an internal request URL", async () => {
  const request = new Request("http://localhost:3047/api/test", { method: "POST", headers: {
    "Content-Type": "application/json", Host: "127.0.0.1:3047", Origin: "http://127.0.0.1:3047", "Sec-Fetch-Site": "same-origin",
  }, body: '{"ok":true}' });
  assert.deepEqual(await readJsonBody(request), { ok: true });
});

test("uploads reject incorrect PDF signatures and accept supported workbook uploads", async () => {
  const pdf = new FormData(); pdf.set("file", new File(["not a pdf"], "quote.pdf"));
  await assert.rejects(readUpload(new Request("http://localhost/api/test", { method: "POST", body: pdf }), "pdf"), /not a valid PDF/);
  const csv = new FormData(); csv.set("file", new File(["Item,Qty,Cost\nCamera,1,100"], "bom.csv"));
  assert.equal((await readUpload(new Request("http://localhost/api/test", { method: "POST", body: csv }), "workbook")).file.name, "bom.csv");
});

test("the optional access gate rejects missing config and incorrect credentials", (t) => {
  const before = { ...process.env };
  t.after(() => { process.env = before; });
  delete process.env.RAPIDQUOTE_ACCESS_MODE;
  assert.equal(checkServerAccess(new Request("http://localhost/")), null);
  process.env.RAPIDQUOTE_ACCESS_MODE = "restrcted";
  assert.equal(checkServerAccess(new Request("http://localhost/"))?.status, 503);
  process.env.RAPIDQUOTE_ACCESS_MODE = "restricted";
  delete process.env.RAPIDQUOTE_ACCESS_PASSWORD;
  assert.equal(checkServerAccess(new Request("http://localhost/"))?.status, 503);
  process.env.RAPIDQUOTE_ACCESS_USER = "test";
  process.env.RAPIDQUOTE_ACCESS_PASSWORD = "synthetic-test-password-only";
  assert.equal(checkServerAccess(new Request("http://localhost/"))?.status, 401);
  const headers = { Authorization: `Basic ${Buffer.from("test:synthetic-test-password-only").toString("base64")}` };
  assert.equal(checkServerAccess(new Request("http://localhost/", { headers })), null);
});

test("PDF origin cannot be taken from an arbitrary Host header", (t) => {
  const prior = process.env.RAPIDQUOTE_APP_ORIGIN;
  t.after(() => { if (prior === undefined) delete process.env.RAPIDQUOTE_APP_ORIGIN; else process.env.RAPIDQUOTE_APP_ORIGIN = prior; });
  delete process.env.RAPIDQUOTE_APP_ORIGIN;
  assert.throws(() => getPdfOrigin(new Request("https://attacker.test/api/proposal-pdf")), /Configure/);
  assert.equal(getPdfOrigin(new Request("http://127.0.0.1:3000/api/proposal-pdf")), "http://127.0.0.1:3000");
  process.env.RAPIDQUOTE_APP_ORIGIN = "https://quotes.example.test";
  assert.equal(getPdfOrigin(new Request("https://attacker.test/api/proposal-pdf")), "https://quotes.example.test");
});

test("PDF cache rejects path traversal and cleans up valid export tokens", async () => {
  assert.equal(await readCachedProposalPdfQuote("../../outside"), null);
  await assert.rejects(cleanupCachedProposalPdfQuote("../../outside"), /Invalid export token/);
  const token = await cacheProposalPdfQuote(createBlankQuoteRecord(), "fixture");
  try { assert.equal((await readCachedProposalPdfQuote(token))?.proposalId, "fixture"); }
  finally { await cleanupCachedProposalPdfQuote(token); }
  assert.equal(await readCachedProposalPdfQuote(token), null);
});

test("PDF endpoint returns a client error for incomplete and malformed payloads", async () => {
  const { POST } = await import("../api/proposal-pdf/route");
  for (const body of ["null", "{}", "{", '{"quote":{}}']) {
    const response = await POST(new Request("http://localhost/api/proposal-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
    assert.equal(response.status, 400);
  }
});

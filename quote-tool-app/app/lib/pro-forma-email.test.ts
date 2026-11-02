import assert from "node:assert/strict";
import test from "node:test";
import { proFormaFixture } from "../../scripts/pro-forma-fixtures";
import { buildDocuSignRequest, buildInvoiceMailPayload, DOCUSIGN_COORDINATOR, invoiceEmailValidation, MAX_INVOICE_EMAIL_BYTES, OutlookSubmissionError, submitInvoiceMail } from "./pro-forma-email";
import { getOutlookConfiguration, OUTLOOK_SCOPES, outlookConnectionError } from "./outlook-connection";
import { requestProFormaPdf } from "./pro-forma-pdf-client";

const pdf = new Blob(["%PDF-1.7\nInvoice bytes\n"], { type: "application/pdf" });
const attachment = { name: "Customer - Invoice.pdf", pdf };
const draft = { subject: "DocuSign setup", body: "Please arrange Sales and Accounting sign-off." };

test("DocuSign request addresses Ruthie as Inside Sales and excludes internal quote data", () => {
  const quote = proFormaFixture();
  quote.internal.crmOwnerLabel = "PRIVATE_OWNER_SECRET";
  const request = buildDocuSignRequest(quote);
  assert.deepEqual(DOCUSIGN_COORDINATOR, { name: "Ruthie Ramay", email: "ruthie.ramay@inetlte.com", role: "Inside Sales" });
  assert.match(request.subject, /River Valley Utilities/);
  assert.match(request.body, /Sales and Accounting sign-off/);
  assert.match(request.body, /Confirm the authorized signers and routing order/);
  assert.match(request.body, /\$2,692.25/);
  assert.match(request.fileName, /Camera and Monitoring.*Pro Forma Invoice.pdf/);
  assert.doesNotMatch(JSON.stringify(request), /PRIVATE_OWNER_SECRET|INTERNAL_COST_SECRET|gross profit|target margin/);
});

test("mail payload includes exact PDF bytes, a fixed recipient and a Sent Items copy", async () => {
  const payload = await buildInvoiceMailPayload(draft, attachment);
  assert.equal(payload.message.toRecipients[0].emailAddress.address, DOCUSIGN_COORDINATOR.email);
  assert.equal(payload.message.attachments[0]["@odata.type"], "#microsoft.graph.fileAttachment");
  assert.equal(Buffer.from(payload.message.attachments[0].contentBytes, "base64").toString(), await pdf.text());
  assert.equal(payload.message.body.contentType, "Text");
  assert.equal(payload.saveToSentItems, true);
  assert.equal("from" in payload.message, false);
  assert.equal("ccRecipients" in payload.message, false);
});

test("email validation rejects empty or injected subjects, oversized PDFs and non-PDF responses", async () => {
  assert.ok(invoiceEmailValidation({ ...draft, subject: "" }));
  assert.ok(invoiceEmailValidation({ ...draft, subject: "Subject\nBcc: wrong@example.test" }));
  assert.ok(invoiceEmailValidation({ ...draft, body: "x".repeat(12001) }));
  await assert.rejects(buildInvoiceMailPayload(draft, { ...attachment, pdf: new Blob([new Uint8Array(MAX_INVOICE_EMAIL_BYTES + 1)], { type: "application/pdf" }) }), /2.8 MB/);
  await assert.rejects(buildInvoiceMailPayload(draft, { ...attachment, pdf: new Blob(["<html>Error</html>"], { type: "application/pdf" }) }), /valid invoice PDF/);
});

test("sending uses delegated Microsoft Graph and accepts only 202", async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://graph.microsoft.com/v1.0/me/sendMail");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-token");
    assert.equal(JSON.parse(String(init?.body)).message.toRecipients[0].emailAddress.address, DOCUSIGN_COORDINATOR.email);
    return new Response(null, { status: 202 });
  };
  await submitInvoiceMail("synthetic-token", draft, attachment, request);
  assert.equal(calls, 1);
  await assert.rejects(submitInvoiceMail("", draft, attachment, request), /Connect your Outlook/);
  assert.equal(calls, 1);
});

test("network and server failures never retry and require checking Sent Items", async () => {
  for (const status of [0, 200, 500]) {
    let calls = 0;
    const request: typeof fetch = async () => { calls++; if (!status) throw new Error("network failure"); return new Response(null, { status }); };
    await assert.rejects(submitInvoiceMail("synthetic-token", draft, attachment, request), error => error instanceof OutlookSubmissionError && error.uncertain && error.message.includes("Sent Items"));
    assert.equal(calls, 1);
  }
});

test("authentication, permission and throttle errors are distinct from uncertain delivery", async () => {
  for (const [status, expected] of [[401, /expired/], [403, /Mail.Send/], [429, /limiting/], [400, /rejected/]] as const) {
    await assert.rejects(submitInvoiceMail("synthetic-token", draft, attachment, async () => new Response(null, { status })), error => error instanceof OutlookSubmissionError && !error.uncertain && expected.test(error.message));
  }
});

test("Outlook configuration requires real-shaped client and tenant IDs and only delegated send scope", () => {
  assert.equal(getOutlookConfiguration("", ""), null);
  assert.equal(getOutlookConfiguration("11111111-1111-1111-1111-111111111111", "common"), null);
  assert.equal(getOutlookConfiguration("bad-client", "../../evil"), null);
  assert.ok(getOutlookConfiguration("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"));
  assert.deepEqual(OUTLOOK_SCOPES, ["https://graph.microsoft.com/Mail.Send"]);
  assert.match(outlookConnectionError({ errorCode: "user_cancelled" }), /Nothing was sent/);
  assert.match(outlookConnectionError({ errorCode: "popup_window_error" }), /pop-ups/);
});

test("PDF attachment preparation uses the quote export checks and rejects HTML login responses", async () => {
  const quote = proFormaFixture();
  const prepared = await requestProFormaPdf(quote, async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).quote.metadata.proposalNumber, quote.metadata.proposalNumber);
    return new Response(pdf, { headers: { "Content-Type": "application/pdf" } });
  });
  assert.equal(await prepared.text(), await pdf.text());
  await assert.rejects(requestProFormaPdf(quote, async () => Response.json({ error: "Incomplete", missingFields: ["Confirm the quote details"] }, { status: 422 })), /Confirm the quote details/);
  await assert.rejects(requestProFormaPdf(quote, async () => new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } })), /could not be verified/);
});

import { buildProFormaFileName, buildProFormaInvoice } from "./pro-forma";
import type { QuoteRecord } from "./quote-record";

export const DOCUSIGN_COORDINATOR = { name: "Ruthie Ramay", email: "ruthie.ramay@inetlte.com", role: "Inside Sales" } as const;
export const MAX_INVOICE_EMAIL_BYTES = 2_800_000;
export type InvoiceEmailDraft = { subject: string; body: string };
export type InvoiceEmailAttachment = { name: string; pdf: Blob };

export function buildDocuSignRequest(quote: QuoteRecord): InvoiceEmailDraft & { fileName: string } {
  const invoice = buildProFormaInvoice(quote);
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency }).format(invoice.total);
  return {
    subject: `DocuSign setup - ${quote.customer.name} - ${invoice.settings.reference}`.replace(/[\r\n]/g, " ").slice(0, 240),
    fileName: buildProFormaFileName(quote),
    body: [
      "Hi Ruthie,", "",
      "Please set up DocuSign for the attached pro forma invoice and route it for Sales and Accounting sign-off.", "",
      `Customer: ${quote.customer.name}`,
      ...(invoice.quoteTitle ? [`Quote title: ${invoice.quoteTitle}`] : []),
      `Quote: ${invoice.quoteReference} (revision ${invoice.quoteRevision})`,
      `Pro forma invoice: ${invoice.settings.reference}`,
      ...(invoice.settings.customerPo ? [`Customer PO: ${invoice.settings.customerPo}`] : []),
      `Pro forma total: ${money}`, "",
      "Required sign-offs:", "- Sales", "- Accounting", "",
      "Please add signature and date fields to both lines in the Internal sign-off section. Confirm the authorized signers and routing order before sending the DocuSign envelope.", "",
      "Please let me know once the envelope has been sent.", "", "Thank you.",
    ].join("\n"),
  };
}

export function invoiceEmailValidation(draft: InvoiceEmailDraft) {
  if (!draft.subject.trim() || draft.subject.length > 240 || /[\r\n]/.test(draft.subject)) return "Enter an email subject of 240 characters or fewer.";
  if (!draft.body.trim() || draft.body.length > 12000) return "Enter an email message of 12,000 characters or fewer.";
  return "";
}

export async function buildInvoiceMailPayload(draft: InvoiceEmailDraft, attachment: InvoiceEmailAttachment) {
  const error = invoiceEmailValidation(draft);
  if (error) throw new Error(error);
  if (attachment.pdf.size > MAX_INVOICE_EMAIL_BYTES) throw new Error("The PDF is larger than the 2.8 MB email limit. Download it and send it from Outlook.");
  if (attachment.pdf.type !== "application/pdf" || await attachment.pdf.slice(0, 4).text() !== "%PDF") throw new Error("A valid invoice PDF is required.");
  const bytes = new Uint8Array(await attachment.pdf.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return {
    message: {
      subject: draft.subject.trim(),
      body: { contentType: "Text", content: draft.body },
      toRecipients: [{ emailAddress: { name: DOCUSIGN_COORDINATOR.name, address: DOCUSIGN_COORDINATOR.email } }],
      attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: attachment.name, contentType: "application/pdf", contentBytes: btoa(binary) }],
    },
    saveToSentItems: true,
  };
}

export class OutlookSubmissionError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}

export async function submitInvoiceMail(token: string, draft: InvoiceEmailDraft, attachment: InvoiceEmailAttachment, request: typeof fetch = fetch) {
  if (!token) throw new Error("Connect your Outlook account before sending.");
  const payload = await buildInvoiceMailPayload(draft, attachment);
  let response: Response;
  try {
    // Sending mail is not idempotent. Never automatically retry an ambiguous response.
    response = await request("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new OutlookSubmissionError("Outlook did not confirm submission. Check your Sent Items before sending another request.", true);
  }
  if (response.status === 202) return;
  if (response.status === 401) throw new OutlookSubmissionError("Your Microsoft session expired. Reconnect Outlook and try again.");
  if (response.status === 403) throw new OutlookSubmissionError("Microsoft did not allow this email. Ask your Microsoft 365 administrator to approve RapidQuote's delegated Mail.Send permission.");
  if (response.status === 429) throw new OutlookSubmissionError("Microsoft is limiting email requests. Wait before trying again.");
  if (response.status >= 500 || response.ok) throw new OutlookSubmissionError("Outlook did not confirm submission. Check your Sent Items before sending another request.", true);
  throw new OutlookSubmissionError("Microsoft rejected the email request. Review the message and attachment before trying again.");
}

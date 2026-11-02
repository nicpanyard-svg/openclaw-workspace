# Outlook DocuSign Request Setup

## Workflow

Open a quote, select **Pro Forma Invoice**, then **Send for DocuSign**.
RapidQuote prepares the invoice PDF and an editable request addressed to:

- Ruthie Ramay, Inside Sales
- ruthie.ramay@inetlte.com

The user connects their Microsoft 365 account, reviews the sender, message and
attachment, then selects **Send to Ruthie**. Microsoft Graph submits the email
from that account and requests a copy in Sent Items. Ruthie confirms the authorized
Sales and Accounting signers and routing order, then creates the DocuSign envelope.
RapidQuote does not create an envelope, sign a document, or change approval status.

## One-Time Microsoft 365 Setup

An authorized Microsoft 365 administrator must configure the company's Entra app.
No Microsoft password or client secret is entered into RapidQuote.

1. In Microsoft Entra ID, register an application named **RapidQuote Outlook**.
   Choose **Accounts in this organizational directory only**.
2. Add the **Single-page application (SPA)** platform and exact redirect URIs:
   - `https://quote-tool-app.vercel.app/outlook-callback`
   - `http://localhost:3017/outlook-callback` for local development
   - `http://127.0.0.1:3017/outlook-callback` only when testing on that origin
3. Add Microsoft Graph **delegated** `Mail.Send`. Do not add application-wide
   mail permissions, `Mail.Read`, or `Mail.ReadWrite` for this workflow. Microsoft
   handles identity scopes such as `openid` and `profile` during sign-in.
4. Grant consent according to company policy. Enable user assignment and assign
   approved staff if required by the organization's access policy.
5. Provide the Application (client) ID and Directory (tenant) ID. Set these public
   identifiers in the intended Vercel environment and in local `.env.local`:

   ```dotenv
   NEXT_PUBLIC_RAPIDQUOTE_MICROSOFT_CLIENT_ID=<application-client-id>
   NEXT_PUBLIC_RAPIDQUOTE_MICROSOFT_TENANT_ID=<directory-tenant-id>
   ```

6. Rebuild/redeploy after changing either ID. Preview URLs need their own exact
   SPA redirect URI; do not register a wildcard or unrelated origin.
7. Keep `/outlook-callback` free of Cross-Origin-Opener-Policy headers and routing
   redirects. The MSAL v5 redirect bridge runs there. If deployment protection is
   enabled, verify the callback remains accessible in the signed-in browser.

## Acceptance Check

- Open a complete synthetic/test quote with permission to send a test to Ruthie.
- Verify Ruthie's address, the connected sender, the request text and attached PDF.
- Select Send once. Verify the copy in Outlook Sent Items and receipt with Ruthie.
- Test canceled login, blocked pop-ups and denied consent. None should send mail.
- Never send a live test without authorization. Automated tests use mocked mail
  requests and do not contact Ruthie.

## Limits and Security

- Uses Microsoft's MSAL browser library and delegated Graph `/me/sendMail`.
- Mail access tokens remain in page memory, not quote records or persistent storage.
  This connection is separate from RapidQuote's existing application sign-in.
- Only the invoice PDF is attached. Internal quote JSON, costs and margins are not.
- The PDF is generated from a saved snapshot when the request window opens. To
  change invoice details, close the request, update the quote, and reopen it.
- PDF attachments are capped at 2.8 MB to stay within a single Graph request.
- A `202 Accepted` response is submission confirmation, not proof of delivery or
  DocuSign completion. Check Sent Items and any nondelivery reports as needed.
- Submission feedback is local to the open invoice panel, not a permanent audit
  ledger. Sent Items is the mail record; DocuSign is the signature record.
- Network/timeout/server failures are not retried automatically. Check Sent Items
  before explicitly authorizing another attempt to avoid duplicate requests.
- Outlook setup does not replace the separate production identity/security work
  already documented for RapidQuote.

## Microsoft References

- [Send mail and attachment permissions](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- [MSAL v5 redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
- [MSAL browser configuration](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/configuration)

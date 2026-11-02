import type { AccountInfo, PublicClientApplication } from "@azure/msal-browser";

export const OUTLOOK_SETUP_MESSAGE = "Outlook sending is not configured yet. Your Microsoft 365 administrator needs to register RapidQuote and provide its application and tenant IDs.";
export const OUTLOOK_SCOPES = ["https://graph.microsoft.com/Mail.Send"];
export const OUTLOOK_CALLBACK_PATH = "/outlook-callback";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getOutlookConfiguration(
  clientId = process.env.NEXT_PUBLIC_RAPIDQUOTE_MICROSOFT_CLIENT_ID || "",
  tenantId = process.env.NEXT_PUBLIC_RAPIDQUOTE_MICROSOFT_TENANT_ID || "",
) {
  if (!uuid.test(clientId.trim()) || !uuid.test(tenantId.trim())) return null;
  return { clientId: clientId.trim(), tenantId: tenantId.trim() };
}

export type OutlookAccount = Pick<AccountInfo, "homeAccountId" | "username" | "name">;
let ready: Promise<PublicClientApplication> | undefined;

export function initializeOutlook() {
  if (ready) return ready;
  ready = (async () => {
    const config = getOutlookConfiguration();
    if (!config) throw new Error(OUTLOOK_SETUP_MESSAGE);
    const { PublicClientApplication } = await import("@azure/msal-browser");
    const client = new PublicClientApplication({
      auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: `${window.location.origin}${OUTLOOK_CALLBACK_PATH}` },
      // Mail tokens stay in this page's memory, never in quote data or persistent browser storage.
      cache: { cacheLocation: "memoryStorage" },
    });
    await client.initialize();
    return client;
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}

export async function connectOutlook(): Promise<OutlookAccount> {
  const client = await initializeOutlook();
  const result = await client.loginPopup({ scopes: OUTLOOK_SCOPES, prompt: "select_account" });
  if (!result.account?.username) throw new Error("Microsoft did not return an Outlook account.");
  client.setActiveAccount(result.account);
  return { homeAccountId: result.account.homeAccountId, username: result.account.username, name: result.account.name };
}

export async function getOutlookSendToken(account: OutlookAccount) {
  const client = await initializeOutlook();
  const selected = client.getAccount({ homeAccountId: account.homeAccountId });
  if (!selected || selected.username !== account.username) throw new Error("Reconnect the Outlook account shown on this request.");
  try {
    const result = await client.acquireTokenSilent({ scopes: OUTLOOK_SCOPES, account: selected });
    if (result.account?.homeAccountId !== account.homeAccountId) throw new Error("Account changed.");
    return result.accessToken;
  } catch { throw new Error("Your Microsoft session needs attention. Reconnect Outlook before sending."); }
}

export function outlookConnectionError(error: unknown) {
  const code = error && typeof error === "object" && "errorCode" in error ? String(error.errorCode) : "";
  if (code === "user_cancelled") return "Outlook sign-in was canceled. Nothing was sent.";
  if (code === "popup_window_error" || code === "empty_window_error") return "Allow pop-ups for RapidQuote, then connect Outlook again.";
  return "Outlook could not connect. Try again, or ask your Microsoft 365 administrator to check the app registration and consent.";
}

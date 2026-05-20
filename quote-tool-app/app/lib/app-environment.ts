import { COMPANY_BRANDING } from "@/app/lib/company-branding";
import type { RapidQuoteCompanyKey } from "@/app/lib/branding-types";

const rawDeploymentKey = (process.env.NEXT_PUBLIC_RAPIDQUOTE_ENV ?? "").trim().toLowerCase();

export const RAPIDQUOTE_DEPLOYMENT_KEY: RapidQuoteCompanyKey = rawDeploymentKey === "ilios" ? "ilios" : "inet";
export const RAPIDQUOTE_DEPLOYMENT_BRANDING = COMPANY_BRANDING[RAPIDQUOTE_DEPLOYMENT_KEY];
export const RAPIDQUOTE_DEPLOYMENT_EMAIL_DOMAIN =
  RAPIDQUOTE_DEPLOYMENT_KEY === "ilios" ? "ilios-integrators.com" : "inetlte.com";
export const RAPIDQUOTE_DEMO_DATA_ENABLED = RAPIDQUOTE_DEPLOYMENT_KEY === "inet";

export function scopeStorageKey(baseKey: string) {
  if (RAPIDQUOTE_DEPLOYMENT_KEY === "inet") {
    return baseKey;
  }

  if (baseKey.startsWith("rapidquote:")) {
    return `rapidquote:${RAPIDQUOTE_DEPLOYMENT_KEY}:${baseKey.slice("rapidquote:".length)}`;
  }

  if (baseKey.startsWith("quote-tool-app:")) {
    return `quote-tool-app:${RAPIDQUOTE_DEPLOYMENT_KEY}:${baseKey.slice("quote-tool-app:".length)}`;
  }

  return `${RAPIDQUOTE_DEPLOYMENT_KEY}:${baseKey}`;
}

export function getDeploymentEmailPlaceholder() {
  return `name@${RAPIDQUOTE_DEPLOYMENT_EMAIL_DOMAIN}`;
}

export function getDeploymentAccessScopeLabel() {
  return `@${RAPIDQUOTE_DEPLOYMENT_EMAIL_DOMAIN} only`;
}

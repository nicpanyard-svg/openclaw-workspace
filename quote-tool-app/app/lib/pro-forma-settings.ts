import type { ProFormaSettings, QuoteRecord } from "./quote-record";

export function normalizeProFormaSettings(value: unknown): ProFormaSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const text = (key: string, limit: number) => typeof raw[key] === "string" ? raw[key].slice(0, limit) : "";
  return { reference: text("reference", 100), issueDate: text("issueDate", 10), customerPo: text("customerPo", 160), billingPeriod: text("billingPeriod", 160), notes: text("notes", 3000) };
}

export function createProFormaSettings(quote: QuoteRecord, date = new Date()): ProFormaSettings {
  const issueDate = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return { reference: `PF-${quote.metadata.proposalNumber}`, issueDate, customerPo: "", billingPeriod: "", notes: "" };
}

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { QuoteRecord } from "@/app/lib/quote-record";

const EXPORT_CACHE_DIR = path.join(process.cwd(), "tmp", "proposal-pdf-cache");
const MAX_EXPORT_AGE_MS = 1000 * 60 * 10;

function buildCachePath(token: string) {
  return path.join(EXPORT_CACHE_DIR, `${token}.json`);
}

export async function cacheProposalPdfQuote(quote: QuoteRecord) {
  const token = crypto.randomUUID();
  await fs.mkdir(EXPORT_CACHE_DIR, { recursive: true });
  await fs.writeFile(
    buildCachePath(token),
    JSON.stringify({ createdAt: Date.now(), quote }),
    "utf8",
  );
  return token;
}

export async function readCachedProposalPdfQuote(token?: string | null) {
  if (!token) return null;

  try {
    const raw = await fs.readFile(buildCachePath(token), "utf8");
    const parsed = JSON.parse(raw) as { createdAt?: number; quote?: QuoteRecord };

    if (!parsed.quote) {
      return null;
    }

    if (!parsed.createdAt || Date.now() - parsed.createdAt > MAX_EXPORT_AGE_MS) {
      await fs.rm(buildCachePath(token), { force: true });
      return null;
    }

    return parsed.quote;
  } catch {
    return null;
  }
}

export async function cleanupCachedProposalPdfQuote(token?: string | null) {
  if (!token) return;
  await fs.rm(buildCachePath(token), { force: true });
}

export function buildProposalPdfFileName(quote: QuoteRecord) {
  const safeProposalNumber = quote.metadata.proposalNumber.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "proposal";
  return `${safeProposalNumber}.pdf`;
}

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { QuoteRecord } from "@/app/lib/quote-record";

const EXPORT_CACHE_DIR = path.join(os.tmpdir(), "proposal-pdf-cache");
const MAX_EXPORT_AGE_MS = 1000 * 60 * 10;

function buildCachePath(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    throw new Error("Invalid export token.");
  }
  return path.join(EXPORT_CACHE_DIR, `${token}.json`);
}

export async function cacheProposalPdfQuote(quote: QuoteRecord, proposalId?: string | null) {
  const token = crypto.randomUUID();
  await fs.mkdir(EXPORT_CACHE_DIR, { recursive: true });
  await fs.writeFile(
    buildCachePath(token),
    JSON.stringify({ createdAt: Date.now(), proposalId: proposalId ?? null, quote }),
    "utf8",
  );
  return token;
}

export async function readCachedProposalPdfQuote(token?: string | null) {
  if (!token) return null;

  try {
    const raw = await fs.readFile(buildCachePath(token), "utf8");
    const parsed = JSON.parse(raw) as { createdAt?: number; proposalId?: string | null; quote?: QuoteRecord };

    if (!parsed.quote) {
      return null;
    }

    if (!parsed.createdAt || Date.now() - parsed.createdAt > MAX_EXPORT_AGE_MS) {
      await fs.rm(buildCachePath(token), { force: true });
      return null;
    }

    return {
      proposalId: parsed.proposalId ?? null,
      quote: parsed.quote,
    };
  } catch {
    return null;
  }
}

export async function cleanupCachedProposalPdfQuote(token?: string | null) {
  if (!token) return;
  await fs.rm(buildCachePath(token), { force: true });
}

export { buildProposalPdfFileName } from "./proposal-file-name";

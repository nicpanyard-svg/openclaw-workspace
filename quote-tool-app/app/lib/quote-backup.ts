import JSZip from "jszip";
import { RAPIDQUOTE_DEPLOYMENT_KEY } from "./app-environment";
import { deserializeProposalStore, PROPOSAL_STORE_KEY, type ProposalStoreData } from "./proposal-store";
import type { MajorProjectSpecAttachment } from "./quote-record";
import {
  getMajorProjectSpecAttachmentFile, persistMajorProjectSpecAttachmentFile,
  deleteMajorProjectSpecAttachmentFile, normalizeMajorProjectSpecAttachment,
  MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES,
} from "./major-project-spec-attachments";

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
type AttachmentEntry = { metadata: MajorProjectSpecAttachment; path: string; sha256: string };
type BackupManifest = {
  format: "rapidquote-backup"; version: 1; deployment: string; createdAt: string;
  store: ProposalStoreData; attachments: AttachmentEntry[]; missingAttachments: string[];
};
type AttachmentIO = {
  load: (key: string) => Promise<Blob | undefined>;
  save: (file: File, key: string) => Promise<unknown>;
  remove: (key: string) => Promise<void>;
};
const attachmentIO: AttachmentIO = {
  load: getMajorProjectSpecAttachmentFile,
  save: persistMajorProjectSpecAttachmentFile,
  remove: deleteMajorProjectSpecAttachmentFile,
};

// Validate using the application's reader, but preserve the original records exactly.
// A backup must not silently drop records or recalculate prices.
export function parseBackupStore(raw: string): ProposalStoreData {
  const parsed = JSON.parse(raw) as ProposalStoreData;
  const readable = deserializeProposalStore(raw);
  if (!readable || readable.proposals.length !== parsed.proposals.length ||
      new Set(parsed.proposals.map((p) => p.id)).size !== parsed.proposals.length) {
    throw new Error("The quote records could not all be read. No records were changed.");
  }
  return parsed;
}

function visitAttachments(value: unknown, visit: (file: MajorProjectSpecAttachment) => void) {
  if (!value || typeof value !== "object") return;
  const candidate = normalizeMajorProjectSpecAttachment(value);
  if (candidate) { visit(value as MajorProjectSpecAttachment); return; }
  for (const item of Object.values(value)) visitAttachments(item, visit);
}

function collectAttachments(store: ProposalStoreData) {
  const files = new Map<string, MajorProjectSpecAttachment>();
  visitAttachments(store.proposals, (file) => files.set(file.storageKey, file));
  return files;
}

async function digest(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createQuoteBackup(store: ProposalStoreData, io = attachmentIO) {
  const snapshot = parseBackupStore(JSON.stringify(store));
  const zip = new JSZip();
  const manifest: BackupManifest = {
    format: "rapidquote-backup", version: 1, deployment: RAPIDQUOTE_DEPLOYMENT_KEY,
    createdAt: new Date().toISOString(), store: snapshot, attachments: [], missingAttachments: [],
  };
  let total = 0;
  for (const metadata of collectAttachments(snapshot).values()) {
    const file = await io.load(metadata.storageKey);
    if (!file) { manifest.missingAttachments.push(metadata.fileName); continue; }
    total += file.size;
    if (total > MAX_BACKUP_BYTES - MAX_MANIFEST_BYTES) throw new Error("This backup exceeds 90 MB of attachments. Contact support before moving browsers.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `attachments/${manifest.attachments.length}.bin`;
    zip.file(path, bytes);
    manifest.attachments.push({ metadata: { ...metadata, sizeBytes: file.size }, path, sha256: await digest(bytes) });
  }
  const json = JSON.stringify(manifest);
  if (new TextEncoder().encode(json).length > MAX_MANIFEST_BYTES) throw new Error("The quote records exceed the backup limit.");
  zip.file("manifest.json", json);
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
    fileName: `rapidquote-backup-${RAPIDQUOTE_DEPLOYMENT_KEY}-${manifest.createdAt.replace(/[:.]/g, "-")}.zip`,
    quoteCount: snapshot.proposals.length, missingAttachments: manifest.missingAttachments,
  };
}

// Bound decompression while streaming, rather than trusting archive size metadata.
function readZipEntry(entry: JSZip.JSZipObject, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Uint8Array[] = [];
    // JSZip exposes this bounded streaming API at runtime but omits it from JSZipObject's types.
    const stream = (entry as JSZip.JSZipObject & {
      internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
    }).internalStream("uint8array");
    stream.on("data", (chunk: Uint8Array) => {
      size += chunk.length;
      if (size > maxBytes) { stream.pause(); reject(new Error("Backup entry exceeds the supported size.")); return; }
      chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      resolve(bytes);
    });
    stream.resume();
  });
}

export async function readQuoteBackup(file: Blob) {
  if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup must be 100 MB or smaller.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("manifest.json");
  if (!entry) throw new Error("This is not a RapidQuote backup.");
  const manifest = JSON.parse(new TextDecoder().decode(await readZipEntry(entry, MAX_MANIFEST_BYTES))) as BackupManifest;
  if (manifest.format !== "rapidquote-backup" || manifest.version !== 1 || !Array.isArray(manifest.attachments) || !Array.isArray(manifest.missingAttachments)) {
    throw new Error("Unsupported backup format.");
  }
  if (manifest.deployment !== RAPIDQUOTE_DEPLOYMENT_KEY) throw new Error("This backup belongs to a different company environment.");
  parseBackupStore(JSON.stringify(manifest.store));
  const expected = collectAttachments(manifest.store);
  const files = new Map<string, { metadata: MajorProjectSpecAttachment; bytes: Uint8Array }>();
  let total = 0;
  for (const item of manifest.attachments) {
    const metadata = normalizeMajorProjectSpecAttachment(item.metadata);
    if (!metadata || !expected.has(metadata.storageKey) || files.has(metadata.storageKey) || !/^attachments\/\d+\.bin$/.test(item.path)) throw new Error("Invalid attachment in backup.");
    const source = zip.file(item.path);
    if (!source) throw new Error(`Missing attachment: ${metadata.fileName}`);
    const bytes = await readZipEntry(source, MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES);
    total += bytes.length;
    if (total > MAX_BACKUP_BYTES || bytes.length !== metadata.sizeBytes || await digest(bytes) !== item.sha256) throw new Error(`Attachment failed integrity check: ${metadata.fileName}`);
    files.set(metadata.storageKey, { metadata, bytes });
  }
  const missingAttachments = [...expected.values()].filter((item) => !files.has(item.storageKey)).map((item) => item.fileName);
  return { manifest, files, missingAttachments };
}

export function mergeRestoredQuotes(current: ProposalStoreData, incoming: ProposalStoreData) {
  const existing = new Set(current.proposals.map((p) => p.id));
  const added = incoming.proposals.filter((p) => !existing.has(p.id));
  return { store: { ...current, proposals: [...current.proposals, ...added] }, added: added.length, skipped: incoming.proposals.length - added.length };
}

export async function restoreQuoteBackup(
  backup: Awaited<ReturnType<typeof readQuoteBackup>>,
  storage: Pick<Storage, "getItem" | "setItem">,
  fallback: ProposalStoreData,
  io = attachmentIO,
) {
  const raw = storage.getItem(PROPOSAL_STORE_KEY);
  const current = raw ? parseBackupStore(raw) : fallback;
  const incoming = structuredClone(backup.manifest.store);
  const existing = new Set(current.proposals.map((p) => p.id));
  incoming.proposals = incoming.proposals.filter((p) => !existing.has(p.id));
  const keys = new Map<string, string>();
  const written: string[] = [];
  let recordsWritten = false;
  try {
    for (const file of collectAttachments(incoming).values()) {
      // Fresh keys prevent a restored attachment from overwriting another quote's file.
      const key = `major-project-spec:restore:${crypto.randomUUID()}`;
      keys.set(file.storageKey, key);
      const saved = backup.files.get(file.storageKey);
      if (!saved) continue;
      written.push(key);
      await io.save(new File([new Uint8Array(saved.bytes)], saved.metadata.fileName, { type: saved.metadata.mimeType }), key);
    }
    visitAttachments(incoming.proposals, (file) => { file.storageKey = keys.get(file.storageKey) ?? file.storageKey; });
    // Re-read after attachment I/O so another tab's intervening saves survive.
    const latestRaw = storage.getItem(PROPOSAL_STORE_KEY);
    const latest = latestRaw ? parseBackupStore(latestRaw) : current;
    const merged = mergeRestoredQuotes(latest, incoming);
    const serialized = JSON.stringify(merged.store);
    parseBackupStore(serialized);
    storage.setItem(PROPOSAL_STORE_KEY, serialized);
    recordsWritten = true;
    if (storage.getItem(PROPOSAL_STORE_KEY) !== serialized) throw new Error("The restored records could not be verified.");
    return { ...merged, skipped: backup.manifest.store.proposals.length - merged.added };
  } catch (error) {
    // Quota/attachment failures leave the prior quote store intact. Fresh orphan files are safe to remove.
    if (!recordsWritten) await Promise.allSettled(written.map((key) => io.remove(key)));
    throw error;
  }
}

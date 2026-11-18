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
const MAX_JSON_DEPTH = 100;
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

function parseBackupJson(raw: string): unknown {
  if (raw.length > MAX_MANIFEST_BYTES || new TextEncoder().encode(raw).length > MAX_MANIFEST_BYTES) {
    throw new Error("The quote records exceed the backup limit.");
  }
  const parsed: unknown = JSON.parse(raw);
  const pending = [{ value: parsed, depth: 0 }];
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (!value || typeof value !== "object") continue;
    if (depth > MAX_JSON_DEPTH) throw new Error("Backup JSON exceeds the supported nesting depth.");
    for (const [key, child] of Object.entries(value)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error("Backup JSON contains an unsafe property.");
      }
      if (child && typeof child === "object") pending.push({ value: child, depth: depth + 1 });
    }
  }
  return parsed;
}

// Validate using the application's reader, but preserve the original records exactly.
// A backup must not silently drop records or recalculate prices.
export function parseBackupStore(raw: string): ProposalStoreData {
  const parsed = parseBackupJson(raw) as ProposalStoreData;
  if (!parsed || !Array.isArray(parsed.proposals) ||
      parsed.proposals.some((p) => !p || typeof p.id !== "string" || !p.id)) {
    throw new Error("The quote records could not all be read. No records were changed.");
  }
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
  // Attachment-shaped extension fields must not hide nested attachment references.
  if (candidate) visit(value as MajorProjectSpecAttachment);
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
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error("Backup must be 100 MB or smaller.");
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
    fileName: `rapidquote-backup-${RAPIDQUOTE_DEPLOYMENT_KEY}-${manifest.createdAt.replace(/[:.]/g, "-")}.zip`,
    quoteCount: snapshot.proposals.length, missingAttachments: manifest.missingAttachments,
  };
}

function isBackupPath(path: string) {
  return path === "manifest.json" || path === "attachments/" || isAttachmentPath(path);
}

function isAttachmentPath(path: string) {
  return /^attachments\/\d+\.bin$/.test(path) && path.endsWith(".bin");
}

// Check the standard ZIP envelope before JSZip allocates entries or normalizes names.
// Backups produced here never need ZIP64, multi-disk archives, or path aliases.
function validateZipEnvelope(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalid = () => new Error("Invalid or unsupported backup archive.");
  let end = bytes.length - 22;
  const first = Math.max(0, end - 0xffff);
  for (; end >= first; end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < first) throw invalid();
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
      count === 0xffff || count !== view.getUint16(end + 8, true) || start + size !== end) throw invalid();
  const paths = new Set<string>();
  let offset = start, expanded = 0;
  while (offset < end) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50 || paths.size >= count) throw invalid();
    const nameLength = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end) throw invalid();
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const path = new TextDecoder().decode(nameBytes);
    if (!isBackupPath(path) || paths.has(path)) throw new Error("Invalid or duplicate path in backup archive.");
    paths.add(path);
    const local = view.getUint32(offset + 42, true);
    if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50 ||
        view.getUint16(local + 26, true) !== nameLength || local + 30 + nameLength > start ||
        nameBytes.some((byte, index) => byte !== bytes[local + 30 + index])) throw invalid();
    const length = view.getUint32(offset + 24, true);
    const limit = path === "manifest.json" ? MAX_MANIFEST_BYTES : path === "attachments/" ? 0 : MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES;
    expanded += length;
    if (length > limit || expanded > MAX_BACKUP_BYTES) throw new Error("Backup entry exceeds the supported size.");
    offset = next;
  }
  if (paths.size !== count) throw invalid();
  return paths;
}

// Bound decompression while streaming, rather than trusting archive size metadata.
function readZipEntry(entry: JSZip.JSZipObject, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let stopped = false;
    const chunks: Uint8Array[] = [];
    // JSZip exposes this bounded streaming API at runtime but omits it from JSZipObject's types.
    const stream = (entry as JSZip.JSZipObject & {
      internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
    }).internalStream("uint8array");
    const fail = (error: Error) => {
      stopped = true;
      chunks.length = 0;
      stream.pause();
      reject(error);
    };
    stream.on("data", (chunk: Uint8Array) => {
      if (stopped) return;
      size += chunk.length;
      if (size > maxBytes) { fail(new Error("Backup entry exceeds the supported size.")); return; }
      chunks.push(chunk);
    });
    stream.on("error", fail);
    stream.on("end", () => {
      if (stopped) return;
      stopped = true;
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
  const archive = new Uint8Array(await file.arrayBuffer());
  const paths = validateZipEnvelope(archive);
  const zip = await JSZip.loadAsync(archive);
  if (Object.keys(zip.files).length !== paths.size) throw new Error("Invalid or duplicate path in backup archive.");
  for (const source of Object.values(zip.files)) {
    if (!paths.has(source.name) || (!source.dir && source.unsafeOriginalName !== source.name)) {
      throw new Error("Invalid path in backup archive.");
    }
  }
  const entry = zip.file("manifest.json");
  if (!entry) throw new Error("This is not a RapidQuote backup.");
  const manifestBytes = await readZipEntry(entry, MAX_MANIFEST_BYTES);
  const manifest = parseBackupJson(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)) as BackupManifest;
  if (!manifest || manifest.format !== "rapidquote-backup" || manifest.version !== 1 || !Array.isArray(manifest.attachments) ||
      !Array.isArray(manifest.missingAttachments) || manifest.missingAttachments.some((name) => typeof name !== "string")) {
    throw new Error("Unsupported backup format.");
  }
  if (manifest.deployment !== RAPIDQUOTE_DEPLOYMENT_KEY) throw new Error("This backup belongs to a different company environment.");
  parseBackupStore(JSON.stringify(manifest.store));
  const expected = collectAttachments(manifest.store);
  const files = new Map<string, { metadata: MajorProjectSpecAttachment; bytes: Uint8Array }>();
  const usedPaths = new Set<string>();
  let total = manifestBytes.length;
  for (const item of manifest.attachments) {
    const metadata = normalizeMajorProjectSpecAttachment(item?.metadata);
    if (!metadata || !Number.isSafeInteger(item.metadata.sizeBytes) || item.metadata.sizeBytes < 0 ||
        item.metadata.sizeBytes > MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES || !expected.has(metadata.storageKey) || files.has(metadata.storageKey) ||
        typeof item.path !== "string" || !isAttachmentPath(item.path) || usedPaths.has(item.path) ||
        typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error("Invalid attachment in backup.");
    usedPaths.add(item.path);
    const source = zip.file(item.path);
    if (!source) throw new Error(`Missing attachment: ${metadata.fileName}`);
    const bytes = await readZipEntry(source, Math.min(metadata.sizeBytes, MAX_BACKUP_BYTES - total));
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
  const current = parseBackupStore(raw === null ? JSON.stringify(fallback) : raw);
  const incoming = parseBackupStore(JSON.stringify(backup.manifest.store));
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
    if (raw !== null && latestRaw === null) throw new Error("Local quote storage was cleared during restore. Try again.");
    const latest = latestRaw === null ? current : parseBackupStore(latestRaw);
    const merged = mergeRestoredQuotes(latest, incoming);
    const serialized = JSON.stringify(merged.store);
    parseBackupStore(serialized);
    if (storage.getItem(PROPOSAL_STORE_KEY) !== latestRaw) throw new Error("Local quote storage changed during restore. Try again.");
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

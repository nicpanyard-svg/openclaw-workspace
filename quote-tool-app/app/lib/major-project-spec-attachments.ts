import type { MajorProjectSpecAttachment } from "@/app/lib/quote-record";

const ATTACHMENT_DB_NAME = "rapidquote-major-project-specs";
const ATTACHMENT_STORE_NAME = "attachments";
export const MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

type MajorProjectSpecAttachmentRecord = MajorProjectSpecAttachment & {
  fileBlob: Blob;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeFileName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeMimeType(value: string) {
  return value.trim().toLowerCase();
}

export function isMajorProjectSpecAttachmentPdf(fileName: string, mimeType: string) {
  const normalizedFileName = normalizeFileName(fileName);
  const normalizedMimeType = normalizeMimeType(mimeType);
  return normalizedMimeType.includes("pdf") || normalizedFileName.endsWith(".pdf");
}

export function isMajorProjectSpecAttachmentImage(fileName: string, mimeType: string) {
  const normalizedFileName = normalizeFileName(fileName);
  const normalizedMimeType = normalizeMimeType(mimeType);
  return normalizedMimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp"].some((extension) => normalizedFileName.endsWith(extension));
}

export function validateMajorProjectSpecAttachmentFile(file: Pick<File, "name" | "size" | "type">) {
  if (!isMajorProjectSpecAttachmentPdf(file.name, file.type) && !isMajorProjectSpecAttachmentImage(file.name, file.type)) {
    throw new Error("Only PDF or image attachments are supported.");
  }

  if (file.size > MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES) {
    throw new Error(`Attachments must be ${Math.round(MAJOR_PROJECT_SPEC_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB or smaller.`);
  }
}

export function normalizeMajorProjectSpecAttachment(value: unknown): MajorProjectSpecAttachment | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<MajorProjectSpecAttachment>;
  const storageKey = normalizeText(candidate.storageKey).trim();
  const fileName = normalizeText(candidate.fileName).trim();
  const mimeType = normalizeText(candidate.mimeType).trim();
  const updatedAt = normalizeText(candidate.updatedAt).trim();
  const sizeBytes = Number(candidate.sizeBytes);

  if (!storageKey || !fileName) return undefined;

  return {
    storageKey,
    fileName,
    mimeType,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0,
    updatedAt,
  };
}

function openAttachmentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof window.indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = window.indexedDB.open(ATTACHMENT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
        database.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "storageKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open the attachment database."));
  });
}

function runAttachmentTransaction<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) {
  return openAttachmentDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(ATTACHMENT_STORE_NAME, mode);
    const store = transaction.objectStore(ATTACHMENT_STORE_NAME);

    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Attachment transaction was aborted."));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Attachment transaction failed."));
    };

    executor(store, resolve, reject);
  }));
}

export function createMajorProjectSpecAttachmentStorageKey(itemId: string) {
  return `major-project-spec:${itemId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export async function persistMajorProjectSpecAttachmentFile(file: File, storageKey: string) {
  validateMajorProjectSpecAttachmentFile(file);

  const attachment: MajorProjectSpecAttachment = {
    storageKey,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    updatedAt: new Date().toISOString(),
  };

  await runAttachmentTransaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.put({
      ...attachment,
      fileBlob: file,
    } satisfies MajorProjectSpecAttachmentRecord);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to store the attachment."));
  });

  return attachment;
}

export async function getMajorProjectSpecAttachmentFile(storageKey: string) {
  const record = await runAttachmentTransaction<MajorProjectSpecAttachmentRecord | undefined>("readonly", (store, resolve, reject) => {
    const request = store.get(storageKey);
    request.onsuccess = () => resolve(request.result as MajorProjectSpecAttachmentRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Failed to load the attachment."));
  });

  return record?.fileBlob;
}

export async function deleteMajorProjectSpecAttachmentFile(storageKey: string) {
  await runAttachmentTransaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(storageKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete the attachment."));
  });
}

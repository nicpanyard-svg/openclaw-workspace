import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createQuoteBackup, readQuoteBackup, restoreQuoteBackup, parseBackupStore, mergeRestoredQuotes, MAX_BACKUP_BYTES } from "./quote-backup";
import { createBlankQuoteRecord } from "./quote-template";
import { createProposalFromQuote, mockUsers, PROPOSAL_STORE_KEY, type ProposalStoreData } from "./proposal-store";

function store(id = "backup-fixture"): ProposalStoreData {
  const quote = createBlankQuoteRecord();
  quote.customer.name = "Backup test customer";
  quote.metadata.proposalNumber = id;
  const proposal = createProposalFromQuote({ quote, owner: mockUsers[0], currentUser: mockUsers[0] });
  proposal.id = id;
  return { currentUser: mockUsers[0], users: mockUsers, proposals: [proposal] };
}
function memory() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}
function files() {
  const entries = new Map<string, Blob>();
  return { entries, load: async (key: string) => entries.get(key), save: async (file: File, key: string) => { entries.set(key, file); }, remove: async (key: string) => { entries.delete(key); } };
}

async function archive(source = store(), io = files()) {
  const backup = await createQuoteBackup(source, io);
  return JSZip.loadAsync(await backup.blob.arrayBuffer());
}

async function archiveBlob(zip: JSZip, compression: "STORE" | "DEFLATE" = "STORE") {
  return new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression }))]);
}

function attachmentStore(id = "incoming") {
  const source = store(id), io = files();
  source.proposals[0].quote.majorProject.summary.systemDrawings = [{ storageKey: "x", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 4, updatedAt: "2026-10-18" }];
  io.entries.set("x", new Blob(["data"]));
  return { source, io };
}

// Mutate ZIP headers directly so JSZip cannot normalize away the hostile fixture.
function centralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  let offset = view.getUint32(end + 16, true);
  const entries: number[] = [];
  while (offset < end) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    entries.push(offset);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return { view, end, entries };
}

test("backup preserves quote fields, ownership, IDs, history and attached bytes", async () => {
  const source = store(), io = files();
  source.proposals[0].quote.majorProject.summary.systemDrawings = [{ storageKey: "drawing", fileName: "drawing.pdf", mimeType: "application/pdf", sizeBytes: 13, updatedAt: "2026-10-18" }];
  io.entries.set("drawing", new Blob(["%PDF-fixture"]));
  const backup = await createQuoteBackup(source, io);
  const loaded = await readQuoteBackup(backup.blob);
  assert.deepEqual(loaded.manifest.store, JSON.parse(JSON.stringify(source)));
  assert.equal(new TextDecoder().decode(loaded.files.get("drawing")!.bytes), "%PDF-fixture");
  assert.deepEqual(backup.missingAttachments, []);
  const destination = memory(), targetFiles = files();
  const result = await restoreQuoteBackup(loaded, destination, { ...source, proposals: [] }, targetFiles);
  const saved = parseBackupStore(destination.getItem(PROPOSAL_STORE_KEY)!);
  const key = saved.proposals[0].quote.majorProject.summary.systemDrawings![0].storageKey;
  assert.notEqual(key, "drawing");
  assert.equal(await targetFiles.entries.get(key)!.text(), "%PDF-fixture");
  assert.equal(result.added, 1);
  assert.equal(saved.proposals[0].id, source.proposals[0].id);
  assert.deepEqual(saved.proposals[0].quote.sections, JSON.parse(JSON.stringify(source.proposals[0].quote.sections)));
});

test("restore never replaces existing records and keeps the local current user", () => {
  const current = store(), incoming = store();
  current.proposals[0].quote.customer.name = "Newer local edit";
  const merged = mergeRestoredQuotes(current, incoming);
  assert.equal(merged.added, 0);
  assert.equal(merged.skipped, 1);
  assert.deepEqual(merged.store, current);
});

test("backup reports unavailable attachment files without dropping their references", async () => {
  const source = store();
  source.proposals[0].quote.majorProject.summary.systemDrawings = [{ storageKey: "missing", fileName: "lost.pdf", mimeType: "application/pdf", sizeBytes: 13, updatedAt: "2026-10-18" }];
  const backup = await createQuoteBackup(source, files());
  assert.deepEqual(backup.missingAttachments, ["lost.pdf"]);
  assert.deepEqual((await readQuoteBackup(backup.blob)).missingAttachments, ["lost.pdf"]);
});

test("restore rejects invalid records and a different company's backup", async () => {
  const backup = await createQuoteBackup(store(), files());
  const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  manifest.deployment = "ilios";
  zip.file("manifest.json", JSON.stringify(manifest));
  await assert.rejects(readQuoteBackup(new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" }))])), /different company/);
  const invalid = store();
  invalid.proposals[0].quote.metadata.proposalNumber = "";
  assert.throws(() => parseBackupStore(JSON.stringify(invalid)), /could not all be read/);
});

test("attachment corruption is detected before restoring any records", async () => {
  const source = store(), io = files();
  source.proposals[0].quote.majorProject.summary.systemDrawings = [{ storageKey: "x", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 4, updatedAt: "2026-10-18" }];
  io.entries.set("x", new Blob(["good"]));
  const backup = await createQuoteBackup(source, io);
  const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer());
  zip.file("attachments/0.bin", "evil");
  await assert.rejects(readQuoteBackup(new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" }))])), /integrity/);
});

test("a storage quota failure leaves existing quotes intact and removes newly restored files", async () => {
  const source = store(), io = files(), target = files();
  source.proposals[0].quote.majorProject.summary.systemDrawings = [{ storageKey: "x", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 4, updatedAt: "2026-10-18" }];
  io.entries.set("x", new Blob(["data"]));
  const loaded = await readQuoteBackup((await createQuoteBackup(source, io)).blob);
  const current = store("existing"), serialized = JSON.stringify(current);
  const storage = { getItem: () => serialized, setItem: () => { throw new Error("QuotaExceededError"); } };
  await assert.rejects(restoreQuoteBackup(loaded, storage, current, target), /QuotaExceeded/);
  assert.equal(storage.getItem(), serialized);
  assert.equal(target.entries.size, 0);
});

test("a save from another tab during attachment restore is preserved", async () => {
  const storage = memory(), current = store("existing"), incoming = store("incoming"), io = files();
  incoming.proposals[0].quote.majorProject.summary.systemDrawings = [{ storageKey: "x", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 4, updatedAt: "2026-10-18" }];
  io.entries.set("x", new Blob(["data"]));
  const loaded = await readQuoteBackup((await createQuoteBackup(incoming, io)).blob);
  storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(current));
  const target = { ...files(), save: async () => { current.proposals.push(store("another-tab").proposals[0]); storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(current)); } };
  await restoreQuoteBackup(loaded, storage, current, target);
  assert.deepEqual(parseBackupStore(storage.getItem(PROPOSAL_STORE_KEY)!).proposals.map(p => p.id), ["existing", "another-tab", "incoming"]);
});

test("oversized archives are rejected before reading their bytes", async () => {
  const file = new Blob([]);
  Object.defineProperties(file, {
    size: { value: MAX_BACKUP_BYTES + 1 },
    arrayBuffer: { value: () => assert.fail("Oversized archive was read") },
  });
  await assert.rejects(readQuoteBackup(file), /100 MB/);
});

test("store JSON has a byte limit, including multibyte text", () => {
  const raw = JSON.stringify(store());
  assert.throws(() => parseBackupStore(raw + " ".repeat(10 * 1024 * 1024)), /backup limit/);
  const source = store();
  source.proposals[0].quote.customer.name = "\u00e9".repeat(5 * 1024 * 1024);
  const unicode = JSON.stringify(source);
  assert.ok(unicode.length < 10 * 1024 * 1024);
  assert.throws(() => parseBackupStore(unicode), /backup limit/);
});

test("store validation rejects non-string and duplicate proposal IDs", () => {
  for (const id of [null, 1, {}, ["backup-fixture"]]) {
    const source = store();
    Object.assign(source.proposals[0], { id });
    assert.throws(() => parseBackupStore(JSON.stringify(source)), /could not all be read/);
  }
  const source = store();
  source.proposals.push(source.proposals[0]);
  assert.throws(() => parseBackupStore(JSON.stringify(source)), /could not all be read/);
});

test("prototype-related keys are rejected throughout store and manifest JSON", async () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const source = store();
    Object.defineProperty(source.proposals[0].quote.customer, key, { value: { polluted: true }, enumerable: true });
    assert.throws(() => parseBackupStore(JSON.stringify(source)), /unsafe property/);
    const zip = await archive();
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    manifest.extension = JSON.parse(`{"${key}":{"polluted":true}}`);
    zip.file("manifest.json", JSON.stringify(manifest));
    await assert.rejects(readQuoteBackup(await archiveBlob(zip)), /unsafe property/);
  }
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("deep JSON is rejected before recursive application readers run", async () => {
  const nested = "[".repeat(5000) + "0" + "]".repeat(5000);
  const raw = `{"extension":${nested},${JSON.stringify(store()).slice(1)}`;
  assert.throws(() => parseBackupStore(raw), /nesting depth/);
  const zip = await archive();
  const manifest = await zip.file("manifest.json")!.async("string");
  zip.file("manifest.json", `{"extension":${nested},${manifest.slice(1)}`);
  await assert.rejects(readQuoteBackup(await archiveBlob(zip)), /nesting depth/);
});

test("safe extension data and compressed backups with ZIP comments remain readable", async () => {
  const source = store();
  Object.assign(source.proposals[0], { extension: { label: "constructor", values: [1, "__proto__", null] } });
  const zip = await archive(source);
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", comment: "Original browser backup" });
  const loaded = await readQuoteBackup(new Blob([new Uint8Array(bytes)]));
  assert.deepEqual(loaded.manifest.store, JSON.parse(JSON.stringify(source)));
});

test("archive traversal, absolute paths, backslashes, and NUL paths are rejected", async () => {
  for (const path of ["../manifest.json", "folder/../manifest.json", "/manifest.json", "C:\\manifest.json", "manifest.json\0", "attachments/../manifest.json", "attachments/0.bin\n"]) {
    const zip = await archive();
    const manifest = await zip.file("manifest.json")!.async("string");
    zip.remove("manifest.json");
    zip.file(path, manifest, { createFolders: false });
    await assert.rejects(readQuoteBackup(await archiveBlob(zip)), /path in backup archive/);
  }
});

test("duplicate ZIP paths and disagreeing local filenames are rejected", async () => {
  const zip = await archive();
  zip.file("attachments/0.bin", "a");
  zip.file("attachments/1.bin", "b");
  const duplicate = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
  const name = Buffer.from("attachments/1.bin"), replacement = Buffer.from("attachments/0.bin");
  for (let index = duplicate.indexOf(name); index !== -1; index = duplicate.indexOf(name, index + name.length)) {
    duplicate.set(replacement, index);
  }
  await assert.rejects(readQuoteBackup(new Blob([duplicate])), /duplicate path/);
  const mismatch = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
  mismatch.set(replacement, mismatch.indexOf(name));
  await assert.rejects(readQuoteBackup(new Blob([mismatch])), /unsupported backup archive/);
});

test("invalid ZIP directory counts, ZIP64 markers, and truncated archives are rejected", async () => {
  const zip = await archive();
  for (const count of [0, 0xffff]) {
    const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
    const { view, end } = centralDirectory(bytes);
    view.setUint16(end + 8, count, true);
    view.setUint16(end + 10, count, true);
    await assert.rejects(readQuoteBackup(new Blob([bytes])), /unsupported backup archive/);
  }
  for (const length of [0, 4, 21]) {
    await assert.rejects(readQuoteBackup(new Blob([new Uint8Array(length)])), /unsupported backup archive/);
  }
});

test("declared expansion is bounded across all archive entries", async () => {
  const zip = await archive();
  for (let index = 0; index < 5; index++) zip.file(`attachments/${index}.bin`, "x");
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
  const { view, entries } = centralDirectory(bytes);
  for (const offset of entries) {
    const path = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + view.getUint16(offset + 28, true)));
    if (path.endsWith(".bin")) view.setUint32(offset + 24, 25 * 1024 * 1024, true);
  }
  await assert.rejects(readQuoteBackup(new Blob([bytes])), /supported size/);
});

test("manifest expansion is bounded even when ZIP size metadata lies", async () => {
  const zip = await archive();
  const manifest = await zip.file("manifest.json")!.async("string");
  zip.file("manifest.json", manifest + " ".repeat(10 * 1024 * 1024));
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  await assert.rejects(readQuoteBackup(new Blob([bytes])), /supported size/);
  const { view, entries } = centralDirectory(bytes);
  view.setUint32(entries[0] + 24, 10 * 1024 * 1024, true);
  await assert.rejects(readQuoteBackup(new Blob([bytes])), /supported size/);
});

test("attachment reads stop at the manifest size instead of expanding to the per-file limit", async () => {
  const { source, io } = attachmentStore();
  const zip = await archive(source, io);
  zip.file("attachments/0.bin", "x".repeat(1024 * 1024));
  await assert.rejects(readQuoteBackup(await archiveBlob(zip, "DEFLATE")), /supported size/);
});

test("malformed manifests and attachment sizes are rejected without coercion", async () => {
  const { source, io } = attachmentStore();
  for (const sizeBytes of ["4", -1, 0.5, null, 25 * 1024 * 1024 + 1]) {
    const zip = await archive(source, io);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    manifest.attachments[0].metadata.sizeBytes = sizeBytes;
    zip.file("manifest.json", JSON.stringify(manifest));
    await assert.rejects(readQuoteBackup(await archiveBlob(zip)), /Invalid attachment/);
  }
  for (const manifest of [null, {}, { format: "rapidquote-backup", version: 1, attachments: [], missingAttachments: [null] }]) {
    const zip = new JSZip().file("manifest.json", JSON.stringify(manifest));
    await assert.rejects(readQuoteBackup(await archiveBlob(zip)), /Unsupported backup format/);
  }
  const zip = await archive(source, io);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  manifest.attachments = [null];
  zip.file("manifest.json", JSON.stringify(manifest));
  await assert.rejects(readQuoteBackup(await archiveBlob(zip)), /Invalid attachment/);
});

test("two manifest attachments cannot alias the same archive entry", async () => {
  const { source, io } = attachmentStore();
  source.proposals[0].quote.majorProject.summary.systemDrawings!.push({ ...source.proposals[0].quote.majorProject.summary.systemDrawings![0], storageKey: "y" });
  io.entries.set("y", new Blob(["data"]));
  const zip = await archive(source, io);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  manifest.attachments[1].path = manifest.attachments[0].path;
  zip.file("manifest.json", JSON.stringify(manifest));
  await assert.rejects(readQuoteBackup(await archiveBlob(zip)), /Invalid attachment/);
});

test("attachment-shaped extension fields cannot hide nested references during restore", async () => {
  const { source, io } = attachmentStore();
  Object.assign(source.proposals[0].quote, { storageKey: "decoy", fileName: "decoy.pdf" });
  const loaded = await readQuoteBackup((await createQuoteBackup(source, io)).blob);
  const storage = memory(), target = files();
  target.entries.set("x", new Blob(["local"]));
  const result = await restoreQuoteBackup(loaded, storage, { ...store(), proposals: [] }, target);
  const key = result.store.proposals[0].quote.majorProject.summary.systemDrawings![0].storageKey;
  assert.notEqual(key, "x");
  assert.equal(await target.entries.get(key)!.text(), "data");
  assert.equal(await target.entries.get("x")!.text(), "local");
});

test("restoring a matching quote ID never writes its attachments or replaces local edits", async () => {
  const { source, io } = attachmentStore("existing");
  const loaded = await readQuoteBackup((await createQuoteBackup(source, io)).blob);
  const current = store("existing"), storage = memory();
  current.proposals[0].quote.customer.name = "Local edit";
  storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(current));
  const target = { ...files(), save: async () => assert.fail("Existing attachment was written") };
  const result = await restoreQuoteBackup(loaded, storage, current, target);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.store, JSON.parse(JSON.stringify(current)));
});

test("restore never overwrites invalid existing storage, including an empty string", async () => {
  const loaded = await readQuoteBackup((await createQuoteBackup(store(), files())).blob);
  for (const raw of ["", "not json", "null"]) {
    const storage = memory();
    storage.setItem(PROPOSAL_STORE_KEY, raw);
    await assert.rejects(restoreQuoteBackup(loaded, storage, store(), files()));
    assert.equal(storage.getItem(PROPOSAL_STORE_KEY), raw);
  }
});

test("cleared or corrupted storage during attachment writes aborts restore and cleans up files", async () => {
  const { source, io } = attachmentStore();
  const loaded = await readQuoteBackup((await createQuoteBackup(source, io)).blob);
  for (const changed of [null, "", "not json"]) {
    const storage = memory(), current = store("existing"), target = files();
    storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(current));
    target.entries.set("existing-file", new Blob(["local"]));
    const interrupted = {
      ...target,
      save: async (file: File, key: string) => {
        await target.save(file, key);
        if (changed === null) storage.removeItem(PROPOSAL_STORE_KEY);
        else storage.setItem(PROPOSAL_STORE_KEY, changed);
      },
    };
    await assert.rejects(restoreQuoteBackup(loaded, storage, current, interrupted));
    assert.equal(storage.getItem(PROPOSAL_STORE_KEY), changed);
    assert.deepEqual([...target.entries.keys()], ["existing-file"]);
  }
});

test("a quote added by another tab during restore wins over the incoming copy", async () => {
  const { source, io } = attachmentStore();
  const loaded = await readQuoteBackup((await createQuoteBackup(source, io)).blob);
  const storage = memory(), current = store("existing"), otherTab = store("incoming");
  otherTab.proposals[0].quote.customer.name = "Newer concurrent edit";
  storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(current));
  const target = {
    ...files(),
    save: async () => storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify({ ...current, proposals: [...current.proposals, ...otherTab.proposals] })),
  };
  const result = await restoreQuoteBackup(loaded, storage, current, target);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.store.proposals[1].quote.customer.name, "Newer concurrent edit");
});

test("an intervening save just before commit aborts restore without overwriting it", async () => {
  const { source, io } = attachmentStore();
  const loaded = await readQuoteBackup((await createQuoteBackup(source, io)).blob);
  const current = store("existing"), otherTab = store("another-tab"), storage = memory(), target = files();
  storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(current));
  let reads = 0;
  const concurrent = {
    ...storage,
    getItem: (key: string) => {
      if (++reads === 3) storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(otherTab));
      return storage.getItem(key);
    },
  };
  await assert.rejects(restoreQuoteBackup(loaded, concurrent, current, target), /storage changed/);
  assert.deepEqual(parseBackupStore(storage.getItem(PROPOSAL_STORE_KEY)!), JSON.parse(JSON.stringify(otherTab)));
  assert.equal(target.entries.size, 0);
});

test("missing attachments receive fresh keys and cannot reference an existing local file", async () => {
  const { source } = attachmentStore();
  const loaded = await readQuoteBackup((await createQuoteBackup(source, files())).blob);
  const target = files();
  target.entries.set("x", new Blob(["local"]));
  const result = await restoreQuoteBackup(loaded, memory(), { ...store(), proposals: [] }, target);
  const key = result.store.proposals[0].quote.majorProject.summary.systemDrawings![0].storageKey;
  assert.notEqual(key, "x");
  assert.equal(target.entries.has(key), false);
  assert.equal(await target.entries.get("x")!.text(), "local");
});

test("empty stores and zero-byte attachments round-trip without changing their data", async () => {
  const { source, io } = attachmentStore();
  io.entries.set("x", new Blob([]));
  const zip = await archive(source, io);
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", streamFiles: true });
  const loaded = await readQuoteBackup(new Blob([new Uint8Array(bytes)]));
  assert.equal(loaded.files.get("x")!.bytes.length, 0);
  const empty = { ...store(), proposals: [] };
  assert.deepEqual((await readQuoteBackup((await createQuoteBackup(empty, files())).blob)).manifest.store, JSON.parse(JSON.stringify(empty)));
});

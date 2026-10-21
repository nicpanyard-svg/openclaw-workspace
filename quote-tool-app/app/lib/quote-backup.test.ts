import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createQuoteBackup, readQuoteBackup, restoreQuoteBackup, parseBackupStore, mergeRestoredQuotes } from "./quote-backup";
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
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}
function files() {
  const entries = new Map<string, Blob>();
  return { entries, load: async (key: string) => entries.get(key), save: async (file: File, key: string) => { entries.set(key, file); }, remove: async (key: string) => { entries.delete(key); } };
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

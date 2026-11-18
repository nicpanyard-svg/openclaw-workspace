import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord } from "./quote-template";
import { createProposalFromQuote, deserializeProposalStore, mockUsers, PROPOSAL_STORE_KEY, type SavedProposalRecord, type ProposalStoreData } from "./proposal-store";
import { assertProposalRevision, getProposalRevision, markProposalDeleted, saveProposalToWorkspace } from "./proposal-saving";
import { appendRecoveryHistory, createIndexedDbRecoveryStore, createRecoverySnapshot, parseRecoveryHistory, pruneRecoveryEnvelopes, quoteContentKey, QuoteRecoverySession, readRecoveryQuote, RECOVERY_LIMITS, type QuoteRecoveryStore, type RecoverySaveRequest, type RecoverySaveResult } from "./quote-recovery";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function memoryHistory(): QuoteRecoveryStore {
  const values = new Map<string, unknown>();
  return {
    async list(id) { return parseRecoveryHistory(values.get(id), id); },
    async append(snapshot) { values.set(snapshot.quoteId, appendRecoveryHistory(values.get(snapshot.quoteId), snapshot)); },
    async remove(id) { values.delete(id); },
  };
}
function blankStore(): ProposalStoreData { return { currentUser: mockUsers[0], users: mockUsers, proposals: [] }; }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function setup(options: { saved?: boolean; history?: QuoteRecoveryStore; onSave?: (request: RecoverySaveRequest) => RecoverySaveResult | null | Promise<RecoverySaveResult | null> } = {}) {
  const storage = memoryStorage();
  const quote = createBlankQuoteRecord();
  const history = options.history ?? memoryHistory();
  let saved: SavedProposalRecord | null = options.saved ? createProposalFromQuote({ quote }) : null;
  if (saved) {
    saveProposalToWorkspace(storage, blankStore(), saved, { expectedRevision: null });
    saved = deserializeProposalStore(storage.getItem(PROPOSAL_STORE_KEY))!.proposals[0];
  }
  let calls = 0;
  let recovered: typeof quote | null = null;
  const session = new QuoteRecoverySession({
    quote: saved?.quote ?? quote, savedProposal: saved, storage, history, debounceMs: 15,
    withLock: async (action) => action(),
    onChange: () => {},
    onRecover: (value) => { recovered = value; },
    onSave: options.onSave ?? ((request) => {
      calls += 1;
      const store = deserializeProposalStore(storage.getItem(PROPOSAL_STORE_KEY)) ?? blankStore();
      const proposal = createProposalFromQuote({ quote: request.quote });
      const next = saveProposalToWorkspace(storage, store, proposal, { expectedRevision: request.expectedRevision });
      return { proposal, store: next };
    }),
  });
  return { session, storage, history, quote: saved?.quote ?? quote, saved, calls: () => calls, recovered: () => recovered };
}

test("snapshot parsing rejects corrupt data, foreign quote IDs and unsupported versions", () => {
  const quote = createBlankQuoteRecord();
  const snapshot = createRecoverySnapshot(quote, "manual");
  for (const value of [null, {}, { ...snapshot, quoteJson: "{" }, { ...snapshot, version: 2 }, { ...snapshot, quoteId: "other" }, { ...snapshot, createdAt: "invalid" }]) {
    assert.equal(readRecoveryQuote(value, snapshot.quoteId), null);
  }
  const foreign = createBlankQuoteRecord();
  assert.equal(readRecoveryQuote({ ...snapshot, quoteJson: JSON.stringify(foreign) }, snapshot.quoteId), null);
  assert.deepEqual(parseRecoveryHistory({ quoteId: snapshot.quoteId, snapshots: [null, snapshot, snapshot, {}] }, snapshot.quoteId), [snapshot]);
});

test("recovery keeps incomplete customer drafts and custom fields", () => {
  const quote = createBlankQuoteRecord();
  quote.customer.name = "";
  quote.customFields = [{ id: "draft-detail", label: "Draft detail", value: "Not priced yet", visibility: "internal" }];
  const snapshot = createRecoverySnapshot(quote, "autosave");
  const restored = readRecoveryQuote(snapshot, snapshot.quoteId)!;
  assert.equal(restored.customer.name, "");
  assert.deepEqual(restored.customFields, quote.customFields);
  assert.equal(quoteContentKey(restored), quoteContentKey(quote));
});

test("a reopened first-save recovery draft stays unsaved until explicit save", async () => {
  const storage = memoryStorage();
  let calls = 0;
  const session = new QuoteRecoverySession({
    quote: createBlankQuoteRecord(), savedProposal: null, storage, history: memoryHistory(), startPaused: true,
    debounceMs: 10, withLock: async (action) => action(), onChange() {}, onRecover() {},
    onSave: ({ quote, expectedRevision }) => {
      calls += 1;
      const proposal = createProposalFromQuote({ quote });
      return { proposal, store: saveProposalToWorkspace(storage, blankStore(), proposal, { expectedRevision }) };
    },
  });
  await session.start();
  await delay(35);
  assert.equal(session.getState().status, "recovered");
  assert.equal(calls, 0);
  await session.saveNow();
  assert.equal(calls, 1);
  assert.equal(session.getState().status, "saved");
  session.dispose();
});

test("history is deduplicated and bounded by version count and bytes", () => {
  const quote = createBlankQuoteRecord();
  let envelope: unknown;
  for (let i = 0; i < 12; i += 1) {
    quote.metadata.documentTitle = `Revision ${i}`;
    envelope = appendRecoveryHistory(envelope, createRecoverySnapshot(quote, "autosave", new Date(2026, 0, 1, 0, 0, i)));
  }
  const id = quote.internal.quoteId;
  assert.equal(parseRecoveryHistory(envelope, id).length, RECOVERY_LIMITS.versions);
  const newest = parseRecoveryHistory(envelope, id)[0];
  assert.equal(appendRecoveryHistory(envelope, { ...newest, id: "duplicate" }).snapshots.length, RECOVERY_LIMITS.versions);
  assert.throws(() => appendRecoveryHistory(envelope, newest, { ...RECOVERY_LIMITS, quoteBytes: 2 }), /too large/);
  const size = new TextEncoder().encode(newest.quoteJson).length;
  const bounded = appendRecoveryHistory(envelope, { ...newest, id: "new", quoteJson: newest.quoteJson.replace("Revision 11", "Revision 12") }, { ...RECOVERY_LIMITS, quoteBytes: size + 8 });
  assert.equal(bounded.snapshots.length, 1);
});

test("global history pruning keeps the current quote and expires oldest other quotes", () => {
  const histories = Array.from({ length: 4 }, (_, index) => {
    const quote = createBlankQuoteRecord();
    return appendRecoveryHistory(null, createRecoverySnapshot(quote, "manual", new Date(2026, 0, index + 1)));
  });
  const result = pruneRecoveryEnvelopes(histories, histories[0].quoteId, { ...RECOVERY_LIMITS, quotes: 2 });
  assert.deepEqual(result.map((entry) => entry.quoteId), [histories[0].quoteId, histories[3].quoteId]);
});

test("missing IndexedDB is reported rather than pretending history was saved", async () => {
  await assert.rejects(createIndexedDbRecoveryStore().list("quote"), /unavailable/);
});

test("debounced autosave accepts a customer-incomplete draft and does not loop on acknowledgement", async () => {
  const fixture = setup();
  await fixture.session.start();
  for (let index = 0; index < 5; index += 1) {
    const next = structuredClone(fixture.quote);
    next.metadata.documentTitle = `Draft ${index}`;
    fixture.session.setQuote(next);
  }
  await delay(90);
  assert.equal(fixture.calls(), 1);
  assert.equal(fixture.session.getState().status, "saved");
  const saved = deserializeProposalStore(fixture.storage.getItem(PROPOSAL_STORE_KEY))!.proposals[0];
  fixture.session.setQuote(saved.quote);
  await delay(60);
  assert.equal(fixture.calls(), 1);
  assert.equal(saved.quote.customer.name, "");
  assert.equal(saved.quote.metadata.documentTitle, "Draft 4");
  fixture.session.dispose();
});

test("draft autosave leaves an approved quote approved", async () => {
  const fixture = setup({ saved: true });
  await fixture.session.start();
  const quote = structuredClone(fixture.quote);
  quote.metadata.status = "approved";
  fixture.session.setQuote(quote);
  const result = await fixture.session.saveNow("autosave");
  assert.equal(result?.proposal.status, "approved");
  fixture.session.dispose();
});

test("manual saves snapshot the original before overwriting Workspace", async () => {
  const fixture = setup({ saved: true });
  await fixture.session.start();
  const oldTitle = fixture.quote.metadata.documentTitle;
  const next = structuredClone(fixture.quote);
  next.metadata.documentTitle = "New title";
  fixture.session.setQuote(next);
  await fixture.session.saveNow();
  const versions = await fixture.history.list(fixture.quote.internal.quoteId);
  assert.ok(versions.some((version) => version.reason === "before-save" && readRecoveryQuote(version, version.quoteId)?.metadata.documentTitle === oldTitle));
  assert.ok(versions.some((version) => version.reason === "manual" && readRecoveryQuote(version, version.quoteId)?.metadata.documentTitle === "New title"));
  fixture.session.dispose();
});

test("quota failures leave Workspace unchanged, preserve recovery and do not retry forever", async () => {
  const fixture = setup({ onSave: () => { throw new DOMException("full", "QuotaExceededError"); } });
  await fixture.session.start();
  await fixture.session.saveNow();
  assert.equal(fixture.storage.getItem(PROPOSAL_STORE_KEY), null);
  assert.equal(fixture.session.getState().status, "error");
  assert.match(fixture.session.getState().error!, /Do not clear browser data/);
  assert.equal((await fixture.history.list(fixture.quote.internal.quoteId)).length, 1);
  await delay(40);
  assert.equal(fixture.session.getState().status, "error");
  fixture.session.dispose();
});

test("history quota failure is separate from a verified Workspace save", async () => {
  const fixture = setup({ history: { async list() { return []; }, async append() { throw new DOMException("full", "QuotaExceededError"); }, async remove() {} } });
  await fixture.session.start();
  await fixture.session.saveNow();
  assert.equal(fixture.session.getState().status, "saved");
  assert.match(fixture.session.getState().historyWarning!, /Recovery version not saved/);
  fixture.session.dispose();
});

test("an unverified or null persistence callback is never reported as saved", async () => {
  for (const onSave of [() => null, ({ quote }: RecoverySaveRequest) => ({ proposal: createProposalFromQuote({ quote }), store: blankStore() })]) {
    const fixture = setup({ onSave });
    await fixture.session.start();
    assert.equal(await fixture.session.saveNow(), null);
    assert.notEqual(fixture.session.getState().status, "saved");
    fixture.session.dispose();
  }
});

test("another tab's update blocks autosave without silently rebasing", async () => {
  const fixture = setup({ saved: true });
  await fixture.session.start();
  const disk = deserializeProposalStore(fixture.storage.getItem(PROPOSAL_STORE_KEY))!;
  disk.proposals[0].quote.metadata.documentTitle = "Other tab";
  saveProposalToWorkspace(fixture.storage, disk, disk.proposals[0]);
  fixture.session.setQuote({ ...fixture.quote, metadata: { ...fixture.quote.metadata, documentTitle: "This tab" } });
  assert.equal(await fixture.session.saveNow(), null);
  assert.equal(fixture.session.getState().status, "conflict");
  assert.equal(fixture.calls(), 0);
  assert.equal(deserializeProposalStore(fixture.storage.getItem(PROPOSAL_STORE_KEY))!.proposals[0].quote.metadata.documentTitle, "Other tab");
  fixture.session.dispose();
});

test("a deleted quote cannot autosave, load recovery, or be reintroduced as new", async () => {
  const fixture = setup({ saved: true });
  await fixture.history.append(createRecoverySnapshot(fixture.quote, "manual"));
  await fixture.session.start();
  markProposalDeleted(fixture.storage, fixture.quote.internal.quoteId);
  fixture.storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(blankStore()));
  assert.equal(await fixture.session.recover((await fixture.history.list(fixture.quote.internal.quoteId))[0].id), false);
  assert.equal(await fixture.session.saveNow(), null);
  assert.equal(fixture.session.getState().status, "conflict");
  assert.equal(fixture.calls(), 0);
  assert.throws(() => assertProposalRevision(fixture.storage, fixture.quote.internal.quoteId, null), /deleted/);
  fixture.session.dispose();
});

test("recover loads an unsaved draft and stays paused through edits until manual save", async () => {
  const fixture = setup({ saved: true });
  const versionQuote = structuredClone(fixture.quote);
  versionQuote.metadata.documentTitle = "Earlier version";
  const version = createRecoverySnapshot(versionQuote, "manual");
  await fixture.history.append(version);
  await fixture.session.start();
  const before = fixture.storage.getItem(PROPOSAL_STORE_KEY);
  assert.equal(await fixture.session.recover(version.id), true);
  assert.equal(fixture.recovered()?.metadata.documentTitle, "Earlier version");
  assert.equal(fixture.storage.getItem(PROPOSAL_STORE_KEY), before);
  const edited = structuredClone(versionQuote);
  edited.metadata.documentTitle = "Reviewed recovery";
  fixture.session.setQuote(edited);
  await delay(45);
  assert.equal(fixture.calls(), 0);
  assert.equal(await fixture.session.saveNow("autosave"), null);
  assert.equal(fixture.session.getState().paused, true);
  await fixture.session.saveNow();
  assert.equal(fixture.calls(), 1);
  assert.equal(fixture.session.getState().paused, false);
  fixture.session.dispose();
});

test("quote identity mismatch is rejected and updates for another quote are ignored", async () => {
  const fixture = setup({ saved: true });
  await fixture.session.start();
  fixture.session.setQuote(createBlankQuoteRecord());
  await delay(40);
  assert.equal(fixture.calls(), 0);
  fixture.session.dispose();
  assert.throws(() => new QuoteRecoverySession({ quote: createBlankQuoteRecord(), savedProposal: fixture.saved, storage: fixture.storage, history: fixture.history, withLock: async (fn) => fn(), onChange() {}, onRecover() {}, onSave: () => null }), /do not match/);
});

test("disposing while history is writing cancels the old quote save callback", async () => {
  let finish: (() => void) | undefined;
  const fixture = setup({ history: { async list() { return []; }, append: () => new Promise<void>((resolve) => { finish = resolve; }), async remove() {} } });
  await fixture.session.start();
  const saving = fixture.session.saveNow();
  await delay(0);
  fixture.session.dispose();
  finish!();
  await saving;
  assert.equal(fixture.calls(), 0);
});

test("edits during snapshot writing are saved on the next pass, not overwritten", async () => {
  const base = memoryHistory();
  let finish: (() => void) | undefined;
  let block = true;
  const fixture = setup({ history: { ...base, async append(snapshot) { if (block) { block = false; await new Promise<void>((resolve) => { finish = resolve; }); } await base.append(snapshot); } } });
  await fixture.session.start();
  const saving = fixture.session.saveNow();
  await delay(0);
  fixture.session.setQuote({ ...fixture.quote, metadata: { ...fixture.quote.metadata, documentTitle: "Still typing" } });
  finish!();
  await saving;
  await delay(70);
  assert.equal(fixture.calls(), 1);
  assert.equal(deserializeProposalStore(fixture.storage.getItem(PROPOSAL_STORE_KEY))!.proposals[0].quote.metadata.documentTitle, "Still typing");
  fixture.session.dispose();
});

test("the saved revision token changes even when timestamps are identical", () => {
  const fixture = setup({ saved: true });
  const old = getProposalRevision(fixture.saved);
  const proposal = structuredClone(fixture.saved!);
  proposal.quote.metadata.documentTitle = "Edit with same timestamp";
  const store = deserializeProposalStore(fixture.storage.getItem(PROPOSAL_STORE_KEY))!;
  saveProposalToWorkspace(fixture.storage, store, proposal, { expectedRevision: old });
  assert.notEqual(getProposalRevision(proposal), old);
  fixture.session.dispose();
});

test("navigation flushes edits immediately instead of losing the debounce window", async () => {
  const fixture = setup({ saved: true });
  await fixture.session.start();
  fixture.session.setQuote({ ...fixture.quote, metadata: { ...fixture.quote.metadata, documentTitle: "Leave immediately" } });
  assert.equal(await fixture.session.prepareToLeave(() => { throw new Error("Ordinary draft should not need confirmation"); }), true);
  assert.equal(fixture.calls(), 1);
  assert.equal(deserializeProposalStore(fixture.storage.getItem(PROPOSAL_STORE_KEY))!.proposals[0].quote.metadata.documentTitle, "Leave immediately");
  fixture.session.dispose();
  await delay(30);
  assert.equal(fixture.calls(), 1);
});

test("navigation waits for an active save and disposal cancels permission to leave", async () => {
  const history = memoryHistory();
  let release: (() => void) | undefined;
  let hold = true;
  const fixture = setup({ history: { ...history, async append(snapshot) { if (hold) { hold = false; await new Promise<void>((resolve) => { release = resolve; }); } await history.append(snapshot); } } });
  await fixture.session.start();
  const saving = fixture.session.saveNow();
  let finished = false;
  const leaving = fixture.session.prepareToLeave(() => true).then((allowed) => { finished = true; return allowed; });
  await delay(0);
  assert.equal(finished, false);
  fixture.session.dispose();
  release!();
  await saving;
  assert.equal(await leaving, false);
  assert.equal(fixture.calls(), 0);
});

test("navigation never accepts a recovered version without explicit confirmation", async () => {
  const fixture = setup({ saved: true });
  const old = structuredClone(fixture.quote);
  old.metadata.documentTitle = "Recovered option";
  const snapshot = createRecoverySnapshot(old, "manual");
  await fixture.history.append(snapshot);
  await fixture.session.start();
  await fixture.session.recover(snapshot.id);
  assert.equal(await fixture.session.prepareToLeave(() => false), false);
  assert.equal(fixture.calls(), 0);
  assert.equal(fixture.session.getState().paused, true);
  assert.equal(await fixture.session.prepareToLeave(() => true), true);
  assert.equal(fixture.calls(), 1);
  fixture.session.dispose();
});

test("navigation remains on the editor after a failed save", async () => {
  const fixture = setup({ onSave: () => { throw new DOMException("Full", "QuotaExceededError"); } });
  await fixture.session.start();
  assert.equal(await fixture.session.prepareToLeave(() => true), false);
  assert.equal(fixture.session.getState().status, "error");
  fixture.session.dispose();
});

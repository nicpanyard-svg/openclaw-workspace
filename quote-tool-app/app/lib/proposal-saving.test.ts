import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord } from "./quote-template";
import { createProposalFromQuote, deserializeProposalStore, mockUsers, PROPOSAL_STORE_KEY, type ProposalStoreData } from "./proposal-store";
import { assertProposalRevision, assignQuoteOwner, getProposalRevision, isProposalOwner, markProposalDeleted, readWorkspaceStore, saveProposalToWorkspace } from "./proposal-saving";
import { ensureNickTrainingDemoProposalStore, getNickTrainingDemoProposals } from "./nick-training-demo";
import { ensureIliosSampleProposalStore, getIliosSampleProposals } from "./ilios-sample-data";

const creator = { id: "another-sales-user", name: "Another salesperson", email: "salesperson@example.com" };
function emptyStore(): ProposalStoreData {
  return { currentUser: creator, users: mockUsers, proposals: [] };
}
function memoryStorage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}

test("a new quote does not inherit the template owner's identity", () => {
  const quote = createBlankQuoteRecord();
  assert.equal(quote.metadata.ownerUserId, undefined);
  assert.equal(quote.metadata.ownerName, undefined);
  assert.equal(quote.internal.workspaceOwnerId, undefined);
  assert.equal(quote.internal.workspaceOwnerName, undefined);
  assert.equal(quote.internal.crmOwnerLabel, undefined);
});

test("another salesperson can save, reload Workspace, and find their own quote", () => {
  const storage = memoryStorage();
  const quote = assignQuoteOwner(createBlankQuoteRecord(), creator);
  quote.customer.name = "Save regression customer";
  const proposal = createProposalFromQuote({ quote, owner: creator, currentUser: creator });
  saveProposalToWorkspace(storage, emptyStore(), proposal);
  const reopened = ensureNickTrainingDemoProposalStore(deserializeProposalStore(storage.getItem(PROPOSAL_STORE_KEY))!);
  const mine = reopened.proposals.filter((entry) => isProposalOwner(entry.owner, creator));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].quote.metadata.proposalNumber, quote.metadata.proposalNumber);
  assert.equal(mine[0].quote.customer.name, "Save regression customer");
  assert.equal(mine[0].quote.metadata.ownerUserId, creator.id);
  assert.equal(mine[0].quote.internal.workspaceOwnerId, creator.id);
  // Saving again updates this record rather than creating a duplicate.
  proposal.quote.customer.name = "Updated customer";
  saveProposalToWorkspace(storage, reopened, proposal);
  const updated = deserializeProposalStore(storage.getItem(PROPOSAL_STORE_KEY))!;
  assert.equal(updated.proposals.filter((entry) => entry.id === proposal.id).length, 1);
  assert.equal(updated.proposals.find((entry) => entry.id === proposal.id)!.quote.customer.name, "Updated customer");
});

test("My quotes recognizes legacy owner IDs using the same email address", () => {
  assert.equal(isProposalOwner({ ...creator, id: "legacy-id", email: " SALESPERSON@example.com " }, creator), true);
  assert.equal(isProposalOwner(mockUsers[0], creator), false);
});

test("opening Workspace preserves saved edits to training quotes", () => {
  const proposal = getNickTrainingDemoProposals()[0];
  proposal.quote.customer.name = "Real customer entered into a sample";
  proposal.quote.metadata.documentTitle = "Saved custom title";
  const next = ensureNickTrainingDemoProposalStore({ ...emptyStore(), proposals: [proposal] });
  assert.equal(next.proposals.find((entry) => entry.id === proposal.id)!.quote.customer.name, proposal.quote.customer.name);
  assert.equal(next.proposals.find((entry) => entry.id === proposal.id)!.quote.metadata.documentTitle, "Saved custom title");
});

test("opening the Ilios workspace also preserves sample quote edits", () => {
  const proposal = getIliosSampleProposals()[0];
  proposal.quote.metadata.documentTitle = "Saved Ilios edits";
  const next = ensureIliosSampleProposalStore({ ...emptyStore(), proposals: [proposal] });
  assert.equal(next.proposals.find((entry) => entry.id === proposal.id)!.quote.metadata.documentTitle, "Saved Ilios edits");
});

test("a full browser store reports a save failure and preserves the previous record", () => {
  const storage = memoryStorage();
  const quote = assignQuoteOwner(createBlankQuoteRecord(), creator);
  const proposal = createProposalFromQuote({ quote, owner: creator, currentUser: creator });
  const saved = saveProposalToWorkspace(storage, emptyStore(), proposal);
  const previousValue = storage.getItem(PROPOSAL_STORE_KEY);
  const fullStorage = { ...storage, setItem() { throw new DOMException("Full", "QuotaExceededError"); } };
  proposal.quote.customer.name = "Unsaved edit";
  assert.throws(() => saveProposalToWorkspace(fullStorage, saved, proposal), { name: "QuotaExceededError" });
  assert.equal(storage.getItem(PROPOSAL_STORE_KEY), previousValue);
});

test("a write that does not persist is not reported as saved", () => {
  const storage = { getItem: () => null, setItem: () => {} };
  const proposal = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  assert.throws(() => saveProposalToWorkspace(storage, emptyStore(), proposal), /could not be verified/);
});

test("quotes that Workspace cannot read are rejected before overwriting storage", () => {
  const storage = memoryStorage();
  const proposal = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  proposal.quote.metadata.proposalNumber = "";
  assert.throws(() => saveProposalToWorkspace(storage, emptyStore(), proposal), /quote number/);
  assert.equal(storage.getItem(PROPOSAL_STORE_KEY), null);
});

test("an older opened revision cannot overwrite a newer saved quote", () => {
  const storage = memoryStorage();
  const first = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  saveProposalToWorkspace(storage, emptyStore(), first, { expectedRevision: null });
  const opened = deserializeProposalStore(storage.getItem(PROPOSAL_STORE_KEY))!;
  const stale = structuredClone(opened.proposals[0]);
  const revision = getProposalRevision(stale);
  const newer = structuredClone(stale);
  newer.quote.customer.name = "Newer tab edit";
  saveProposalToWorkspace(storage, opened, newer, { expectedRevision: revision });
  stale.quote.customer.name = "Older tab edit";
  const before = storage.getItem(PROPOSAL_STORE_KEY);
  assert.throws(() => saveProposalToWorkspace(storage, opened, stale, { expectedRevision: revision }), /changed in another tab/);
  assert.equal(storage.getItem(PROPOSAL_STORE_KEY), before);
});

test("saving one quote merges unrelated records added by another tab", () => {
  const storage = memoryStorage();
  const first = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  const second = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  const staleStore = saveProposalToWorkspace(storage, emptyStore(), first);
  const firstRevision = getProposalRevision(first);
  saveProposalToWorkspace(storage, staleStore, second, { expectedRevision: null });
  first.quote.customer.name = "Updated";
  saveProposalToWorkspace(storage, staleStore, first, { expectedRevision: firstRevision });
  assert.equal(readWorkspaceStore(storage)!.proposals.length, 2);
});

test("new saves cannot reuse existing IDs and deletions cannot be resurrected", () => {
  const storage = memoryStorage();
  const proposal = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  const store = saveProposalToWorkspace(storage, emptyStore(), proposal, { expectedRevision: null });
  assert.throws(() => saveProposalToWorkspace(storage, store, proposal, { expectedRevision: null }), /changed in another tab/);
  markProposalDeleted(storage, proposal.id);
  storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(emptyStore()));
  assert.throws(() => saveProposalToWorkspace(storage, emptyStore(), proposal, { expectedRevision: null }), /deleted/);
});

test("legacy deletion without a marker still conflicts with an opened record", () => {
  const storage = memoryStorage();
  const proposal = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  saveProposalToWorkspace(storage, emptyStore(), proposal);
  const revision = getProposalRevision(proposal);
  storage.setItem(PROPOSAL_STORE_KEY, JSON.stringify(emptyStore()));
  assert.throws(() => assertProposalRevision(storage, proposal.id, revision), /deleted/);
});

test("corrupt and partially unreadable Workspace data is never overwritten", () => {
  const storage = memoryStorage();
  const proposal = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  for (const damaged of ["{", JSON.stringify({ ...emptyStore(), proposals: [proposal, { id: "damaged", quote: {} }] }), JSON.stringify({ ...emptyStore(), proposals: [proposal, proposal] })]) {
    storage.setItem(PROPOSAL_STORE_KEY, damaged);
    assert.throws(() => saveProposalToWorkspace(storage, emptyStore(), proposal), /could not be read/);
    assert.equal(storage.getItem(PROPOSAL_STORE_KEY), damaged);
  }
});

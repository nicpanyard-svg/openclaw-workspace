import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord, generateQuoteNumber } from "./quote-template";
import { createProposalCopy, createProposalFromQuote, deserializeProposalStore, getDefaultProposalStore, getProposalById, serializeProposalStore, upsertProposal } from "./proposal-store";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { buildProposalPdfFileName } from "./proposal-file-name";

const shortNumber = /^RQ-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

test("new quote references are short and omit easily confused characters", () => {
  const numbers = Array.from({ length: 1000 }, () => generateQuoteNumber());
  assert.equal(new Set(numbers).size, numbers.length);
  for (const number of numbers) {
    assert.match(number, shortNumber);
    assert.equal(number.length, 12);
  }
});

test("known references are checked case-insensitively and collisions are retried", (t) => {
  let calls = 0;
  t.mock.method(crypto, "getRandomValues", (bytes: Uint8Array) => bytes.fill(calls++));
  assert.equal(generateQuoteNumber([" rq-2222-2222 "]), "RQ-3333-3333");
  assert.equal(calls, 2);
});

test("a failing random source cannot silently issue a known duplicate", (t) => {
  let calls = 0;
  t.mock.method(crypto, "getRandomValues", (bytes: Uint8Array) => { calls++; return bytes.fill(0); });
  assert.throws(() => generateQuoteNumber(["RQ-2222-2222"]), /unused quote number/);
  assert.equal(calls, 16);
});

test("new drafts keep their display reference separate from their permanent ID", () => {
  const first = createBlankQuoteRecord();
  const second = createBlankQuoteRecord();
  for (const quote of [first, second]) {
    assert.match(quote.metadata.proposalNumber, shortNumber);
    assert.equal(quote.documentation.proposalNumberLabel, quote.metadata.proposalNumber);
    assert.match(quote.internal.quoteId, /^quote_[0-9a-f-]{36}$/);
    assert.equal(quote.governance?.quoteFamilyId, quote.internal.quoteId);
  }
  assert.notEqual(first.internal.quoteId, second.internal.quoteId);
  assert.notEqual(first.metadata.proposalNumber, second.metadata.proposalNumber);
});

test("new draft creation avoids references already in the workspace", (t) => {
  let calls = 0;
  t.mock.method(crypto, "getRandomValues", (bytes: Uint8Array) => bytes.fill(calls++));
  const quote = createBlankQuoteRecord(undefined, ["RQ-2222-2222"]);
  assert.equal(quote.metadata.proposalNumber, "RQ-3333-3333");
});

test("legacy issued quotes keep their number and ID through save, reload, and lookup", () => {
  const quote = createBlankQuoteRecord();
  quote.metadata.proposalNumber = quote.documentation.proposalNumberLabel = "RCT-1788621320967";
  quote.metadata.status = "sent";
  quote.internal.quoteId = "quote_1788621320967";
  const saved = createProposalFromQuote({ quote });
  const store = getDefaultProposalStore(saved);
  const restored = deserializeProposalStore(serializeProposalStore(store));
  assert.ok(restored);
  const byId = getProposalById(restored, saved.id);
  const byNumber = getProposalById(restored, "RCT-1788621320967");
  assert.ok(byId);
  assert.equal(byNumber?.id, saved.id);
  assert.equal(byId.quote.metadata.proposalNumber, "RCT-1788621320967");
  assert.equal(byId.quote.documentation.proposalNumberLabel, "RCT-1788621320967");
});

test("copies receive a new reference and ID while preserving the source quote", (t) => {
  const source = createProposalFromQuote({ quote: createBlankQuoteRecord() });
  source.quote.metadata.proposalNumber = "RQ-2222-2222";
  const before = JSON.stringify(source);
  let calls = 0;
  t.mock.method(crypto, "getRandomValues", (bytes: Uint8Array) => bytes.fill(calls++));
  const copy = createProposalCopy({ proposal: source, existingNumbers: ["RQ-3333-3333"] });
  assert.equal(copy.quote.metadata.proposalNumber, "RQ-4444-4444");
  assert.equal(copy.quote.documentation.proposalNumberLabel, copy.quote.metadata.proposalNumber);
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.id, copy.quote.internal.quoteId);
  assert.equal(JSON.stringify(source), before);
});

test("multiple new drafts remain distinct saved records, even when created in a batch", () => {
  const proposals = Array.from({ length: 10 }, () => createProposalFromQuote({ quote: createBlankQuoteRecord() }));
  const store = proposals.reduce((current, proposal) => upsertProposal(current, proposal), getDefaultProposalStore(proposals[0]));
  for (const proposal of proposals) assert.equal(getProposalById(store, proposal.id)?.id, proposal.id);
  assert.equal(new Set(proposals.map((proposal) => proposal.id)).size, proposals.length);
});

test("short references survive quote reload and are included in the descriptive download name", () => {
  const quote = createBlankQuoteRecord();
  quote.customer.name = "Acme Industries";
  quote.metadata.documentTitle = "Terminal Upgrade";
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote));
  assert.ok(restored);
  assert.equal(restored.metadata.proposalNumber, quote.metadata.proposalNumber);
  assert.equal(buildProposalPdfFileName(restored), `Acme Industries - Terminal Upgrade - ${quote.metadata.proposalNumber}.pdf`);
});

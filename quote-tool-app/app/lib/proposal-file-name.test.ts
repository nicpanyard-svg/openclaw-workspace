import assert from "node:assert/strict";
import test from "node:test";
import { buildProposalPdfContentDisposition, buildProposalPdfFileName } from "./proposal-file-name";
import { buildProposalPdfFileName as cachedFileName } from "./proposal-pdf-cache";
import { buildProposalPdfFileName as legacyFileName } from "./proposal-render";
import { createBlankQuoteRecord } from "./quote-template";

function fixture() {
  const quote = createBlankQuoteRecord();
  quote.customer.name = "Acme Industries";
  quote.metadata.documentTitle = "Terminal Upgrade";
  quote.metadata.proposalNumber = "RCT-12345";
  quote.metadata.accountName = "";
  quote.metadata.customerShortName = "";
  return quote;
}

for (const workflowMode of ["quick_quote", "major_project"] as const) {
  test(`${workflowMode} downloads include customer, quote title, and quote number without changing the quote`, () => {
    const quote = fixture();
    quote.metadata.workflowMode = workflowMode;
    const before = JSON.stringify(quote);
    assert.equal(buildProposalPdfFileName(quote), "Acme Industries - Terminal Upgrade - RCT-12345.pdf");
    assert.equal(JSON.stringify(quote), before);
    assert.equal(cachedFileName(quote), buildProposalPdfFileName(quote));
    assert.equal(legacyFileName(quote), buildProposalPdfFileName(quote));
  });
}

test("customer name takes priority over account and short names, with fallbacks when blank", () => {
  const quote = fixture();
  quote.metadata.accountName = "Acme Account";
  quote.metadata.customerShortName = "Acme";
  assert.match(buildProposalPdfFileName(quote), /^Acme Industries -/);
  quote.customer.name = "  ";
  assert.match(buildProposalPdfFileName(quote), /^Acme Account -/);
  quote.metadata.accountName = "";
  assert.match(buildProposalPdfFileName(quote), /^Acme -/);
});

test("a blank Major Quote title falls back to its project name only in Major Quote mode", () => {
  const quote = fixture();
  quote.metadata.documentTitle = "";
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.summary.projectName = "Site Connectivity";
  assert.equal(buildProposalPdfFileName(quote), "Acme Industries - Site Connectivity - RCT-12345.pdf");
  quote.metadata.workflowMode = "quick_quote";
  assert.equal(buildProposalPdfFileName(quote), "Acme Industries - RCT-12345.pdf");
});

test("blank fields omit empty separators and a fully blank record has a usable name", () => {
  const quote = fixture();
  quote.metadata.workflowMode = "quick_quote";
  quote.customer.name = quote.metadata.documentTitle = "";
  assert.equal(buildProposalPdfFileName(quote), "RCT-12345.pdf");
  quote.metadata.proposalNumber = "";
  assert.equal(buildProposalPdfFileName(quote), "proposal.pdf");
});

test("filenames remove unsafe path, control, and trailing characters", () => {
  const quote = fixture();
  quote.customer.name = '  Acme/West: "Operations"  ';
  quote.metadata.documentTitle = "\r\nTerminal\\Upgrade?*<>|\u0000\u202e..  ";
  const fileName = buildProposalPdfFileName(quote);
  assert.equal(fileName, "Acme-West- -Operations - Terminal-Upgrade - RCT-12345.pdf");
  assert.doesNotMatch(fileName, /[<>:"/\\|?*\p{Cc}\p{Cf}]/u);
});

test("Unicode names remain intact in the download name and encoded HTTP header", () => {
  const quote = fixture();
  quote.customer.name = "Soci\u00e9t\u00e9 \u5317\u4eac";
  quote.metadata.documentTitle = "R\u00e9seau (Phase 1)";
  const fileName = "Soci\u00e9t\u00e9 \u5317\u4eac - R\u00e9seau (Phase 1) - RCT-12345.pdf";
  assert.equal(buildProposalPdfFileName(quote), fileName);
  const header = buildProposalPdfContentDisposition(quote);
  assert.match(header, /^attachment; filename="Societe -- - Reseau \(Phase 1\) - RCT-12345.pdf";/);
  assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]), fileName);
  assert.ok([...header].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 126));
});

test("long names are bounded without splitting Unicode or dropping the quote number", () => {
  const quote = fixture();
  quote.customer.name = "\u5317".repeat(100);
  quote.metadata.documentTitle = "\u{1f6f0}".repeat(100);
  const name = buildProposalPdfFileName(quote);
  assert.ok(new TextEncoder().encode(name).length <= 230);
  assert.doesNotMatch(name, /\p{Cs}/u);
  assert.ok(name.endsWith(" - RCT-12345.pdf"));
});

test("reserved Windows device filenames are protected", () => {
  const quote = fixture();
  quote.customer.name = "CON";
  quote.metadata.documentTitle = quote.metadata.proposalNumber = "";
  quote.metadata.workflowMode = "quick_quote";
  assert.equal(buildProposalPdfFileName(quote), "_CON.pdf");
});

test("the response header uses the same filename and cannot include injected headers", () => {
  const quote = fixture();
  const name = buildProposalPdfFileName(quote);
  assert.equal(buildProposalPdfContentDisposition(quote), `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  quote.customer.name = 'Acme";\r\nX-Injected: yes';
  const header = buildProposalPdfContentDisposition(quote);
  assert.equal((header.match(/"/g) ?? []).length, 2);
  assert.doesNotMatch(header, /[\r\n]/);
});

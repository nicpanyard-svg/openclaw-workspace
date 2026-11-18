import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixtureComponent, fixtureQuote } from "../../scripts/quote-master-fixtures";
import { previewBulkMargin } from "../lib/quote-bulk-pricing";

const requireComponent = createRequire(import.meta.url);
requireComponent.extensions[".css"] = () => undefined;
const { QuoteBulkPricing, BulkPricingPreviewTable, BulkPricingChangeSummary, parseBulkMarginInput, isBulkMarginPreviewStale } = requireComponent("./quote-bulk-pricing") as typeof import("./quote-bulk-pricing");

function quote() {
  return fixtureQuote("bulk-ui", "Bulk pricing review", [
    fixtureComponent("Radar", 100, 70),
    fixtureComponent("Negotiated price", 240, 180, { priceLocked: true }),
    fixtureComponent("Included cable", 0, 5, { priceStatus: "included" }),
    fixtureComponent("Awaiting pricing", 0, 45, { priceStatus: "tbd" }),
    fixtureComponent("Estimate", 120, 70, { priceStatus: "allowance", optional: true }),
  ]);
}

test("custom margins reject blanks, nonfinite values, and values outside 0 through 95", () => {
  for (const input of ["", " ", "-1", "95.01", "Infinity", "NaN", "cost"]) {
    assert.equal(parseBulkMarginInput(input), null, input);
  }
  for (const margin of [0, 15, 30, 55, 42.75, 95]) {
    assert.equal(parseBulkMarginInput(String(margin)), margin);
  }
});

test("the bulk action bar renders nothing without a selection", () => {
  const html = renderToStaticMarkup(createElement(QuoteBulkPricing, {
    quote: quote(), selectedIds: [], onApply: () => undefined, onClear: () => undefined, onSetLocks: () => undefined,
  }));
  assert.equal(html, "");
});

test("selected items expose presets, labeled margin input, and accessible lock controls", () => {
  const html = renderToStaticMarkup(createElement(QuoteBulkPricing, {
    quote: quote(), selectedIds: ["Radar", "Radar", "Estimate"], onApply: () => undefined, onClear: () => undefined, onSetLocks: () => undefined,
  }));
  assert.match(html, />2 selected</);
  for (const margin of [15, 30, 55]) assert.match(html, new RegExp(`aria-label="${margin}% margin"`));
  assert.match(html, /min="0" max="95"/);
  assert.match(html, /Preview prices/);
  assert.match(html, /aria-label="Lock selected prices"/);
  assert.match(html, /aria-label="Unlock selected prices"/);
  assert.match(html, /aria-label="Clear selection"/);
  assert.doesNotMatch(html, /Apply prices/);
});

test("preview shows current and proposed prices plus explicit lock and included skip reasons", () => {
  const preview = previewBulkMargin(quote(), ["Radar", "Negotiated price", "Included cable", "Awaiting pricing", "Estimate"], 30);
  const html = renderToStaticMarkup(createElement(BulkPricingPreviewTable, { preview, currency: "USD" }));
  assert.match(html, /Current unit price/);
  assert.match(html, /Proposed unit price/);
  assert.match(html, /\$100\.00/);
  assert.match(html, /selling price is locked/);
  assert.match(html, /Included items are not repriced/);
  assert.match(html, /Unchanged/);
  assert.match(html, />TBD</);
  assert.match(html, /Pricing status: Confirmed/);
  assert.match(html, /Pricing status stays Allowance/);
  assert.match(html, /Optional/);
});

test("review fingerprints detect cost, quantity, lock, currency, scope, and selection changes", () => {
  const source = quote();
  const reviewed = previewBulkMargin(source, ["Radar"], 30);
  assert.equal(isBulkMarginPreviewStale(reviewed, previewBulkMargin(source, ["Radar"], 30)), false);
  const variants = [
    (changed: ReturnType<typeof quote>) => { changed.majorProject.options[0].components![0].vendorUnitCost = 75; },
    (changed: ReturnType<typeof quote>) => { changed.majorProject.options[0].components![0].quantity = 2; },
    (changed: ReturnType<typeof quote>) => { changed.majorProject.options[0].components![0].priceLocked = true; },
    (changed: ReturnType<typeof quote>) => { changed.metadata.currencyCode = "CAD"; },
    (changed: ReturnType<typeof quote>) => { changed.majorProject.builderMode = "simple"; },
  ];
  variants.forEach((edit) => {
    const changed = structuredClone(source);
    edit(changed);
    assert.equal(isBulkMarginPreviewStale(reviewed, previewBulkMargin(changed, ["Radar"], 30)), true);
  });
  assert.equal(isBulkMarginPreviewStale(reviewed, previewBulkMargin(source, ["Estimate"], 30)), true);
  assert.equal(isBulkMarginPreviewStale(reviewed, previewBulkMargin(source, ["Radar"], 55)), true);
  assert.equal(reviewed.entries[0].currentUnitPrice, 100);
});

test("usage preview shows a rate and never presents an extended charge", () => {
  const source = quote();
  source.majorProject.options[0].components = [fixtureComponent("Overage", 2, 1, {
    quantity: 0, customerExtendedPrice: 0, vendorExtendedCost: 0,
    billing: { cadence: "monthly", unitLabel: "GB" },
    quickQuoteSource: { section: "sectionA", rowId: "usage", usageBased: true },
  })];
  const preview = previewBulkMargin(source, ["Overage"], 30);
  const html = renderToStaticMarkup(createElement(BulkPricingPreviewTable, { preview, currency: "USD" }));
  assert.match(html, /Per GB used/);
  assert.doesNotMatch(html, /\$0\.00 total|Qty 0/);
  assert.equal(renderToStaticMarkup(createElement(BulkPricingChangeSummary, { preview, currency: "USD" })), "");
});

test("selected price summaries separate cadence, optional scope, and renewal start year", () => {
  const components = [
    fixtureComponent("Required hardware", 100, 70),
    fixtureComponent("Second hardware", 20, 14),
    fixtureComponent("Optional hardware", 40, 21, { optional: true }),
    fixtureComponent("Monthly service", 25, 14, { billing: { cadence: "monthly" } }),
    fixtureComponent("Annual service", 200, 105, { billing: { cadence: "annual", startsYear: 1 } }),
    fixtureComponent("Annual renewal", 300, 140, { billing: { cadence: "annual", startsYear: 2 } }),
    fixtureComponent("Optional renewal", 80, 42, { optional: true, billing: { cadence: "annual", startsYear: 2 } }),
    fixtureComponent("Locked hardware", 900, 700, { priceLocked: true }),
    fixtureComponent("Usage", 3, 1, { quantity: 0, customerExtendedPrice: 0, vendorExtendedCost: 0, quickQuoteSource: { section: "sectionA", rowId: "usage", usageBased: true } }),
  ];
  const source = fixtureQuote("summary", "Summary", components);
  const preview = previewBulkMargin(source, components.map((item) => item.id), 30);
  const html = renderToStaticMarkup(createElement(BulkPricingChangeSummary, { preview, currency: "USD" }));
  const expected = [
    ["one_time-1-required", "One-time / Required / From year 1", "$120.00", "$120.00"],
    ["one_time-1-optional", "One-time / Optional / From year 1", "$40.00", "$30.00"],
    ["monthly-1-required", "Monthly / Required / From year 1", "$25.00", "$20.00"],
    ["annual-1-required", "Annual / Required / From year 1", "$200.00", "$150.00"],
    ["annual-2-required", "Annual / Required / From year 2", "$300.00", "$200.00"],
    ["annual-2-optional", "Annual / Optional / From year 2", "$80.00", "$60.00"],
  ];
  assert.match(html, /<caption>Selected price changes<\/caption>/);
  assert.equal((html.match(/data-group=/g) || []).length, expected.length);
  for (const [key, label, current, proposed] of expected) {
    const row = html.match(new RegExp(`<tr[^>]*data-group="${key}"[^>]*>(.*?)</tr>`))?.[1];
    assert.ok(row, key);
    assert.ok(row.includes(label), label);
    assert.ok(row.includes(`${current}</td>`), current);
    assert.ok(row.includes(`${proposed}</td>`), proposed);
  }
  assert.doesNotMatch(html, /Quote total|Locked hardware|Usage|\$900\.00|\$3\.00/i);
});

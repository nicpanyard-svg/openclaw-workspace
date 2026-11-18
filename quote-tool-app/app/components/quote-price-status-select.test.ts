import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatQuoteLinePrice, QUOTE_PRICE_STATUS_HELP, QUOTE_PRICE_STATUS_LABELS, type QuotePriceSource } from "../lib/quote-price-status";
import type { QuotePriceStatus } from "../lib/quote-record";

const requireComponent = createRequire(import.meta.url);
requireComponent.extensions[".css"] = () => undefined;
const { QuotePriceStatusSelect } = requireComponent("./quote-price-status-select") as typeof import("./quote-price-status-select");

function render(line: QuotePriceSource) {
  return renderToStaticMarkup(createElement(QuotePriceStatusSelect, { line, onChange: () => undefined, label: "Hardware pricing status" }));
}

test("pricing choices use plain labels while keeping stored status values", () => {
  const html = render({ priceStatus: "confirmed", unitPrice: 100, totalPrice: 100 });
  for (const [value, label] of Object.entries(QUOTE_PRICE_STATUS_LABELS)) {
    assert.match(html, new RegExp(`<option[^>]*value="${value}"[^>]*>${label}</option>`));
  }
  assert.doesNotMatch(html, />(Confirmed|Allowance|TBD|Included)</);
  assert.match(html, /aria-label="Hardware pricing status"/);
  const helpId = html.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(helpId);
  assert.ok(html.includes(`id="${helpId}"`));
});

test("each price choice shows its meaning without requiring hover", () => {
  for (const status of ["confirmed", "allowance", "included"] as QuotePriceStatus[]) {
    const amount = status === "included" ? 0 : 100;
    const html = render({ priceStatus: status, unitPrice: amount, totalPrice: amount });
    assert.ok(html.includes(`>${QUOTE_PRICE_STATUS_HELP[status]}</span>`));
    assert.doesNotMatch(html, /aria-invalid="true"/);
  }
  assert.match(render({ priceStatus: "tbd", unitPrice: 0, totalPrice: 0 }), /Enter a selling price/);
});

test("No extra charge explains the price conflict without silently zeroing the line", () => {
  const line = { priceStatus: "included" as const, unitPrice: 125, totalPrice: 250, quantity: 2 };
  const html = render(line);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /Enter \$0 for No extra charge, or choose Price set/);
  assert.match(html, /amount has not been changed/);
  assert.equal(line.totalPrice, 250);
  assert.equal(line.unitPrice, 125);
});

test("editor price wording does not change existing customer document wording", () => {
  assert.equal(formatQuoteLinePrice({ priceStatus: "included", totalPrice: 0 }, "$0", "editor"), "No extra charge");
  assert.equal(formatQuoteLinePrice({ priceStatus: "included", totalPrice: 0 }, "$0"), "Included");
  assert.equal(formatQuoteLinePrice({ priceStatus: "tbd", totalPrice: 0 }, "$0", "editor"), "Needs pricing");
  assert.equal(formatQuoteLinePrice({ priceStatus: "allowance", totalPrice: 100 }, "$100", "editor"), "$100 (estimate)");
  assert.equal(formatQuoteLinePrice({ priceStatus: "allowance", totalPrice: 100 }, "$100"), "$100 (Allowance)");
});

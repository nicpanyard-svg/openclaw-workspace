import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuoteLineTableProps, QuoteLineTableRow } from "./quote-line-table";

const requireComponent = createRequire(import.meta.url);
requireComponent.extensions[".css"] = () => undefined;
const { QuoteLineTable } = requireComponent("./quote-line-table") as typeof import("./quote-line-table");

function row(id: string, overrides: Partial<QuoteLineTableRow> = {}): QuoteLineTableRow {
  return {
    id,
    accessibleName: id,
    description: id,
    quantity: "1",
    rate: "$100.00",
    cadence: "One-time",
    total: "$100.00",
    optional: false,
    onOptionalChange: () => undefined,
    details: "Item details",
    ...overrides,
  };
}

const render = (props: Partial<QuoteLineTableProps> = {}) => renderToStaticMarkup(
  createElement(QuoteLineTable, { label: "Equipment", rows: [row("A")], ...props }),
);

test("unselectable quote tables retain eight columns and have no bulk checkboxes", () => {
  const html = render();
  assert.doesNotMatch(html, /Select .* for bulk pricing|Select all items|col-selection/);
  assert.match(html, /colSpan="8"/i);
});

test("selected rows have named controls and select-all exposes its mixed state", () => {
  const html = render({ rows: [
    row("Radar", { selected: true, onSelectedChange: () => undefined }),
    row("Controller", { selected: false, onSelectedChange: () => undefined }),
  ] });
  assert.match(html, /aria-label="Select Radar for bulk pricing"/);
  assert.match(html, /aria-label="Select Controller for bulk pricing"/);
  assert.match(html, /aria-label="Select all items in Equipment" aria-checked="mixed"/);
  assert.match(html, /data-selected="true"/);
  assert.match(html, /colSpan="9"/i);
});

test("select-all counts selectable rows only", () => {
  const html = render({ rows: [
    row("Radar", { selected: true, onSelectedChange: () => undefined }),
    row("Read only"),
  ] });
  assert.match(html, /aria-label="Select all items in Equipment" aria-checked="true"/);
  assert.doesNotMatch(html, /Select Read only for bulk pricing/);
});

test("empty selectable tables have a disabled select-all and nine-column message", () => {
  const html = render({ rows: [], onSelectAll: () => undefined });
  assert.match(html, /aria-label="Select all items in Equipment" aria-checked="false" disabled/);
  assert.match(html, /colSpan="9"[^>]*>No items added\./i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { equipmentCatalog } from "./catalog";
import { createBlankQuoteRecord } from "./quote-template";
import { getWorkspaceQuoteSummary } from "./workspace-quote-summary";
import {
  addLibraryProduct,
  quoteLibraryProducts,
  starlinkOemProducts,
  validateProductSelection,
  type ProductSelection,
} from "./quote-product-library";

const product = starlinkOemProducts.find(
  (item) => item.id === "oem-standard-wall",
)!;
const selection: ProductSelection = {
  product,
  quantity: 3,
  unitPrice: 67,
  unitCost: 40,
  partNumber: product.partNumber!,
  optional: false,
};

test("OEM reference prices do not replace configured prices or claim Starlink-direct costs", () => {
  assert.equal(starlinkOemProducts.length, 21);
  assert.equal(
    starlinkOemProducts.filter((item) => item.onlineReferencePrice).length,
    8,
  );
  assert.ok(starlinkOemProducts.every((item) => item.configuredPrice === null));
  for (const item of starlinkOemProducts) {
    assert.ok(item.referenceUrl?.startsWith("https://starlink.com/"));
    if (item.onlineReferencePrice) {
      assert.ok(item.onlineReferencePrice.amount > 0);
      assert.equal(item.onlineReferencePrice.currency, "USD");
      assert.equal(item.onlineReferencePrice.checkedAt, "2026-09-09");
      assert.ok(item.onlineReferencePrice.sourceUrl.startsWith("https://"));
      assert.ok(item.partNumber);
      assert.ok(existsSync(resolve("public", item.thumbnailUrl!.slice(1))));
    }
  }
  for (const item of equipmentCatalog)
    assert.equal(
      quoteLibraryProducts.find((candidate) => candidate.id === item.id)
        ?.configuredPrice,
      item.defaultUnitPrice,
    );
});

test("product input rejects blank, invalid and unconfirmed values", () => {
  const valid = {
    product,
    quantity: "1",
    unitPrice: "67",
    unitCost: "40",
    partNumber: "04759102",
    needsCost: true,
  };
  assert.equal(validateProductSelection(valid), null);
  for (const quantity of ["", " ", "0", "-1", "1.5", "NaN", "Infinity"])
    assert.ok(validateProductSelection({ ...valid, quantity }));
  for (const unitPrice of ["", " ", "0", "-1", "NaN", "Infinity"])
    assert.ok(validateProductSelection({ ...valid, unitPrice }));
  for (const unitCost of ["", " ", "-1", "NaN", "Infinity"])
    assert.ok(validateProductSelection({ ...valid, unitCost }));
  assert.ok(validateProductSelection({ ...valid, partNumber: " " }));
  assert.equal(validateProductSelection({ ...valid, unitCost: "0" }), null);
  assert.equal(
    validateProductSelection({ ...valid, unitCost: "", needsCost: false }),
    null,
  );
  assert.ok(
    validateProductSelection({
      ...valid,
      quantity: "1e308",
      unitPrice: "1e308",
    }),
  );
});

test("Quick Quote addition is immutable and never copies research provenance or cost to the customer row", () => {
  const quote = createBlankQuoteRecord(),
    before = structuredClone(quote);
  const next = addLibraryProduct(quote, selection, "test-library");
  assert.deepEqual(quote, before);
  const row = next.sections.sectionB.lineItems.find(
    (item) => item.id === "test-library",
  )!;
  assert.equal(row.itemName, "Starlink Standard Wall Mount");
  assert.equal(row.quantity, 3);
  assert.equal(row.unitPrice, 67);
  assert.equal(row.totalPrice, 201);
  assert.equal(row.terminalType, undefined);
  assert.equal(row.partNumber, "04759102");
  assert.equal(next.sections.sectionB.enabled, true);
  assert.doesNotMatch(
    JSON.stringify(row),
    /cdw|bestbuy|sourceUrl|onlineReferencePrice|unitCost|seller/i,
  );
  assert.equal(
    getWorkspaceQuoteSummary(next).oneTime -
      getWorkspaceQuoteSummary(quote).oneTime,
    201,
  );
});

test("optional additions stay outside base totals", () => {
  const quote = createBlankQuoteRecord();
  const next = addLibraryProduct(
    quote,
    { ...selection, optional: true },
    "optional-library",
  );
  const before = getWorkspaceQuoteSummary(quote),
    after = getWorkspaceQuoteSummary(next);
  assert.equal(after.oneTime, before.oneTime);
  assert.equal(after.options.oneTimeTotal - before.options.oneTimeTotal, 201);
});

for (const builderMode of ["simple", "advanced"] as const)
  test(`Major Project ${builderMode} addition retains explicit cost and customer pricing`, () => {
    const quote = createBlankQuoteRecord();
    quote.metadata.workflowMode = "major_project";
    quote.majorProject.enabled = true;
    quote.majorProject.builderMode = builderMode;
    quote.majorProject.options[0].siteCount = 5;
    const before = structuredClone(quote);
    const next = addLibraryProduct(quote, selection, "major-library");
    assert.deepEqual(quote, before);
    const option = next.majorProject.options.find(
      (item) => item.id === next.majorProject.activeOptionId,
    )!;
    const row = option.components!.find((item) => item.id === "major-library")!;
    assert.equal(row.customerExtendedPrice, 201);
    assert.equal(row.vendorExtendedCost, 120);
    assert.equal(row.manufacturer, "Starlink");
    assert.equal(row.vendor, "");
    assert.throws(
      () =>
        addLibraryProduct(
          quote,
          { ...selection, unitCost: undefined },
          "bad-cost",
        ),
      /unit cost/,
    );
    assert.equal(getWorkspaceQuoteSummary(next).oneTime, 201);
  });

test("legacy simple rows retain their mapped output when an accessory is added", () => {
  const quote = createBlankQuoteRecord();
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.enabled = true;
  quote.majorProject.builderMode = "simple";
  quote.majorProject.options[0].simpleRows = [
    {
      id: "legacy",
      label: "Original equipment",
      quantity: 1,
      customerUnitPrice: 100,
      customerExtendedPrice: 100,
      ourUnitCost: 50,
      ourExtendedCost: 50,
      bucket: "hardware",
    },
  ];
  const next = addLibraryProduct(quote, selection, "new-mapped");
  const rows = next.sections.sectionB.lineItems;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].itemName, "Original equipment");
  assert.equal(rows[0].totalPrice, 100);
  assert.equal(rows[1].itemName, "Starlink Standard Wall Mount");
  assert.equal(rows[1].totalPrice, 201);
  assert.equal(getWorkspaceQuoteSummary(next).oneTime, 301);
  const optional = addLibraryProduct(
    quote,
    { ...selection, optional: true },
    "optional-mapped",
  );
  assert.equal(getWorkspaceQuoteSummary(optional).oneTime, 100);
  assert.equal(getWorkspaceQuoteSummary(optional).options.oneTimeTotal, 201);
});

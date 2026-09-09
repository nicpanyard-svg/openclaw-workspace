import { equipmentCatalog } from "./catalog";
import {
  applyMajorProjectToQuote,
  ensureMajorProjectState,
} from "./major-project";
import type { QuoteRecord } from "./quote-record";

export type LibraryProduct = {
  id: string;
  label: string;
  category: string;
  family: string;
  source: "catalog" | "starlink_oem";
  configuredPrice: number | null;
  onlineReferencePrice?: {
    amount: number;
    currency: "USD";
    checkedAt: string;
    sourceUrl: string;
  };
  thumbnailUrl?: string;
  partNumber?: string;
  imageUrl?: string;
  description?: string;
  referenceUrl?: string;
  referencePage?: number;
};

// Product identity comes from Starlink's guides. No retailer price is an OEM list price.
const guides = {
  "Performance Gen 3":
    "https://starlink.com/public-files/accessories_guide_performance.pdf",
  "Standard V4":
    "https://starlink.com/public-files/accessories_guide_standard.pdf",
  Mini: "https://starlink.com/public-files/accessories_guide_mini.pdf",
};
const oemRows: [keyof typeof guides, string, string, string][] = [
  ["Performance Gen 3", "performance-flat", "Performance Flat Mount", "Mount"],
  ["Performance Gen 3", "performance-wall", "Performance Wall Mount", "Mount"],
  [
    "Performance Gen 3",
    "performance-pipe",
    "Performance Pipe Adapter",
    "Mount",
  ],
  [
    "Performance Gen 3",
    "performance-wedge",
    "Performance Wedge Mount",
    "Mount",
  ],
  ["Performance Gen 3", "performance-25m", "Performance 25m Cable", "Cable"],
  ["Performance Gen 3", "performance-50m", "Performance 50m Cable", "Cable"],
  [
    "Performance Gen 3",
    "performance-power",
    "Advanced Power Supply Kit",
    "Power",
  ],
  [
    "Performance Gen 3",
    "performance-router",
    "Performance Gen 3 Router Kit",
    "Networking",
  ],
  ["Standard V4", "standard-wall", "Standard Wall Mount", "Mount"],
  ["Standard V4", "standard-pivot", "Standard Pivot Mount", "Mount"],
  ["Standard V4", "standard-pipe", "Standard Pipe Adapter", "Mount"],
  ["Standard V4", "standard-ridgeline", "Standard Ridgeline Mount", "Mount"],
  ["Standard V4", "standard-15m", "Standard 15m Cable", "Cable"],
  ["Standard V4", "standard-45m", "Standard 45m Cable", "Cable"],
  ["Mini", "mini-pipe-flat", "Mini Pipe Adapter and Flat Mount", "Mount"],
  ["Mini", "mini-roof-rack", "Mini Roof Rack Mount", "Mount"],
  ["Mini", "mini-wall", "Mini Wall Mount", "Mount"],
  ["Mini", "mini-mobility", "Mini Mobility Mount", "Mount"],
  ["Mini", "mini-dc-15m", "Mini 15m DC Power Cable", "Cable"],
  ["Mini", "mini-dc-30m", "Mini 30m DC Power Cable", "Cable"],
  ["Mini", "mini-car", "Mini Car Adapter", "Power"],
];

// Research provenance stays in the catalog, never in quote rows or customer output.
// These are public prices for genuine OEM products, not confirmed Starlink-direct costs or MSRP.
const onlineReferences: Record<
  string,
  { amount: number; partNumber: string; sourceUrl: string }
> = {
  "standard-wall": {
    amount: 67,
    partNumber: "04759102",
    sourceUrl:
      "https://www.bestbuy.com/product/starlink-wall-mount-standard-kit-latest-generation-gray/J3R8ZC25L2",
  },
  "standard-pivot": {
    amount: 74,
    partNumber: "04759105",
    sourceUrl:
      "https://www.bestbuy.com/product/starlink-pivot-mount-standard-kit-latest-generation-gray/J3R8ZC25LP",
  },
  "standard-pipe": {
    amount: 38,
    partNumber: "04759103",
    sourceUrl:
      "https://www.bestbuy.com/product/starlink-pipe-adapter-standard-kit-latest-generation-gray/J3R8ZC25G5",
  },
  "mini-pipe-flat": {
    amount: 29.99,
    partNumber: "PIPE-ADAPTER-FLAT-MOUNT-MINI",
    sourceUrl:
      "https://www.cdw.com/product/starlink-mini-pipe-adapter-and-flat-mount/8393631",
  },
  "mini-roof-rack": {
    amount: 27.99,
    partNumber: "ROOF-RACK-MOUNT-MINI",
    sourceUrl:
      "https://www.cdw.com/product/starlink-mini-roof-rack-mount/8393657",
  },
  "mini-wall": {
    amount: 10.99,
    partNumber: "MINI-WALL-MOUNT",
    sourceUrl: "https://www.cdw.com/product/starlink-mini-wall-mount/8393655",
  },
  "mini-car": {
    amount: 49.99,
    partNumber: "CAR-ADAPTER-MINI",
    sourceUrl: "https://www.cdw.com/product/starlink-mini-car-adapter/8393633",
  },
  "performance-router": {
    amount: 121.99,
    partNumber: "V4HP-WIFI-GEN3-SHOP",
    sourceUrl:
      "https://www.cdw.com/product/starlink-performance-gen-3-router-kit/8428931",
  },
};

export const starlinkOemProducts: LibraryProduct[] = oemRows.map(
  ([family, id, label, category]) => ({
    id: `oem-${id}`,
    family,
    label,
    category,
    source: "starlink_oem",
    configuredPrice: null,
    referenceUrl: guides[family],
    partNumber: onlineReferences[id]?.partNumber,
    thumbnailUrl: onlineReferences[id]
      ? `/products/starlink/${id}.${id.startsWith("standard-") ? "webp" : "jpg"}`
      : undefined,
    onlineReferencePrice: onlineReferences[id]
      ? {
          amount: onlineReferences[id].amount,
          currency: "USD",
          checkedAt: "2026-09-09",
          sourceUrl: onlineReferences[id].sourceUrl,
        }
      : undefined,
    description:
      id === "performance-router"
        ? "Router kit with 5m cable. Router power supply is not included; not the standalone mesh kit."
        : category === "Mount"
          ? "Mounting accessory only. Starlink terminal not included."
          : undefined,
  }),
);

export const quoteLibraryProducts: LibraryProduct[] = [
  ...equipmentCatalog.map((item): LibraryProduct => ({
    id: item.id,
    label: item.label,
    category: item.category,
    family: item.terminalType || "Other",
    source: "catalog",
    configuredPrice: item.defaultUnitPrice,
    partNumber: item.partNumber,
    imageUrl: item.imageUrl,
    description: item.description,
  })),
  ...starlinkOemProducts,
];

export type ProductSelection = {
  product: LibraryProduct;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  partNumber: string;
  optional: boolean;
};
export function validateProductSelection(input: {
  product: LibraryProduct;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  partNumber: string;
  needsCost: boolean;
}) {
  if (
    !input.quantity.trim() ||
    !Number.isFinite(Number(input.quantity)) ||
    Number(input.quantity) <= 0 ||
    !Number.isInteger(Number(input.quantity))
  )
    return "Enter a whole-number quantity greater than zero.";
  if (
    !input.unitPrice.trim() ||
    !Number.isFinite(Number(input.unitPrice)) ||
    Number(input.unitPrice) <= 0
  )
    return "Enter a selling price greater than zero.";
  if (!Number.isFinite(Number(input.quantity) * Number(input.unitPrice)))
    return "The extended price is too large.";
  if (
    input.needsCost &&
    (!input.unitCost.trim() ||
      !Number.isFinite(Number(input.unitCost)) ||
      Number(input.unitCost) < 0 ||
      !Number.isFinite(Number(input.quantity) * Number(input.unitCost)))
  )
    return "Enter your unit cost, including an explicit 0 when applicable.";
  if (input.product.source === "starlink_oem" && !input.partNumber.trim())
    return "Enter the confirmed Starlink OEM part number.";
  return null;
}

export function addLibraryProduct(
  quote: QuoteRecord,
  selection: ProductSelection,
  id: string,
): QuoteRecord {
  const { product, quantity, unitPrice, unitCost, optional } = selection;
  const major = quote.metadata.workflowMode === "major_project";
  const error = validateProductSelection({
    product,
    quantity: String(quantity),
    unitPrice: String(unitPrice),
    unitCost: unitCost == null ? "" : String(unitCost),
    partNumber: selection.partNumber,
    needsCost: major,
  });
  if (error) throw new Error(error);
  const next = structuredClone(quote);
  const total = Number((quantity * unitPrice).toFixed(2));
  const cost = Number((quantity * (unitCost ?? 0)).toFixed(2));
  const label =
    product.source === "starlink_oem"
      ? `Starlink ${product.label}`
      : product.label;
  const description = [
    product.description,
    selection.partNumber.trim() ? `Part # ${selection.partNumber.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!major) {
    next.sections.sectionB.enabled = true;
    next.sections.sectionB.lineItems.push({
      id,
      itemName: label,
      sourceType: "custom",
      optional,
      quantity,
      unitPrice,
      totalPrice: total,
      itemCategory: product.category,
      partNumber: selection.partNumber.trim(),
      description,
      imageUrl: product.imageUrl,
      terminalType:
        product.category === "Terminal" ? product.family : undefined,
      sourceLabel:
        product.source === "starlink_oem" ? "Starlink OEM" : "Quote catalog",
    });
    return next;
  }
  const draft = ensureMajorProjectState(next);
  const option = draft.majorProject.options.find(
    (option) => option.id === draft.majorProject.activeOptionId,
  );
  if (!option)
    throw new Error("Select a project option before adding a product.");
  const mapped = Boolean(
    option.bundles?.length || option.customerQuoteLines?.length,
  );
  const bundleId = `library-bundle-${id}`;
  option.components = [
    ...(option.components ?? []),
    {
      id,
      internalName: label,
      customerFacingLabel: label,
      optional,
      quantity,
      unit: "ea",
      imageUrl: product.imageUrl,
      customerUnitPrice: unitPrice,
      customerExtendedPrice: total,
      vendorUnitCost: unitCost ?? 0,
      vendorExtendedCost: cost,
      category: "Hardware",
      lineType: "hardware",
      schedule: "one_time",
      costBasis: "estimate",
      resaleBasis: "fixed_fee",
      vendor: "",
      manufacturer: product.source === "starlink_oem" ? "Starlink" : "",
      notes: description,
      bundleAssignmentId: mapped ? bundleId : "",
      passThrough: false,
    },
  ];
  // Mapped projects need an output line as well as an internal component.
  if (mapped) {
    option.bundles = [
      ...(option.bundles ?? []),
      {
        id: bundleId,
        internalName: label,
        customerFacingLabel: label,
        optional,
        description,
        componentIds: [id],
        includedCostComponentIds: [id],
        includedRevenueComponentIds: [id],
        schedule: "one_time",
        category: "hardware",
      },
    ];
    option.customerQuoteLines = [
      ...(option.customerQuoteLines ?? []),
      {
        id: `library-line-${id}`,
        lineItemNumber:
          Math.max(
            0,
            ...(option.customerQuoteLines ?? []).map(
              (line) => line.lineItemNumber ?? 0,
            ),
          ) + 1,
        label,
        optional,
        description,
        bundleIds: [bundleId],
        includedCostComponentIds: [id],
        includedRevenueComponentIds: [id],
        schedule: "one_time",
        presentationCategory: "hardware",
      },
    ];
  }
  return applyMajorProjectToQuote(draft);
}

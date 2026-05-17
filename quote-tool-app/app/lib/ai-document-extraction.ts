import type { MajorProjectBomImportSheetRow, MajorProjectVendorQuoteDraftItem } from "@/app/lib/quote-record";

type BomAiItem = {
  name: string;
  description?: string;
  quantity: number;
  vendor?: string;
  manufacturer?: string;
  unitCost: number;
  totalCost?: number;
  sourceRowNumber?: number;
};

type VendorQuoteAiItem = {
  label: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  extendedPrice?: number;
  unitCost?: number;
  extendedCost?: number;
  vendor?: string;
  itemCode?: string;
  manufacturer?: string;
  warranty?: string;
  origin?: string;
  sourceRowNumber?: number;
  rowKind?: "item" | "charge";
};

type StructuredResponse<T> = {
  [key: string]: T | string | undefined;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_DOCUMENT_EXTRACTION_MODEL = process.env.OPENAI_DOCUMENT_EXTRACTION_MODEL || "gpt-4o";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function isAiExtractionConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function createStructuredResponse<T>(params: {
  name: string;
  schema: Record<string, unknown>;
  input: string;
}): Promise<T | null> {
  if (!isAiExtractionConfigured()) {
    return null;
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_DOCUMENT_EXTRACTION_MODEL,
      store: false,
      input: params.input,
      text: {
        format: {
          type: "json_schema",
          name: params.name,
          strict: true,
          schema: params.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI extraction failed: ${message || response.statusText}`);
  }

  const payload = await response.json() as { output_text?: string };
  if (!payload.output_text?.trim()) {
    return null;
  }

  return JSON.parse(payload.output_text) as T;
}

function buildWorksheetTextPreview(sheetName: string, rows: MajorProjectBomImportSheetRow[]) {
  const previewRows = rows
    .slice(0, 120)
    .map((row) => `Row ${row.rowNumber}: ${row.cells.map((cell) => cell.trim()).join(" | ")}`)
    .join("\n");

  return [
    "You extract BOM line items from worksheet text.",
    "Return only real purchasable line items.",
    "Ignore title rows, section headings, subtotal rows, notes, and validation lists.",
    "If a value is missing, leave it blank or omit it unless required by schema.",
    "Use the exact line-item text the user would expect to see in the quote.",
    "",
    `Sheet: ${sheetName}`,
    previewRows,
  ].join("\n");
}

export async function extractBomRowsWithAi(params: {
  fileName: string;
  sheetName: string;
  rows: MajorProjectBomImportSheetRow[];
}): Promise<MajorProjectBomImportSheetRow[] | null> {
  if (!params.rows.length) {
    return null;
  }

  const parsed = await createStructuredResponse<StructuredResponse<BomAiItem[]>>({
    name: "bom_line_items",
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              vendor: { type: "string" },
              manufacturer: { type: "string" },
              unitCost: { type: "number" },
              totalCost: { type: "number" },
              sourceRowNumber: { type: "number" },
            },
            required: ["name", "quantity", "unitCost"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
    input: buildWorksheetTextPreview(params.sheetName, params.rows),
  });

  const items = Array.isArray(parsed?.items) ? parsed.items as BomAiItem[] : [];
  if (!items.length) {
    return null;
  }

  const syntheticRows: MajorProjectBomImportSheetRow[] = [
    {
      rowNumber: 1,
      cells: ["Name", "Description", "Qty", "Vendor", "Manufacturer / provider", "Unit cost", "Total cost"],
    },
    ...items
      .map((item, index) => {
        const name = normalizeText(item.name);
        const quantity = normalizePositiveNumber(item.quantity);
        const unitCost = normalizePositiveNumber(item.unitCost);
        if (!name || quantity === null || unitCost === null) {
          return null;
        }

        const totalCost = normalizePositiveNumber(item.totalCost) ?? Number((quantity * unitCost).toFixed(2));

        return {
          rowNumber: Math.max(2, Math.trunc(item.sourceRowNumber ?? index + 2)),
          cells: [
            name,
            normalizeText(item.description),
            String(quantity),
            normalizeText(item.vendor),
            normalizeText(item.manufacturer),
            String(unitCost),
            String(totalCost),
          ],
        } satisfies MajorProjectBomImportSheetRow;
      })
      .filter((row): row is MajorProjectBomImportSheetRow => Boolean(row)),
  ];

  return syntheticRows.length > 1 ? syntheticRows : null;
}

function buildVendorQuoteTextPreview(params: {
  fileName: string;
  vendorNameHint?: string;
  quoteReferenceHint?: string;
  lines: string[];
}) {
  return [
    "You extract quoted line items from vendor quote text.",
    "Return only real quote rows with pricing.",
    "Ignore headers, page labels, addresses, signatures, totals, subtotals, notes, and legal text.",
    "If a line is clearly shipping, handling, delivery, or another fee, mark rowKind as charge.",
    `File: ${params.fileName}`,
    params.vendorNameHint ? `Vendor hint: ${params.vendorNameHint}` : "",
    params.quoteReferenceHint ? `Quote reference hint: ${params.quoteReferenceHint}` : "",
    "",
    ...params.lines.slice(0, 180),
  ].filter(Boolean).join("\n");
}

function inferBucket(label: string, description?: string, manufacturer?: string, warranty?: string, origin?: string) {
  const combined = [label, description, manufacturer, warranty, origin].filter(Boolean).join(" ").toLowerCase();
  if (/(support|monitor|maintenance|managed service|help desk)/i.test(combined)) return "support_recurring" as const;
  if (/(monthly|mrc|mrr|subscription|recurring|license|service)/i.test(combined)) return "other_vendor" as const;
  if (/(install|labor|deployment|commissioning|survey|travel|freight|shipping|handling|delivery|fee|charge)/i.test(combined)) return "install" as const;
  return "hardware" as const;
}

export async function extractVendorQuoteItemsWithAi(params: {
  fileName: string;
  lines: string[];
  vendorNameHint?: string;
  quoteReferenceHint?: string;
}): Promise<{
  vendorName?: string;
  quoteReference?: string;
  previewItems: MajorProjectVendorQuoteDraftItem[];
} | null> {
  if (!params.lines.length) {
    return null;
  }

  const parsed = await createStructuredResponse<{
    vendorName?: string;
    quoteReference?: string;
    items: VendorQuoteAiItem[];
  }>({
    name: "vendor_quote_items",
    schema: {
      type: "object",
      properties: {
        vendorName: { type: "string" },
        quoteReference: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unitPrice: { type: "number" },
              extendedPrice: { type: "number" },
              unitCost: { type: "number" },
              extendedCost: { type: "number" },
              vendor: { type: "string" },
              itemCode: { type: "string" },
              manufacturer: { type: "string" },
              warranty: { type: "string" },
              origin: { type: "string" },
              sourceRowNumber: { type: "number" },
              rowKind: { type: "string", enum: ["item", "charge"] },
            },
            required: ["label", "quantity", "unitPrice"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
    input: buildVendorQuoteTextPreview(params),
  });

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) {
    return null;
  }

  const vendorName = normalizeText(parsed?.vendorName) || params.vendorNameHint;
  const quoteReference = normalizeText(parsed?.quoteReference) || params.quoteReferenceHint;

  const previewItems: MajorProjectVendorQuoteDraftItem[] = [];
  items.forEach((item, index) => {
      const label = normalizeText(item.label);
      const quantity = normalizePositiveNumber(item.quantity);
      const unitPrice = normalizePositiveNumber(item.unitPrice);
      if (!label || quantity === null || unitPrice === null) {
        return;
      }

      const extendedPrice = normalizePositiveNumber(item.extendedPrice) ?? Number((quantity * unitPrice).toFixed(2));
      const unitCost = normalizePositiveNumber(item.unitCost) ?? unitPrice;
      const extendedCost = normalizePositiveNumber(item.extendedCost) ?? extendedPrice;

      previewItems.push({
        id: `vendor-quote-ai-item-${index + 1}`,
        label,
        description: normalizeText(item.description) || undefined,
        quantity,
        unit: normalizeText(item.unit) || "ea",
        unitPrice,
        extendedPrice,
        unitCost,
        extendedCost,
        vendor: normalizeText(item.vendor) || vendorName || undefined,
        itemCode: normalizeText(item.itemCode) || undefined,
        manufacturer: normalizeText(item.manufacturer) || undefined,
        warranty: normalizeText(item.warranty) || undefined,
        origin: normalizeText(item.origin) || undefined,
        quoteReference: quoteReference || undefined,
        rowNumber: typeof item.sourceRowNumber === "number" && Number.isFinite(item.sourceRowNumber)
          ? Math.max(1, Math.trunc(item.sourceRowNumber))
          : undefined,
        rowKind: item.rowKind === "charge" ? "charge" : "item",
        bucket: inferBucket(label, item.description, item.manufacturer, item.warranty, item.origin),
      });
    });

  return {
    vendorName: vendorName || undefined,
    quoteReference: quoteReference || undefined,
    previewItems,
  };
}

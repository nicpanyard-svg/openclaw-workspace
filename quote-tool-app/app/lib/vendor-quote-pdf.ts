import type { MajorProjectVendorQuoteDraftItem } from "@/app/lib/quote-record";

type VendorQuotePdfToken = {
  text: string;
  x: number;
  y: number;
};

type VendorQuotePdfLine = {
  text: string;
  tokens: VendorQuotePdfToken[];
  pageNumber: number;
  lineNumber: number;
};

type VendorQuotePdfColumnKey =
  | "itemNumber"
  | "itemCode"
  | "description"
  | "manufacturer"
  | "warranty"
  | "origin"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "total";

type ParsedVendorQuotePdf = {
  vendorName?: string;
  quoteReference?: string;
  previewItems: MajorProjectVendorQuoteDraftItem[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseCurrency(value: string) {
  const cleaned = value.replace(/[^\d().-]/g, "").trim();
  if (!cleaned) return null;
  const normalized = cleaned.startsWith("(") && cleaned.endsWith(")")
    ? `-${cleaned.slice(1, -1)}`
    : cleaned;
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantity(value: string) {
  const cleaned = value.replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferBucket(...values: Array<string | undefined>) {
  const combined = values.filter(Boolean).join(" ").toLowerCase();
  if (/(support|monitor|maintenance|managed service|help desk)/i.test(combined)) return "support_recurring" as const;
  if (/(monthly|mrc|mrr|subscription|recurring|license|service)/i.test(combined)) return "other_vendor" as const;
  if (/(install|labor|deployment|commissioning|survey|travel|freight|shipping|handling|delivery|fee|charge)/i.test(combined)) return "install" as const;
  return "hardware" as const;
}

function isChargeRow(label: string, description: string) {
  return /(shipping|handling|freight|delivery|fee|charge|surcharge|tax)/i.test(`${label} ${description}`.trim());
}

function detectVendorName(lines: VendorQuotePdfLine[]) {
  for (const line of lines.slice(0, 20)) {
    const match = line.text.match(/^(vendor|supplier|from)\s*[:\-]\s*(.+)$/i);
    if (match?.[2]?.trim()) {
      return match[2].trim();
    }
  }

  return undefined;
}

function detectQuoteReference(lines: VendorQuotePdfLine[]) {
  const patterns = [
    /\b(Quotation-[A-Z0-9-]+)\b/i,
    /\b(Quote(?:\s*(?:No|#|Number|Ref(?:erence)?)\s*[:#-]?\s*[A-Z0-9-]+))\b/i,
    /\b([A-Z]{2,6}-\d{4}-\d{3,6})\b/,
  ];

  for (const line of lines.slice(0, 40)) {
    for (const pattern of patterns) {
      const match = line.text.match(pattern);
      if (match?.[1]?.trim()) {
        return normalizeWhitespace(match[1]);
      }
    }
  }

  return undefined;
}

function detectHeaderColumns(lines: VendorQuotePdfLine[]) {
  let bestIndex = -1;
  let bestScore = 0;
  let bestColumns: Partial<Record<VendorQuotePdfColumnKey, number>> = {};

  for (let index = 0; index < Math.min(lines.length, 80); index += 1) {
    const line = lines[index];
    const columns: Partial<Record<VendorQuotePdfColumnKey, number>> = {};

    for (let tokenIndex = 0; tokenIndex < line.tokens.length; tokenIndex += 1) {
      const token = line.tokens[tokenIndex];
      const normalized = token.text.toLowerCase().replace(/[^a-z0-9#]/g, "");
      const nextNormalized = line.tokens[tokenIndex + 1]?.text.toLowerCase().replace(/[^a-z0-9#]/g, "") ?? "";
      const phrase = `${normalized}${nextNormalized}`;

      if (!columns.description && /desc|product|itemdesc/.test(normalized)) {
        columns.description = token.x;
      } else if (!columns.quantity && /qty|quant/.test(normalized)) {
        columns.quantity = token.x;
      } else if (!columns.unitPrice && (phrase.startsWith("unitprice") || normalized === "price" || normalized === "rate")) {
        columns.unitPrice = token.x;
      } else if (!columns.total && /(total|amount|extended|extamount|lineamount)/.test(normalized)) {
        columns.total = token.x;
      } else if (!columns.unit && /^uom$/.test(normalized)) {
        columns.unit = token.x;
      } else if (!columns.unit && normalized === "unit" && nextNormalized !== "price") {
        columns.unit = token.x;
      } else if (!columns.itemCode && /(code|sku|part|itemcode)/.test(normalized)) {
        columns.itemCode = token.x;
      } else if (!columns.manufacturer && /(manufacturer|mfg|brand)/.test(normalized)) {
        columns.manufacturer = token.x;
      } else if (!columns.warranty && /warranty/.test(normalized)) {
        columns.warranty = token.x;
      } else if (!columns.origin && /(origin|country)/.test(normalized)) {
        columns.origin = token.x;
      } else if (!columns.itemNumber && (/^(no|#)$/.test(normalized) || normalized === "item" || normalized === "line")) {
        columns.itemNumber = token.x;
      }
    }

    const score = [
      columns.description,
      columns.quantity,
      columns.unitPrice,
      columns.total,
    ].filter((value) => typeof value === "number").length;

    if (score > bestScore && typeof columns.description === "number" && typeof columns.total === "number") {
      bestIndex = index;
      bestScore = score;
      bestColumns = columns;
    }
  }

  return {
    headerIndex: bestIndex,
    columns: bestColumns,
  };
}

function assignTokensToColumns(
  line: VendorQuotePdfLine,
  columns: Partial<Record<VendorQuotePdfColumnKey, number>>,
) {
  const sortedColumns = Object.entries(columns)
    .filter((entry): entry is [VendorQuotePdfColumnKey, number] => typeof entry[1] === "number")
    .sort((left, right) => left[1] - right[1]);

  const values: Partial<Record<VendorQuotePdfColumnKey, string[]>> = {};
  for (const [key] of sortedColumns) {
    values[key] = [];
  }

  if (!sortedColumns.length) return values;

  for (const token of line.tokens) {
    let targetIndex = 0;
    for (let index = 0; index < sortedColumns.length; index += 1) {
      if (token.x >= sortedColumns[index][1] - 4) {
        targetIndex = index;
      } else {
        break;
      }
    }

    const [key] = sortedColumns[targetIndex];
    values[key]?.push(token.text);
  }

  return values;
}

function maybeAppendMetadataLine(previousItem: MajorProjectVendorQuoteDraftItem | undefined, line: VendorQuotePdfLine) {
  if (!previousItem) return false;
  const text = normalizeWhitespace(line.text);
  if (!text) return false;
  if (parseCurrency(text) !== null) return false;

  let appended = false;

  const manufacturerMatch = text.match(/manufacturer\s*[:\-]\s*(.+)$/i);
  if (!previousItem.manufacturer && manufacturerMatch?.[1]?.trim()) {
    previousItem.manufacturer = manufacturerMatch[1].trim();
    appended = true;
  }

  const warrantyMatch = text.match(/warranty\s*[:\-]\s*(.+)$/i);
  if (!previousItem.warranty && warrantyMatch?.[1]?.trim()) {
    previousItem.warranty = warrantyMatch[1].trim();
    appended = true;
  }

  const originMatch = text.match(/origin\s*[:\-]\s*(.+)$/i);
  if (!previousItem.origin && originMatch?.[1]?.trim()) {
    previousItem.origin = originMatch[1].trim();
    appended = true;
  }

  if (!appended && text.length < 160) {
    previousItem.description = [previousItem.description, text].filter(Boolean).join(" ");
    appended = true;
  }

  return appended;
}

function buildItemFromColumnValues(
  line: VendorQuotePdfLine,
  columnValues: Partial<Record<VendorQuotePdfColumnKey, string[]>>,
  quoteReference: string | undefined,
  vendorName: string | undefined,
) {
  const description = normalizeWhitespace((columnValues.description ?? []).join(" "));
  const itemCode = normalizeWhitespace((columnValues.itemCode ?? []).join(" ")) || undefined;
  const manufacturer = normalizeWhitespace((columnValues.manufacturer ?? []).join(" ")) || undefined;
  const warranty = normalizeWhitespace((columnValues.warranty ?? []).join(" ")) || undefined;
  const origin = normalizeWhitespace((columnValues.origin ?? []).join(" ")) || undefined;
  const quantityText = normalizeWhitespace((columnValues.quantity ?? []).join(" "));
  const unitText = normalizeWhitespace((columnValues.unit ?? []).join(" "));
  const unitPriceText = normalizeWhitespace((columnValues.unitPrice ?? []).join(" "));
  const totalText = normalizeWhitespace((columnValues.total ?? []).join(" "));
  const quantity = parseQuantity(quantityText) ?? 1;
  const unitPrice = parseCurrency(unitPriceText);
  const extendedPrice = parseCurrency(totalText);

  const resolvedUnitPrice = unitPrice ?? (extendedPrice !== null && quantity > 0 ? Number((extendedPrice / quantity).toFixed(2)) : 0);
  const resolvedExtendedPrice = extendedPrice ?? Number((quantity * resolvedUnitPrice).toFixed(2));
  const label = description || itemCode || normalizeWhitespace(line.text);

  if (!label || (resolvedExtendedPrice <= 0 && resolvedUnitPrice <= 0)) {
    return null;
  }

  return {
    id: `vendor-quote-item-${line.pageNumber}-${line.lineNumber}`,
    label,
    description: undefined,
    quantity,
    unit: unitText || "ea",
    unitPrice: resolvedUnitPrice,
    extendedPrice: resolvedExtendedPrice,
    bucket: inferBucket(label, manufacturer, warranty, origin),
    rowNumber: line.lineNumber,
    vendor: vendorName,
    itemCode,
    manufacturer,
    warranty,
    origin,
    quoteReference,
    rowKind: isChargeRow(label, description) ? "charge" : "item",
  } satisfies MajorProjectVendorQuoteDraftItem;
}

function buildItemFromRegexLine(
  line: VendorQuotePdfLine,
  quoteReference: string | undefined,
  vendorName: string | undefined,
) {
  const text = normalizeWhitespace(line.text);
  if (!text || /^(subtotal|total|grand total|project total|monthly total)\b/i.test(text)) {
    return null;
  }

  const amountMatches = Array.from(text.matchAll(/(?:\$|USD)?\s*\(?-?\d[\d,]*\.?\d{0,2}\)?/gi));
  if (amountMatches.length < 2) return null;

  const totalMatch = amountMatches[amountMatches.length - 1];
  const unitMatch = amountMatches[amountMatches.length - 2];
  const total = parseCurrency(totalMatch[0]);
  const unitPrice = parseCurrency(unitMatch[0]);
  if (total === null || unitPrice === null) return null;

  const prefix = text.slice(0, unitMatch.index).trim();
  const prefixMatch = prefix.match(/^(?:\d+\s+)?(?:([A-Z0-9./_-]{3,})\s+)?(.*?)(?:\s+(\d+(?:\.\d+)?))?(?:\s+([A-Za-z]{1,8}))?$/);
  const itemCode = normalizeWhitespace(prefixMatch?.[1] ?? "") || undefined;
  const description = normalizeWhitespace(prefixMatch?.[2] ?? prefix);
  const quantity = parseQuantity(prefixMatch?.[3] ?? "") ?? 1;
  const unit = normalizeWhitespace(prefixMatch?.[4] ?? "") || "ea";
  const label = description || itemCode || text;
  if (!label) return null;

  return {
    id: `vendor-quote-item-${line.pageNumber}-${line.lineNumber}`,
    label,
    description: undefined,
    quantity,
    unit,
    unitPrice,
    extendedPrice: total,
    bucket: inferBucket(label),
    rowNumber: line.lineNumber,
    vendor: vendorName,
    itemCode,
    quoteReference,
    rowKind: isChargeRow(label, description) ? "charge" : "item",
  } satisfies MajorProjectVendorQuoteDraftItem;
}

async function extractPdfLines(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const lines: VendorQuotePdfLine[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items
      .flatMap((item) => {
        if (!("str" in item) || !Array.isArray((item as { transform?: unknown }).transform)) {
          return [];
        }

        const textItem = item as { str: string; transform: number[] };
        return [{
          text: normalizeWhitespace(textItem.str),
          x: Number(textItem.transform[4] ?? 0),
          y: Number(textItem.transform[5] ?? 0),
        }];
      })
      .filter((item) => item.text);

    items.sort((left, right) => {
      if (Math.abs(right.y - left.y) > 2) return right.y - left.y;
      return left.x - right.x;
    });

    const pageLines: Array<{ y: number; tokens: VendorQuotePdfToken[] }> = [];
    for (const item of items) {
      const existing = pageLines.find((line) => Math.abs(line.y - item.y) <= 2);
      if (existing) {
        existing.tokens.push(item);
      } else {
        pageLines.push({ y: item.y, tokens: [item] });
      }
    }

    pageLines
      .sort((left, right) => right.y - left.y)
      .forEach((line, index) => {
        const tokens = line.tokens.sort((left, right) => left.x - right.x);
        const text = normalizeWhitespace(tokens.map((token) => token.text).join(" "));
        if (!text) return;
        const lineNumber = lines.length + 1;
        lines.push({
          text,
          tokens,
          pageNumber,
          lineNumber,
        });
      });
  }

  return lines;
}

export async function parseVendorQuotePdf(bytes: Uint8Array): Promise<ParsedVendorQuotePdf> {
  const lines = await extractPdfLines(bytes);
  const vendorName = detectVendorName(lines);
  const quoteReference = detectQuoteReference(lines);
  const { headerIndex, columns } = detectHeaderColumns(lines);
  const previewItems: MajorProjectVendorQuoteDraftItem[] = [];

  for (let index = Math.max(headerIndex + 1, 0); index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(subtotal|total|grand total|project total|monthly total)\b/i.test(line.text)) {
      continue;
    }

    const fromColumns = headerIndex >= 0 ? buildItemFromColumnValues(line, assignTokensToColumns(line, columns), quoteReference, vendorName) : null;
    const nextItem = fromColumns ?? buildItemFromRegexLine(line, quoteReference, vendorName);
    if (nextItem) {
      previewItems.push(nextItem);
      continue;
    }

    maybeAppendMetadataLine(previewItems.at(-1), line);
  }

  return {
    vendorName,
    quoteReference,
    previewItems,
  };
}

import path from "node:path";
import { pathToFileURL } from "node:url";
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
  | "description"
  | "quantity"
  | "unitPrice"
  | "vat"
  | "discount"
  | "total";

type ParsedVendorQuotePdf = {
  vendorName?: string;
  quoteReference?: string;
  previewItems: MajorProjectVendorQuoteDraftItem[];
};

let cachedPdfWorkerSrc: string | undefined;

const TABLE_STOP_PATTERN = /^(discounted:|untaxed amount:|taxes:|total amount|quote total:|subtotal\b|sales tax\b|total\b|payment term:|delivery term:|delivery time:|validity:|notes:|note to customer\b|lead time\b|expiry\b|accepted date\b|accepted by\b|confirmed by|customer'?s acknowledgement|signature:|name:|title:|page \d+ of \d+|by accepting this quote|wesco may assess|token\s*=)\b/i;
const METADATA_ONLY_PATTERN = /^(hs code:|weight:|volume:)\b/i;
const ITEM_CODE_PATTERN = /^item code:\s*(.+)$/i;
const WARRANTY_PATTERN = /^warranty:\s*(.+)$/i;
const MANUFACTURER_PATTERN = /^manufacturer:\s*(.+)$/i;
const ORIGIN_PATTERN = /^origin:\s*(.+)$/i;

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
  return /(shipping|handling|freight|delivery|fee|charge|surcharge|tax|bank transfer|banking|courier)/i.test(`${label} ${description}`.trim());
}

function detectVendorName(lines: VendorQuotePdfLine[]) {
  for (const line of lines.slice(0, 20)) {
    const match = line.text.match(/^(vendor|supplier|from)\s*[:\-]\s*(.+)$/i);
    if (match?.[2]?.trim()) {
      return match[2].trim();
    }
  }

  for (let index = 0; index < Math.min(lines.length, 12); index += 1) {
    const line = lines[index];
    const recipientSplit = line.text.split(/\bTO:/i);
    if (recipientSplit.length < 2) continue;
    const prefix = normalizeWhitespace(recipientSplit[0] ?? "");
    if (!prefix || prefix.length < 6) continue;
    const nextLine = lines[index + 1]?.text.trim();
    if (nextLine && /^(co|company)[.,\s]/i.test(nextLine)) {
      return `${prefix} ${nextLine}`.trim();
    }
    return prefix;
  }

  const companyLineIndex = lines.findIndex((line) => (
    /(INC|LTD|LLC|CORP|COMPANY|TECHNOLOGIES|INTEGRATORS)/i.test(line.text)
    && !/^(customer name|bill to|delivery to|project name|salesman|quotation|estimate|ship to|shipping info|estimate details)$/i.test(line.text)
    && !/:/.test(line.text)
    && line.text.trim().length >= 4
  ));
  if (companyLineIndex >= 0) {
    const companyLine = lines[companyLineIndex];
    const previousLine = lines[companyLineIndex - 1];
    if (
      companyLine
      && /^(co|company)[.,\s]/i.test(companyLine.text)
      && previousLine
      && /^[A-Za-z0-9&(),.'\/ -]{6,}$/.test(previousLine.text)
      && !/:/.test(previousLine.text)
    ) {
      return `${previousLine.text} ${companyLine.text}`.trim();
    }
    return companyLine.text.trim();
  }

  return undefined;
}

function detectQuoteReference(lines: VendorQuotePdfLine[]) {
  const patterns = [
    /\b(Quotation-[A-Z0-9-]+)\b/i,
    /\b(Quote(?:\s*(?:No|#|Number|Ref(?:erence)?)\s*[:#-]?\s*[A-Z0-9-]+))\b/i,
    /\b(Estimate(?:\s*(?:No|#|Number|Ref(?:erence)?)\s*[:#-]?\s*[A-Z0-9-]+))\b/i,
    /\bEstimate\s*no\.\s*:\s*([A-Z0-9-]+)\b/i,
    /#\s*([A-Z]{1,8}\d{4,}[A-Z0-9-]*)\b/i,
    /\b([A-Z]{2,6}-\d{4}-\d{3,6})\b/,
    /\b([A-Z]{2,6}\/\d{4}\/\d{3,6})\b/,
  ];

  for (const line of lines.slice(0, 60)) {
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
      } else if (!columns.vat && normalized === "vat") {
        columns.vat = token.x;
      } else if (!columns.discount && /disc/.test(normalized)) {
        columns.discount = token.x;
      } else if (!columns.total && /(total|amount|extended|extamount|lineamount)/.test(normalized)) {
        columns.total = token.x;
      }
    }

    const score = [
      columns.description,
      columns.quantity,
      columns.unitPrice,
      columns.total,
    ].filter((value) => typeof value === "number").length;

    if (score > bestScore && typeof columns.description === "number" && typeof columns.quantity === "number" && typeof columns.unitPrice === "number" && typeof columns.total === "number") {
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

function getLinePageGroups(lines: VendorQuotePdfLine[]) {
  const pageMap = new Map<number, VendorQuotePdfLine[]>();
  for (const line of lines) {
    const existing = pageMap.get(line.pageNumber);
    if (existing) {
      existing.push(line);
    } else {
      pageMap.set(line.pageNumber, [line]);
    }
  }
  return Array.from(pageMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, pageLines]) => pageLines);
}

function getTokensInRange(tokens: VendorQuotePdfToken[], minX: number, maxX = Number.POSITIVE_INFINITY) {
  return tokens.filter((token) => token.x >= minX && token.x < maxX);
}

function getJoinedText(tokens: VendorQuotePdfToken[]) {
  return normalizeWhitespace(tokens.map((token) => token.text).join(" "));
}

function getColumnBands(columns: Partial<Record<VendorQuotePdfColumnKey, number>>) {
  const ordered = Object.entries(columns)
    .flatMap(([key, x]) => (typeof x === "number"
      ? [{ key: key as VendorQuotePdfColumnKey, x }]
      : []))
    .sort((left, right) => left.x - right.x);

  const bands = new Map<VendorQuotePdfColumnKey, { start: number; end: number }>();
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    const start = previous ? (previous.x + current.x) / 2 : current.x - 8;
    const end = next ? (current.x + next.x) / 2 : Number.POSITIVE_INFINITY;
    bands.set(current.key, { start, end });
  }
  return bands;
}

function getFirstParsedValue(tokens: VendorQuotePdfToken[], parser: (value: string) => number | null) {
  for (const token of tokens) {
    const parsed = parser(token.text);
    if (parsed !== null) return parsed;
  }
  return null;
}

function getLastParsedValue(tokens: VendorQuotePdfToken[], parser: (value: string) => number | null) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const parsed = parser(tokens[index].text);
    if (parsed !== null) return parsed;
  }
  return null;
}

function isLikelySectionHeading(text: string) {
  return /^[A-Z0-9/&(),.' -]{4,}$/.test(text)
    && text === text.toUpperCase()
    && !/\$\s*\d/.test(text);
}

function isIgnorableStandaloneLine(text: string) {
  if (!text) return true;
  if (TABLE_STOP_PATTERN.test(text)) return true;
  if (METADATA_ONLY_PATTERN.test(text)) return true;
  if (/^[()（）\sA-Z]*(pcs|usd)[()（）\sA-Z]*(pcs|usd)?[()（）\sA-Z]*$/i.test(text)) return true;
  if (/^(description|quantity uom|unit price|vat|disc\.\(%\)|total)$/i.test(text)) return true;
  if (/^(customer name:|your reference:|your contact:|project name:|bill to:|delivery to:|salesman:|currency:|document number|document date|page|quotation)$/i.test(text)) return true;
  if (/^(daviteq technologies inc|globiots technologies inc)$/i.test(text)) return true;
  if (/^(office:|registered address:|tax id:|phone:|website:|email:|all banks charge)/i.test(text)) return true;
  return isLikelySectionHeading(text);
}

function buildItemFromStructuredLine(
  line: VendorQuotePdfLine,
  columns: Partial<Record<VendorQuotePdfColumnKey, number>>,
  quoteReference: string | undefined,
  vendorName: string | undefined,
): MajorProjectVendorQuoteDraftItem | null {
  const descriptionX = columns.description;
  const quantityX = columns.quantity;
  const unitPriceX = columns.unitPrice;
  const totalX = columns.total;
  if (
    typeof descriptionX !== "number"
    || typeof quantityX !== "number"
    || typeof unitPriceX !== "number"
    || typeof totalX !== "number"
  ) {
    return null;
  }

  const bands = getColumnBands(columns);
  const descriptionBand = bands.get("description");
  const quantityBand = bands.get("quantity");
  const unitPriceBand = bands.get("unitPrice");
  const totalBand = bands.get("total");
  if (!descriptionBand || !quantityBand || !unitPriceBand || !totalBand) {
    return null;
  }

  const totalTokens = getTokensInRange(line.tokens, totalBand.start, totalBand.end);
  const unitPriceTokens = getTokensInRange(line.tokens, unitPriceBand.start, unitPriceBand.end);
  const quantityAndUnitTokens = getTokensInRange(line.tokens, quantityBand.start, quantityBand.end);
  const descriptionTokens = getTokensInRange(line.tokens, descriptionBand.start, descriptionBand.end);
  const itemNumberToken = line.tokens.find((token) => token.x < descriptionBand.start && /^\d+[.]?$/.test(token.text.trim()));
  const leadingIdentifierTokens = line.tokens.filter((token) => (
    token.x < descriptionBand.start
    && !/^\d+[.]?$/.test(token.text.trim())
  ));
  const leadingIdentifier = getJoinedText(leadingIdentifierTokens);

  const label = getJoinedText(descriptionTokens) || leadingIdentifier;
  const quantity = getFirstParsedValue(quantityAndUnitTokens, parseQuantity);
  const unitPrice = getFirstParsedValue(unitPriceTokens, parseCurrency);
  const extendedPrice = getLastParsedValue(totalTokens, parseCurrency);

  if ((!itemNumberToken && !leadingIdentifier) || !label || quantity === null || unitPrice === null || extendedPrice === null) {
    return null;
  }

  const quantityTokenIndex = quantityAndUnitTokens.findIndex((token) => parseQuantity(token.text) !== null);
  const unitTokens = quantityTokenIndex >= 0 ? quantityAndUnitTokens.slice(quantityTokenIndex + 1) : [];
  const unit = getJoinedText(unitTokens) || "ea";

  return {
    id: `vendor-quote-item-${line.pageNumber}-${line.lineNumber}`,
    label,
    description: undefined,
    quantity,
    unit,
    unitPrice,
    extendedPrice,
    unitCost: unitPrice,
    extendedCost: extendedPrice,
    bucket: inferBucket(label),
    rowNumber: line.lineNumber,
    vendor: vendorName,
    quoteReference,
    rowKind: isChargeRow(label, "") ? "charge" : "item",
  } satisfies MajorProjectVendorQuoteDraftItem;
}

function appendContinuationLine(previousItem: MajorProjectVendorQuoteDraftItem | undefined, line: VendorQuotePdfLine) {
  if (!previousItem) return false;

  const text = normalizeWhitespace(line.text);
  if (!text || isIgnorableStandaloneLine(text)) return true;
  if (/^(express|cost)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?$/.test(text)) return true;
  if (/(office:|registered address:|tax id:|phone:|website:|email:|discounted:|untaxed amount:|taxes:|total amount)/i.test(text)) {
    return true;
  }

  const itemCodeMatch = text.match(ITEM_CODE_PATTERN);
  if (itemCodeMatch?.[1]?.trim()) {
    previousItem.itemCode = itemCodeMatch[1].trim();
    return true;
  }

  const warrantyMatch = text.match(WARRANTY_PATTERN);
  if (warrantyMatch?.[1]?.trim()) {
    previousItem.warranty = warrantyMatch[1].trim();
    return true;
  }

  const manufacturerMatch = text.match(MANUFACTURER_PATTERN);
  if (manufacturerMatch?.[1]?.trim()) {
    previousItem.manufacturer = manufacturerMatch[1].trim();
    return true;
  }

  const originMatch = text.match(ORIGIN_PATTERN);
  if (originMatch?.[1]?.trim()) {
    previousItem.origin = originMatch[1].trim();
    return true;
  }

  if (TABLE_STOP_PATTERN.test(text)) return true;

  previousItem.description = [previousItem.description, text].filter(Boolean).join(" ");
  return true;
}

function parseStructuredItemsFromPage(
  pageLines: VendorQuotePdfLine[],
  quoteReference: string | undefined,
  vendorName: string | undefined,
) {
  const { headerIndex, columns } = detectHeaderColumns(pageLines);
  if (headerIndex < 0) return [];

  const items: MajorProjectVendorQuoteDraftItem[] = [];
  let currentItem: MajorProjectVendorQuoteDraftItem | undefined;
  let pendingDescriptionLines: string[] = [];

  for (let index = headerIndex + 1; index < pageLines.length; index += 1) {
    const line = pageLines[index];
    const text = normalizeWhitespace(line.text);
    if (!text) continue;
    if (TABLE_STOP_PATTERN.test(text)) break;

    const nextItem = buildItemFromStructuredLine(line, columns, quoteReference, vendorName);
    if (nextItem) {
      const hydratedItem: MajorProjectVendorQuoteDraftItem = pendingDescriptionLines.length
        ? {
            ...nextItem,
            description: [pendingDescriptionLines.join(" "), nextItem.description].filter(Boolean).join(" ") || undefined,
          }
        : nextItem;
      if (pendingDescriptionLines.length) {
        pendingDescriptionLines = [];
      }
      items.push(hydratedItem);
      currentItem = hydratedItem;
      continue;
    }

    if (currentItem) {
      appendContinuationLine(currentItem, line);
    } else if (!isIgnorableStandaloneLine(text)) {
      pendingDescriptionLines.push(text);
    }
  }

  return items;
}

function inferVendorNameFromItems(items: MajorProjectVendorQuoteDraftItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.manufacturer?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

function sanitizeVendorName(
  detectedVendorName: string | undefined,
  inferredVendorName: string | undefined,
) {
  const normalized = detectedVendorName
    ?.replace(/\b\S+@\S+\b.*$/i, "")
    ?.replace(/\bhttps?:\/\/\S+\b.*$/i, "")
    ?.replace(/\s{2,}/g, " ")
    ?.trim();
  if (!normalized) return inferredVendorName;
  if (/daviteq technologies inc.+globiots technologies inc/i.test(normalized)) {
    return inferredVendorName ?? "DAVITEQ TECHNOLOGIES INC";
  }
  return normalized;
}

function sanitizeQuoteReference(value: string | undefined) {
  if (!value) return undefined;
  const normalized = normalizeWhitespace(value);
  const explicitReference = normalized.match(/^(?:quote|estimate)\s*(?:no|number|ref(?:erence)?|#)?\s*[:#-]?\s*(.+)$/i)?.[1]?.trim();
  return explicitReference || normalized;
}

function sanitizeItemDescription(value: string | undefined) {
  if (!value) return undefined;
  const normalized = normalizeWhitespace(value)
    .replace(/\bQuote Total:.*$/i, "")
    .replace(/\bPage \d+ of \d+.*$/i, "")
    .replace(/\bBY ACCEPTING THIS QUOTE\b.*$/i, "")
    .replace(/\bWesco may assess\b.*$/i, "")
    .trim();
  return normalized || undefined;
}

async function extractPdfLines(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!cachedPdfWorkerSrc) {
    const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    cachedPdfWorkerSrc = pathToFileURL(workerPath).href;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = cachedPdfWorkerSrc;
  const documentInit = { data: bytes, disableWorker: true } as Parameters<typeof pdfjs.getDocument>[0];
  const document = await pdfjs.getDocument(documentInit).promise;
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
      .forEach((line) => {
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
  const quoteReference = sanitizeQuoteReference(detectQuoteReference(lines));
  const pageGroups = getLinePageGroups(lines);
  const previewItems = pageGroups.flatMap((pageLines) => parseStructuredItemsFromPage(pageLines, quoteReference, undefined));
  const vendorName = sanitizeVendorName(detectVendorName(lines), inferVendorNameFromItems(previewItems));

  const normalizedPreviewItems = previewItems.map((item) => ({
    ...item,
    description: sanitizeItemDescription(item.description),
    vendor: item.vendor ?? vendorName,
    quoteReference: item.quoteReference ?? quoteReference,
    bucket: inferBucket(item.label, item.description, item.manufacturer, item.warranty, item.origin),
    rowKind: item.rowKind ?? (isChargeRow(item.label, item.description ?? "") ? "charge" : "item"),
  }));

  return {
    vendorName,
    quoteReference,
    previewItems: normalizedPreviewItems,
  };
}

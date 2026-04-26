import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
import type { EquipmentPricingRow, PerKitPricingRow, PoolPricingRow, QuoteRecord } from "@/app/lib/quote-record";

export type CatalogSection = "equipment" | "sectionA";
export type CatalogItemKind = "equipment" | "service";
export type CatalogServiceMode = "pool" | "per_kit" | "both";
export type CatalogRowType = "service" | "overage" | "terminal_fee" | "support";

export type CatalogItem = {
  id: string;
  sku: string;
  kind: CatalogItemKind;
  section: CatalogSection;
  label: string;
  category: string;
  description?: string;
  partNumber?: string;
  terminalType?: string;
  unitLabel?: string;
  serviceMode?: CatalogServiceMode;
  rowType?: CatalogRowType;
  source?: string;
  isActive: boolean;
  sortOrder: number;
  metadata?: Record<string, string>;
};

export type CatalogPriceBookItem = {
  itemId: string;
  unitPrice: number;
  currencyCode: string;
  notes?: string;
};

export type CatalogPriceBook = {
  id: string;
  label: string;
  quarterCode: string;
  effectiveDate: string;
  status: "draft" | "active" | "archived";
  currencyCode: string;
  notes?: string;
  items: CatalogPriceBookItem[];
};

export type CatalogStore = {
  schemaVersion: number;
  catalogName: string;
  activePriceBookId: string;
  items: CatalogItem[];
  priceBooks: CatalogPriceBook[];
  updatedAt: string;
};

export type ResolvedCatalogItem = CatalogItem & {
  unitPrice: number;
  currencyCode: string;
  priceBookId: string;
  priceBookLabel: string;
  priceBookQuarterCode: string;
};

export const CATALOG_STORAGE_KEY = "quote-tool-app:catalog-store";

const defaultEquipmentRows = sampleQuoteRecord.sections.sectionB.lineItems;
const defaultPoolRows = sampleQuoteRecord.sections.sectionA.poolRows;
const defaultPerKitRows = sampleQuoteRecord.sections.sectionA.perKitRows;

function createEquipmentItem(row: EquipmentPricingRow, index: number): CatalogItem {
  return {
    id: `item_equipment_${row.id}`,
    sku: row.partNumber || `EQ-${index + 1}`,
    kind: "equipment",
    section: "equipment",
    label: row.itemName,
    category: row.itemCategory || "Equipment",
    description: row.description,
    partNumber: row.partNumber,
    terminalType: row.terminalType,
    source: row.sourceLabel,
    isActive: true,
    sortOrder: index + 1,
  };
}

function createServiceItem(row: PoolPricingRow | PerKitPricingRow, index: number, serviceMode: CatalogServiceMode): CatalogItem {
  return {
    id: `item_service_${serviceMode}_${row.id}`,
    sku: `SVC-${serviceMode.toUpperCase()}-${index + 1}`,
    kind: "service",
    section: "sectionA",
    label: row.description,
    category:
      row.rowType === "terminal_fee"
        ? "Recurring Fee"
        : row.rowType === "overage"
          ? "Pool Overage"
          : row.rowType === "support"
            ? "Support"
            : serviceMode === "pool"
              ? "Pool Plan"
              : "Per Kit Data",
    description: row.rowType === "support" ? row.includedText?.join(" • ") : undefined,
    unitLabel: row.unitLabel ?? undefined,
    serviceMode,
    rowType: row.rowType,
    source: row.sourceLabel,
    isActive: true,
    sortOrder: index + 1,
    metadata: row.rowType === "support" && row.includedText?.length ? { includedText: row.includedText.join("\n") } : undefined,
  };
}

function buildDefaultStore(): CatalogStore {
  const equipmentItems = defaultEquipmentRows.map(createEquipmentItem);
  const poolItems = defaultPoolRows.map((row, index) => createServiceItem(row, index, "pool"));
  const perKitItems = defaultPerKitRows.map((row, index) => createServiceItem(row, index, "per_kit"));
  const items = [...equipmentItems, ...poolItems, ...perKitItems];

  const activePriceBook: CatalogPriceBook = {
    id: "pricebook-2026-q2",
    label: "2026 Q2 Active",
    quarterCode: "2026-Q2",
    effectiveDate: "2026-04-01",
    status: "active",
    currencyCode: sampleQuoteRecord.metadata.currencyCode || "USD",
    notes: "Seeded from the current builder defaults.",
    items: [
      ...defaultEquipmentRows.map((row) => ({
        itemId: `item_equipment_${row.id}`,
        unitPrice: row.unitPrice,
        currencyCode: sampleQuoteRecord.metadata.currencyCode || "USD",
      })),
      ...defaultPoolRows.map((row) => ({
        itemId: `item_service_pool_${row.id}`,
        unitPrice: row.monthlyRate ?? row.unitPrice ?? 0,
        currencyCode: sampleQuoteRecord.metadata.currencyCode || "USD",
      })),
      ...defaultPerKitRows.map((row) => ({
        itemId: `item_service_per_kit_${row.id}`,
        unitPrice: row.monthlyRate ?? row.unitPrice ?? 0,
        currencyCode: sampleQuoteRecord.metadata.currencyCode || "USD",
      })),
    ],
  };

  return {
    schemaVersion: 1,
    catalogName: "iNet Quote Catalog",
    activePriceBookId: activePriceBook.id,
    items,
    priceBooks: [activePriceBook],
    updatedAt: new Date().toISOString(),
  };
}

export const defaultCatalogStore = buildDefaultStore();

export function cloneCatalogStore(store: CatalogStore) {
  return JSON.parse(JSON.stringify(store)) as CatalogStore;
}

export function deserializeCatalogStore(value: string | null | undefined): CatalogStore | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CatalogStore;
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.priceBooks) || !parsed.activePriceBookId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function serializeCatalogStore(store: CatalogStore) {
  return JSON.stringify(store);
}

export function getActivePriceBook(store: CatalogStore) {
  return store.priceBooks.find((book) => book.id === store.activePriceBookId) ?? store.priceBooks[0] ?? null;
}

export function resolveCatalogItems(store: CatalogStore, section: CatalogSection, mode?: CatalogServiceMode): ResolvedCatalogItem[] {
  const activeBook = getActivePriceBook(store);
  if (!activeBook) return [];

  return store.items
    .filter((item) => item.section === section)
    .filter((item) => item.isActive)
    .filter((item) => {
      if (item.section !== "sectionA") return true;
      if (!mode) return true;
      return item.serviceMode === mode || item.serviceMode === "both";
    })
    .map((item) => {
      const price = activeBook.items.find((entry) => entry.itemId === item.id);
      return {
        ...item,
        unitPrice: price?.unitPrice ?? 0,
        currencyCode: price?.currencyCode ?? activeBook.currencyCode,
        priceBookId: activeBook.id,
        priceBookLabel: activeBook.label,
        priceBookQuarterCode: activeBook.quarterCode,
      } satisfies ResolvedCatalogItem;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function createEquipmentRowFromCatalog(item: ResolvedCatalogItem): EquipmentPricingRow {
  return {
    id: `b_${item.id}_${Date.now()}`,
    sourceType: "standard",
    itemName: item.label,
    itemCategory: item.category,
    terminalType: item.terminalType,
    partNumber: item.partNumber,
    quantity: 1,
    unitPrice: item.unitPrice,
    totalPrice: item.unitPrice,
    description: item.description,
    sourceLabel: `${item.priceBookQuarterCode} • ${item.source ?? "Catalog"}`,
  };
}

export function createSectionARowFromCatalog(item: ResolvedCatalogItem, mode: "pool" | "per_kit"): PoolPricingRow | PerKitPricingRow {
  const includedText = item.rowType === "support" ? item.metadata?.includedText?.split("\n").filter(Boolean) : undefined;
  const base = {
    id: `a_${mode}_${item.id}_${Date.now()}`,
    rowType: (item.rowType ?? "service") as PoolPricingRow["rowType"] & PerKitPricingRow["rowType"],
    description: item.label,
    quantity: item.rowType === "support" || item.rowType === "overage" ? null : 1,
    unitLabel: item.unitLabel ?? null,
    unitPrice: item.unitPrice,
    monthlyRate: item.unitPrice,
    totalMonthlyRate: item.rowType === "overage" ? item.unitPrice : item.rowType === "support" ? 0 : item.unitPrice,
    includedText,
    sourceLabel: `${item.priceBookQuarterCode} • ${item.source ?? "Catalog"}`,
  };

  if (mode === "pool") {
    return base as PoolPricingRow;
  }

  return {
    ...base,
    rowType: item.rowType === "overage" ? "service" : ((item.rowType ?? "service") as PerKitPricingRow["rowType"]),
  } as PerKitPricingRow;
}

export function buildCatalogImportTemplate(store: CatalogStore) {
  const activeBook = getActivePriceBook(store);
  return {
    schemaVersion: 1,
    catalogName: store.catalogName,
    activePriceBookId: store.activePriceBookId,
    items: store.items,
    priceBooks: store.priceBooks,
    importNotes: [
      "Edit items and priceBooks in JSON, then import back into the builder.",
      "For CSV imports use the builder CSV format with columns: type, sku, label, category, serviceMode, rowType, unitPrice, currencyCode, description, partNumber, terminalType, unitLabel, source, isActive.",
      `Current active price book: ${activeBook?.label ?? "n/a"}`,
    ],
  };
}

export function parseCatalogCsv(text: string, activeQuarterCode = "Imported"): CatalogStore {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    throw new Error("CSV import needs a header row and at least one item row.");
  }

  const headers = splitCsvLine(rows[0]).map((value) => value.trim());
  const dataRows = rows.slice(1).map((line) => splitCsvLine(line));
  const now = new Date().toISOString();
  const priceBookId = `pricebook-${activeQuarterCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const items: CatalogItem[] = [];
  const priceBookItems: CatalogPriceBookItem[] = [];

  dataRows.forEach((values, index) => {
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
    const section = row.type === "equipment" ? "equipment" : "sectionA";
    const id = `import_${section}_${index + 1}`;
    const item: CatalogItem = {
      id,
      sku: row.sku || `IMPORT-${index + 1}`,
      kind: row.type === "equipment" ? "equipment" : "service",
      section,
      label: row.label || `Imported item ${index + 1}`,
      category: row.category || (section === "equipment" ? "Equipment" : "Service"),
      description: row.description || undefined,
      partNumber: row.partNumber || undefined,
      terminalType: row.terminalType || undefined,
      unitLabel: row.unitLabel || undefined,
      serviceMode: row.serviceMode === "pool" || row.serviceMode === "per_kit" || row.serviceMode === "both" ? row.serviceMode : section === "sectionA" ? "both" : undefined,
      rowType: row.rowType === "service" || row.rowType === "overage" || row.rowType === "terminal_fee" || row.rowType === "support" ? row.rowType : section === "sectionA" ? "service" : undefined,
      source: row.source || "CSV import",
      isActive: row.isActive ? row.isActive.toLowerCase() !== "false" : true,
      sortOrder: index + 1,
    };
    items.push(item);
    priceBookItems.push({
      itemId: id,
      unitPrice: Number(row.unitPrice || 0),
      currencyCode: row.currencyCode || "USD",
      notes: row.notes || undefined,
    });
  });

  return {
    schemaVersion: 1,
    catalogName: "Imported Quote Catalog",
    activePriceBookId: priceBookId,
    items,
    priceBooks: [
      {
        id: priceBookId,
        label: `${activeQuarterCode} Import`,
        quarterCode: activeQuarterCode,
        effectiveDate: now.slice(0, 10),
        status: "active",
        currencyCode: priceBookItems[0]?.currencyCode ?? "USD",
        notes: "Imported from CSV",
        items: priceBookItems,
      },
    ],
    updatedAt: now,
  };
}

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function applyCatalogToQuoteTemplate(baseQuote: QuoteRecord, store: CatalogStore): QuoteRecord {
  const quote = JSON.parse(JSON.stringify(baseQuote)) as QuoteRecord;
  const equipmentCatalog = resolveCatalogItems(store, "equipment");
  const poolCatalog = resolveCatalogItems(store, "sectionA", "pool");
  const perKitCatalog = resolveCatalogItems(store, "sectionA", "per_kit");
  const activeBook = getActivePriceBook(store);

  if (activeBook) {
    quote.metadata.currencyCode = activeBook.currencyCode;
    quote.internal.internalNotes = `Catalog-driven pricing from ${activeBook.label} (${activeBook.quarterCode}).`;
  }

  quote.sections.sectionA.poolRows = poolCatalog.filter((item) => item.rowType === "support").length ? quote.sections.sectionA.poolRows : quote.sections.sectionA.poolRows;
  quote.sections.sectionA.computed.monthlyRecurringTotal = quote.sections.sectionA.poolRows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0);
  quote.sections.sectionB.computed.equipmentTotal = quote.sections.sectionB.lineItems.reduce((sum, row) => sum + row.totalPrice, 0);
  quote.metadata.documentSubtitle = `${quote.metadata.documentSubtitle} • ${activeBook?.quarterCode ?? "Catalog"}`;
  quote.revisionHistory = [
    {
      version: quote.metadata.revisionVersion,
      changeDetails: `Builder using active catalog ${activeBook?.label ?? "default"}. Available equipment items: ${equipmentCatalog.length}. Pool items: ${poolCatalog.length}. Per-kit items: ${perKitCatalog.length}.`,
    },
    ...quote.revisionHistory,
  ];

  return quote;
}

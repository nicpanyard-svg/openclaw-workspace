"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  CATALOG_STORAGE_KEY,
  cloneCatalogStore,
  createEquipmentRowFromCatalog,
  createSectionARowFromCatalog,
  defaultCatalogStore,
  deserializeCatalogStore,
  getActivePriceBook,
  parseCatalogCsv,
  resolveCatalogItems,
  serializeCatalogStore,
  type CatalogItem,
  type CatalogPriceBook,
  type CatalogStore,
  type ResolvedCatalogItem,
} from "@/app/lib/catalog-store";
import { PROPOSAL_CATALOG_STORAGE_KEY, PROPOSAL_STORAGE_KEY, serializeCatalogSnapshot, serializeQuoteRecord } from "@/app/lib/proposal-state";
import {
  type AddressBlock,
  type EquipmentPricingRow,
  type PerKitPricingRow,
  type PoolPricingRow,
  type QuoteRecord,
  type QuoteType,
  type ServicePricingRow,
} from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

type EquipmentDraft = {
  itemName: string;
  itemCategory: string;
  terminalType: string;
  partNumber: string;
  quantity: string;
  unitPrice: string;
  description: string;
};

type CustomSectionField = {
  id: string;
  label: string;
  value: string;
};

type DataQuickAddUnit = "GB" | "TB";
type ServiceStage = "budgetary" | "final";
type ServiceCategory = "site_inspection" | "installation" | "custom";
type CatalogEditorSection = "equipment" | "sectionA";
type CatalogImportMode = "json" | "csv";

type CatalogDraft = {
  id: string;
  sku: string;
  section: CatalogEditorSection;
  label: string;
  category: string;
  description: string;
  partNumber: string;
  terminalType: string;
  serviceMode: "pool" | "per_kit" | "both";
  rowType: "service" | "overage" | "terminal_fee" | "support";
  unitLabel: string;
  unitPrice: string;
  source: string;
};

const emptyEquipmentDraft: EquipmentDraft = {
  itemName: "",
  itemCategory: "Custom",
  terminalType: "",
  partNumber: "",
  quantity: "1",
  unitPrice: "0",
  description: "",
};

const emptyCatalogDraft: CatalogDraft = {
  id: "",
  sku: "",
  section: "equipment",
  label: "",
  category: "",
  description: "",
  partNumber: "",
  terminalType: "",
  serviceMode: "both",
  rowType: "service",
  unitLabel: "",
  unitPrice: "0",
  source: "Manual catalog entry",
};

function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeEquipmentRow(row: EquipmentPricingRow): EquipmentPricingRow {
  return {
    ...row,
    totalPrice: Number((row.quantity * row.unitPrice).toFixed(2)),
  };
}

function computeServiceRow(row: ServicePricingRow): ServicePricingRow {
  return {
    ...row,
    totalPrice: Number((row.quantity * row.unitPrice).toFixed(2)),
  };
}

function computeSectionARow<T extends PoolPricingRow | PerKitPricingRow>(row: T): T {
  if (row.rowType === "support") return row;

  const quantity = typeof row.quantity === "number" ? row.quantity : 1;
  const rate = typeof row.monthlyRate === "number" ? row.monthlyRate : row.unitPrice ?? 0;
  const total = row.rowType === "overage" ? rate : quantity * rate;

  return {
    ...row,
    unitPrice: row.unitPrice ?? rate,
    monthlyRate: rate,
    totalMonthlyRate: Number(total.toFixed(2)),
  };
}

function compactList(items: Array<string | undefined | null>) {
  return items.map((item) => item?.trim()).filter((item): item is string => Boolean(item));
}

function countSectionAUnits(rows: Array<PoolPricingRow | PerKitPricingRow>) {
  return rows.reduce((sum, row) => {
    if (row.rowType === "support") return sum;
    return sum + (typeof row.quantity === "number" ? row.quantity : 0);
  }, 0);
}

function buildExecutiveSummaryDraft(quote: QuoteRecord) {
  const customerName = quote.customer.name || quote.metadata.customerShortName || "the customer";
  const provider = quote.metadata.customerProvider;
  const pricingModel = quote.sections.sectionA.mode === "pool" ? "pooled service" : "per-kit service";
  const sectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;
  const serviceUnits = countSectionAUnits(sectionARows);
  const equipmentRows = quote.sections.sectionB.lineItems;
  const equipmentUnits = equipmentRows.reduce((sum, row) => sum + row.quantity, 0);
  const optionalServices = quote.sections.sectionC.enabled ? quote.sections.sectionC.lineItems : [];
  const optionalServiceLabels = compactList(optionalServices.map((row) => row.description));
  const equipmentLabels = compactList(equipmentRows.map((row) => `${row.quantity}x ${row.itemName}`));
  const recurringDescriptions = compactList(
    sectionARows
      .filter((row) => row.rowType !== "support")
      .map((row) => row.description),
  );

  const heading = "Executive Summary";
  const customerContext = `${quote.metadata.documentTitle || "Proposal"} for ${customerName} covering ${provider} connectivity, equipment, and implementation scope as currently configured in the builder.`;

  const bodyParts = [
    `This draft reflects a ${quote.metadata.quoteType === "lease" ? "lease" : "purchase"} quote structured around ${pricingModel}${serviceUnits ? ` with ${serviceUnits} active service unit${serviceUnits === 1 ? "" : "s"}` : ""}.`,
    recurringDescriptions.length
      ? `Recurring service currently includes ${recurringDescriptions.slice(0, 3).join(", ")}${recurringDescriptions.length > 3 ? ", and additional configured line items" : ""}.`
      : undefined,
    equipmentLabels.length
      ? `Hardware scope includes ${equipmentUnits} total item${equipmentUnits === 1 ? "" : "s"}, including ${equipmentLabels.slice(0, 4).join(", ")}${equipmentLabels.length > 4 ? ", and other selected equipment" : ""}.`
      : undefined,
    optionalServiceLabels.length
      ? `Optional services currently include ${optionalServiceLabels.join(", ")}.`
      : `Optional services are ${quote.sections.sectionC.enabled ? "available to add as needed" : "not included in the current draft"}.`,
    `The summary is intended as a practical starting point and can be edited before sharing the final proposal with ${customerName}.`,
  ];

  const body = compactList(bodyParts).join(" ");
  const paragraphs = compactList([customerContext, body]);

  return { heading, customerContext, body, paragraphs };
}

function cloneQuote(source: QuoteRecord): QuoteRecord {
  return JSON.parse(JSON.stringify(source)) as QuoteRecord;
}

function moveInList<T>(list: T[], index: number, direction: -1 | 1) {
  if (list.length <= 1 || index < 0 || index >= list.length) return list;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) return list;
  const clone = [...list];
  const [item] = clone.splice(index, 1);
  clone.splice(nextIndex, 0, item);
  return clone;
}

function moveToPositionInList<T>(list: T[], index: number, targetPosition: number) {
  if (list.length <= 1 || index < 0 || index >= list.length) return list;
  const boundedTarget = Math.min(Math.max(targetPosition, 1), list.length) - 1;
  if (boundedTarget === index) return list;
  const clone = [...list];
  const [item] = clone.splice(index, 1);
  clone.splice(boundedTarget, 0, item);
  return clone;
}

function ToggleCard({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] border px-4 py-4 text-left transition ${
        active
          ? "border-[#b00000] bg-[#fff6f6] shadow-[0_12px_24px_rgba(176,0,0,0.10)]"
          : "border-[#d8dde3] bg-white hover:border-[#c3ccd6]"
      }`}
    >
      <div className="text-[15px] font-semibold text-[#16202b]">{label}</div>
      <div className="mt-1 text-[13px] leading-[1.45] text-[#5d6772]">{description}</div>
    </button>
  );
}

function SectionToggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-3 rounded-full border border-[#d7dde4] bg-white px-4 py-2 text-[14px] font-medium text-[#24303b]">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function ActionButton({
  children,
  variant = "default",
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "danger";
  onClick: () => void;
  className?: string;
}) {
  const baseClass = variant === "danger" ? "danger-button" : "pill-button";

  return (
    <button type="button" className={`${baseClass} ${className}`.trim()} onClick={onClick}>
      {children}
    </button>
  );
}

function RowActions({
  rowNumber,
  totalRows,
  onMoveUp,
  onMoveDown,
  onMoveTo,
  onDuplicate,
  onRemove,
}: {
  rowNumber: number;
  totalRows: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveTo: (targetPosition: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [targetRow, setTargetRow] = useState(String(rowNumber));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton onClick={onMoveUp}>Up</ActionButton>
      <ActionButton onClick={onMoveDown}>Down</ActionButton>
      <label className="builder-inline-select min-w-[104px]">
        <span>Move to</span>
        <input value={targetRow} onChange={(e) => setTargetRow(e.target.value)} />
      </label>
      <ActionButton onClick={() => onMoveTo(parseNumber(targetRow) || rowNumber)}>Go</ActionButton>
      <ActionButton onClick={onDuplicate}>Duplicate</ActionButton>
      <ActionButton variant="danger" onClick={onRemove}>Remove</ActionButton>
      <span className="text-[12px] text-[#7a8793]">Row {rowNumber} of {totalRows}</span>
    </div>
  );
}

const accessoryMap: Record<string, string[]> = {
  "Performance G3": ["perf-pipe-adapter", "cable-50m", "non-pen-mount"],
  "Standard V4": ["pipe-adapter", "cable-50m", "non-pen-mount"],
  "Mini G1": ["mini-pole-mount", "savage-case", "cable-50m"],
};

const servicePresetTemplates: Array<{ key: string; label: string; description: string; category: ServiceCategory; stage: ServiceStage; unitPrice: number }> = [
  {
    key: "site-budgetary",
    label: "Site inspection — budgetary",
    description: "Site inspection budgetary allowance before site walk",
    category: "site_inspection",
    stage: "budgetary",
    unitPrice: 850,
  },
  {
    key: "site-final",
    label: "Site inspection — final",
    description: "Site inspection final pricing after scope is confirmed",
    category: "site_inspection",
    stage: "final",
    unitPrice: 1250,
  },
  {
    key: "install-budgetary",
    label: "Installation — budgetary",
    description: "Installation budgetary estimate before site inspection",
    category: "installation",
    stage: "budgetary",
    unitPrice: 3500,
  },
  {
    key: "install-final",
    label: "Installation — final",
    description: "Installation final pricing after site inspection",
    category: "installation",
    stage: "final",
    unitPrice: 0,
  },
];

function AddressEditor({
  title,
  address,
  onChange,
  disabled = false,
}: {
  title: string;
  address: AddressBlock;
  onChange: (next: AddressBlock) => void;
  disabled?: boolean;
}) {
  const updateLine = (index: number, value: string) => {
    const nextLines = [...address.lines];
    nextLines[index] = value;
    onChange({ ...address, lines: nextLines });
  };

  return (
    <div className={`space-y-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4 ${disabled ? "opacity-65" : ""}`}>
      <div>
        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Address block</div>
        <div className="mt-1 text-[18px] font-semibold text-[#16202b]">{title}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="builder-field compact md:col-span-2"><span>Company</span><input disabled={disabled} value={address.companyName ?? ""} onChange={(e) => onChange({ ...address, companyName: e.target.value })} /></label>
        <label className="builder-field compact md:col-span-2"><span>Attention</span><input disabled={disabled} value={address.attention ?? ""} onChange={(e) => onChange({ ...address, attention: e.target.value })} /></label>
        <label className="builder-field compact md:col-span-2"><span>Address line 1</span><input disabled={disabled} value={address.lines[0] ?? ""} onChange={(e) => updateLine(0, e.target.value)} /></label>
        <label className="builder-field compact md:col-span-2"><span>Address line 2</span><input disabled={disabled} value={address.lines[1] ?? ""} onChange={(e) => updateLine(1, e.target.value)} /></label>
        <label className="builder-field compact md:col-span-2"><span>Address line 3</span><input disabled={disabled} value={address.lines[2] ?? ""} onChange={(e) => updateLine(2, e.target.value)} /></label>
      </div>
    </div>
  );
}

function getStartingCatalogStore() {
  if (typeof window === "undefined") return cloneCatalogStore(defaultCatalogStore);
  return deserializeCatalogStore(window.localStorage.getItem(CATALOG_STORAGE_KEY)) ?? cloneCatalogStore(defaultCatalogStore);
}

function getCatalogPrice(item: CatalogItem, store: CatalogStore) {
  const activeBook = getActivePriceBook(store);
  return activeBook?.items.find((entry) => entry.itemId === item.id)?.unitPrice ?? 0;
}

function buildCatalogDraftFromItem(item: ResolvedCatalogItem): CatalogDraft {
  return {
    id: item.id,
    sku: item.sku,
    section: item.section,
    label: item.label,
    category: item.category,
    description: item.description ?? "",
    partNumber: item.partNumber ?? "",
    terminalType: item.terminalType ?? "",
    serviceMode: item.serviceMode ?? "both",
    rowType: item.rowType ?? "service",
    unitLabel: item.unitLabel ?? "",
    unitPrice: String(item.unitPrice),
    source: item.source ?? "Manual catalog entry",
  };
}

export default function QuotePreview() {
  const [quote, setQuote] = useState<QuoteRecord>(() => cloneQuote(sampleQuoteRecord));
  const [catalogStore, setCatalogStore] = useState<CatalogStore>(() => getStartingCatalogStore());
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentCategoryFilter, setEquipmentCategoryFilter] = useState("All");
  const [customEquipmentDraft, setCustomEquipmentDraft] = useState<EquipmentDraft>(emptyEquipmentDraft);
  const [customSectionFields, setCustomSectionFields] = useState<CustomSectionField[]>([]);
  const [dataQuickAddValue, setDataQuickAddValue] = useState("1");
  const [dataQuickAddUnit, setDataQuickAddUnit] = useState<DataQuickAddUnit>("TB");
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(emptyCatalogDraft);
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState<string>("");
  const [catalogImportText, setCatalogImportText] = useState("");
  const [catalogImportMode, setCatalogImportMode] = useState<CatalogImportMode>("json");
  const [catalogMessage, setCatalogMessage] = useState("Using local catalog storage. Active prices feed the builder.");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currencyCode = quote.metadata.currencyCode || getActivePriceBook(catalogStore)?.currencyCode || "USD";
  const activePriceBook = useMemo(() => getActivePriceBook(catalogStore), [catalogStore]);
  const equipmentCatalog = useMemo(() => resolveCatalogItems(catalogStore, "equipment"), [catalogStore]);
  const sectionACatalog = useMemo(() => resolveCatalogItems(catalogStore, "sectionA", quote.sections.sectionA.mode), [catalogStore, quote.sections.sectionA.mode]);
  const activeSectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;

  const recurringMonthlyTotal = useMemo(() => Number(activeSectionARows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2)), [activeSectionARows]);
  const equipmentTotal = useMemo(() => Number(quote.sections.sectionB.lineItems.reduce((sum, row) => sum + (row.totalPrice ?? row.quantity * row.unitPrice), 0).toFixed(2)), [quote.sections.sectionB.lineItems]);
  const sectionCTotal = useMemo(() => Number(quote.sections.sectionC.lineItems.reduce((sum, row) => sum + row.totalPrice, 0).toFixed(2)), [quote.sections.sectionC.lineItems]);

  const leaseMonthly = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    const term = Math.max(quote.sections.sectionA.termMonths || 1, 1);
    return Number((recurringMonthlyTotal + equipmentTotal / term).toFixed(2));
  }, [equipmentTotal, quote.metadata.quoteType, quote.sections.sectionA.termMonths, recurringMonthlyTotal]);

  const equipmentCategories = useMemo(() => ["All", ...Array.from(new Set(equipmentCatalog.map((item) => item.category))).sort()], [equipmentCatalog]);

  const filteredEquipmentCatalog = useMemo(() => {
    const search = equipmentSearch.trim().toLowerCase();
    return equipmentCatalog.filter((item) => {
      const matchesCategory = equipmentCategoryFilter === "All" || item.category === equipmentCategoryFilter;
      const haystack = [item.label, item.category, item.terminalType, item.description, item.partNumber].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [equipmentCatalog, equipmentCategoryFilter, equipmentSearch]);

  const suggestedAccessories = useMemo(() => {
    const selectedTerminalTypes = Array.from(new Set(quote.sections.sectionB.lineItems.map((row) => row.terminalType).filter(Boolean))) as string[];
    const existingLabels = new Set(quote.sections.sectionB.lineItems.map((row) => row.itemName));

    return selectedTerminalTypes
      .flatMap((terminalType) => (accessoryMap[terminalType] ?? []).map((catalogId) => ({ terminalType, catalogId })))
      .filter(({ catalogId }, index, list) => list.findIndex((entry) => entry.catalogId === catalogId) === index)
      .map(({ terminalType, catalogId }) => ({ terminalType, item: equipmentCatalog.find((entry) => entry.id.includes(catalogId) || entry.label.toLowerCase().includes(catalogId.replace(/-/g, " "))) }))
      .filter((entry): entry is { terminalType: string; item: ResolvedCatalogItem } => Boolean(entry.item))
      .filter(({ item }) => !existingLabels.has(item.label));
  }, [equipmentCatalog, quote.sections.sectionB.lineItems]);

  const catalogEquipmentRows = useMemo(() => equipmentCatalog.slice().sort((a, b) => a.sortOrder - b.sortOrder), [equipmentCatalog]);
  const catalogSectionARows = useMemo(() => resolveCatalogItems(catalogStore, "sectionA"), [catalogStore]);
  const selectedCatalogItem = useMemo(() => [...catalogEquipmentRows, ...catalogSectionARows].find((item) => item.id === selectedCatalogItemId), [catalogEquipmentRows, catalogSectionARows, selectedCatalogItemId]);

  const updateQuote = (updater: (current: QuoteRecord) => QuoteRecord) => setQuote((current) => updater(cloneQuote(current)));

  const updateCatalog = (updater: (current: CatalogStore) => CatalogStore) => {
    setCatalogStore((current) => {
      const next = updater(cloneCatalogStore(current));
      next.updatedAt = new Date().toISOString();
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CATALOG_STORAGE_KEY, serializeCatalogStore(next));
      }
      return next;
    });
  };

  const syncExecutiveSummaryParagraphs = (draft: QuoteRecord) => {
    draft.executiveSummary.paragraphs = compactList([
      draft.executiveSummary.customerContext,
      draft.executiveSummary.body,
    ]);
  };

  const generateExecutiveSummary = () => {
    const generated = buildExecutiveSummaryDraft(quote);
    updateQuote((draft) => {
      draft.executiveSummary.enabled = true;
      draft.executiveSummary.heading = generated.heading;
      draft.executiveSummary.customerContext = generated.customerContext;
      draft.executiveSummary.body = generated.body;
      draft.executiveSummary.paragraphs = generated.paragraphs;
      return draft;
    });
  };

  const updateActiveSectionARow = (rowId: string, field: string, value: string) => {
    updateQuote((draft) => {
      const rows = draft.sections.sectionA.mode === "pool" ? draft.sections.sectionA.poolRows : draft.sections.sectionA.perKitRows;
      const index = rows.findIndex((row) => row.id === rowId);
      if (index === -1) return draft;
      const row = { ...rows[index] } as PoolPricingRow | PerKitPricingRow;

      if (field === "description") row.description = value;
      if (field === "quantity") row.quantity = value === "" ? null : parseNumber(value);
      if (field === "unitPrice" || field === "monthlyRate") {
        const parsed = value === "" ? 0 : parseNumber(value);
        row.unitPrice = parsed;
        row.monthlyRate = parsed;
      }
      if (field === "unitLabel") row.unitLabel = value;
      if (field === "includedText") row.includedText = value.split("\n").filter(Boolean);

      rows[index] = computeSectionARow(row);
      return draft;
    });
  };

  const addSectionARowFromCatalog = (catalogId: string) => {
    const item = sectionACatalog.find((entry) => entry.id === catalogId);
    if (!item) return;

    updateQuote((draft) => {
      const target = draft.sections.sectionA.mode === "pool" ? draft.sections.sectionA.poolRows : draft.sections.sectionA.perKitRows;
      target.push(computeSectionARow(createSectionARowFromCatalog(item, draft.sections.sectionA.mode)));
      return draft;
    });
  };

  const addCustomDataRow = (options?: { value?: string; unit?: DataQuickAddUnit }) => {
    const quantitySource = options?.value ?? dataQuickAddValue;
    const unitSource = options?.unit ?? dataQuickAddUnit;
    const quantityValue = Math.max(parseNumber(quantitySource), 0);
    if (!quantityValue) return;
    const gbAmount = unitSource === "TB" ? quantityValue * 1000 : quantityValue;
    const labelAmount = unitSource === "TB" ? `${quantityValue} TB` : `${quantityValue} GB`;
    const monthlyRate = quote.sections.sectionA.mode === "pool"
      ? Number((gbAmount * 0.28).toFixed(2))
      : Number((gbAmount * 0.26).toFixed(2));

    updateQuote((draft) => {
      const rowId = `a_custom_${Date.now()}`;
      if (draft.sections.sectionA.mode === "pool") {
        draft.sections.sectionA.poolRows.push(
          computeSectionARow({
            id: rowId,
            rowType: "service",
            description: `${labelAmount} pooled data allowance`,
            quantity: 1,
            unitLabel: "pool",
            unitPrice: monthlyRate,
            monthlyRate,
            totalMonthlyRate: monthlyRate,
            sourceLabel: "Builder quick add",
          }),
        );
      } else {
        draft.sections.sectionA.perKitRows.push(
          computeSectionARow({
            id: rowId,
            rowType: "service",
            description: `${labelAmount} data block`,
            quantity: 1,
            unitLabel: "block",
            unitPrice: monthlyRate,
            monthlyRate,
            totalMonthlyRate: monthlyRate,
            sourceLabel: "Builder quick add",
          }),
        );
      }
      return draft;
    });
  };

  const removeActiveSectionARow = (rowId: string) => updateQuote((draft) => {
    if (draft.sections.sectionA.mode === "pool") {
      draft.sections.sectionA.poolRows = draft.sections.sectionA.poolRows.filter((row) => row.id !== rowId);
    } else {
      draft.sections.sectionA.perKitRows = draft.sections.sectionA.perKitRows.filter((row) => row.id !== rowId);
    }
    return draft;
  });

  const duplicateActiveSectionARow = (rowId: string) => updateQuote((draft) => {
    const rows = draft.sections.sectionA.mode === "pool" ? draft.sections.sectionA.poolRows : draft.sections.sectionA.perKitRows;
    const index = rows.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    rows.splice(index + 1, 0, { ...rows[index], id: `${rowId}_copy_${Date.now()}` } as typeof rows[number]);
    return draft;
  });

  const moveActiveSectionARow = (rowId: string, direction: -1 | 1) => updateQuote((draft) => {
    if (draft.sections.sectionA.mode === "pool") {
      const index = draft.sections.sectionA.poolRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.poolRows = moveInList(draft.sections.sectionA.poolRows, index, direction);
    } else {
      const index = draft.sections.sectionA.perKitRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.perKitRows = moveInList(draft.sections.sectionA.perKitRows, index, direction);
    }
    return draft;
  });

  const moveActiveSectionAToPosition = (rowId: string, targetPosition: number) => updateQuote((draft) => {
    if (draft.sections.sectionA.mode === "pool") {
      const index = draft.sections.sectionA.poolRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.poolRows = moveToPositionInList(draft.sections.sectionA.poolRows, index, targetPosition);
    } else {
      const index = draft.sections.sectionA.perKitRows.findIndex((row) => row.id === rowId);
      draft.sections.sectionA.perKitRows = moveToPositionInList(draft.sections.sectionA.perKitRows, index, targetPosition);
    }
    return draft;
  });

  const addEquipmentRow = (catalogId: string) => {
    const item = equipmentCatalog.find((entry) => entry.id === catalogId);
    if (!item) return;

    updateQuote((draft) => {
      draft.sections.sectionB.lineItems.push(computeEquipmentRow(createEquipmentRowFromCatalog(item)));
      return draft;
    });
  };

  const addCustomEquipmentRow = () => {
    const quantity = Math.max(parseNumber(customEquipmentDraft.quantity), 0);
    const unitPrice = Math.max(parseNumber(customEquipmentDraft.unitPrice), 0);
    updateQuote((draft) => {
      draft.sections.sectionB.lineItems.push(
        computeEquipmentRow({
          id: `b_custom_${Date.now()}`,
          sourceType: "custom",
          itemName: customEquipmentDraft.itemName || "Custom equipment item",
          itemCategory: customEquipmentDraft.itemCategory || "Custom",
          terminalType: customEquipmentDraft.terminalType || undefined,
          partNumber: customEquipmentDraft.partNumber || undefined,
          quantity,
          unitPrice,
          totalPrice: 0,
          description: customEquipmentDraft.description || "Manual row",
          sourceLabel: "User entry",
        }),
      );
      return draft;
    });
    setCustomEquipmentDraft(emptyEquipmentDraft);
  };

  const updateEquipmentRow = (rowId: string, field: string, value: string) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    const row = { ...draft.sections.sectionB.lineItems[index] };
    if (field === "itemName") row.itemName = value;
    if (field === "itemCategory") row.itemCategory = value;
    if (field === "terminalType") row.terminalType = value;
    if (field === "partNumber") row.partNumber = value;
    if (field === "quantity") row.quantity = Math.max(parseNumber(value), 0);
    if (field === "unitPrice") row.unitPrice = Math.max(parseNumber(value), 0);
    if (field === "description") row.description = value;
    if (field === "sourceLabel") row.sourceLabel = value;
    draft.sections.sectionB.lineItems[index] = computeEquipmentRow(row);
    return draft;
  });

  const removeEquipmentRow = (rowId: string) => updateQuote((draft) => {
    draft.sections.sectionB.lineItems = draft.sections.sectionB.lineItems.filter((row) => row.id !== rowId);
    return draft;
  });

  const duplicateEquipmentRow = (rowId: string) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    draft.sections.sectionB.lineItems.splice(index + 1, 0, { ...draft.sections.sectionB.lineItems[index], id: `${rowId}_copy_${Date.now()}` });
    return draft;
  });

  const moveEquipmentRow = (rowId: string, direction: -1 | 1) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionB.lineItems = moveInList(draft.sections.sectionB.lineItems, index, direction);
    return draft;
  });

  const moveEquipmentRowToPosition = (rowId: string, targetPosition: number) => updateQuote((draft) => {
    const index = draft.sections.sectionB.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionB.lineItems = moveToPositionInList(draft.sections.sectionB.lineItems, index, targetPosition);
    return draft;
  });

  const updateServiceRow = (rowId: string, field: string, value: string) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    const row = { ...draft.sections.sectionC.lineItems[index] };
    if (field === "description") row.description = value;
    if (field === "quantity") row.quantity = Math.max(parseNumber(value), 0);
    if (field === "unitPrice") row.unitPrice = Math.max(parseNumber(value), 0);
    if (field === "notes") row.notes = value;
    if (field === "pricingStage") row.pricingStage = value as ServiceStage;
    draft.sections.sectionC.lineItems[index] = computeServiceRow(row);
    return draft;
  });

  const addServiceRow = () => updateQuote((draft) => {
    draft.sections.sectionC.lineItems.push(
      computeServiceRow({
        id: `c_${Date.now()}`,
        sourceType: "custom",
        description: "Optional service line",
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        serviceCategory: "custom",
        pricingStage: "budgetary",
        sourceLabel: "User entry",
      }),
    );
    return draft;
  });

  const addPresetServiceRow = (presetKey: string) => {
    const preset = servicePresetTemplates.find((entry) => entry.key === presetKey);
    if (!preset) return;
    updateQuote((draft) => {
      draft.sections.sectionC.enabled = true;
      draft.sections.sectionC.lineItems.push(
        computeServiceRow({
          id: `c_${presetKey}_${Date.now()}`,
          sourceType: "standard",
          description: preset.label,
          quantity: 1,
          unitPrice: preset.unitPrice,
          totalPrice: preset.unitPrice,
          notes: preset.description,
          serviceCategory: preset.category,
          pricingStage: preset.stage,
          sourceLabel: "Builder preset",
        }),
      );
      return draft;
    });
  };

  const removeServiceRow = (rowId: string) => updateQuote((draft) => {
    draft.sections.sectionC.lineItems = draft.sections.sectionC.lineItems.filter((row) => row.id !== rowId);
    return draft;
  });

  const duplicateServiceRow = (rowId: string) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    if (index === -1) return draft;
    draft.sections.sectionC.lineItems.splice(index + 1, 0, { ...draft.sections.sectionC.lineItems[index], id: `${rowId}_copy_${Date.now()}` });
    return draft;
  });

  const moveServiceRow = (rowId: string, direction: -1 | 1) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionC.lineItems = moveInList(draft.sections.sectionC.lineItems, index, direction);
    return draft;
  });

  const moveServiceRowToPosition = (rowId: string, targetPosition: number) => updateQuote((draft) => {
    const index = draft.sections.sectionC.lineItems.findIndex((row) => row.id === rowId);
    draft.sections.sectionC.lineItems = moveToPositionInList(draft.sections.sectionC.lineItems, index, targetPosition);
    return draft;
  });

  const addCustomSectionField = () => setCustomSectionFields((current) => [...current, { id: `field_${Date.now()}`, label: `Section ${current.length + 1} label`, value: "" }]);

  const onCustomerLogoSelected = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : undefined;
      if (!result) return;
      updateQuote((draft) => {
        draft.customer.logoDataUrl = result;
        return draft;
      });
    };
    reader.readAsDataURL(file);
  };

  const persistProposalState = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(PROPOSAL_STORAGE_KEY, serializeQuoteRecord(quote));
    window.sessionStorage.setItem(PROPOSAL_CATALOG_STORAGE_KEY, serializeCatalogSnapshot(catalogStore));
  };

  const saveCatalogLocally = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CATALOG_STORAGE_KEY, serializeCatalogStore(catalogStore));
    setCatalogMessage(`Saved locally. Active price book: ${activePriceBook?.label ?? "n/a"}.`);
  };

  const exportCatalogJson = () => {
    const blob = new Blob([JSON.stringify(catalogStore, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quote-catalog-${activePriceBook?.quarterCode ?? "export"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setCatalogMessage("Catalog JSON exported.");
  };

  const createNextQuarterDraft = () => {
    updateCatalog((draft) => {
      const currentBook = getActivePriceBook(draft);
      const currentQuarter = currentBook?.quarterCode ?? "2026-Q2";
      const [yearText, quarterText] = currentQuarter.split("-Q");
      const year = parseNumber(yearText) || new Date().getFullYear();
      const quarter = parseNumber(quarterText) || 1;
      const nextQuarter = quarter === 4 ? 1 : quarter + 1;
      const nextYear = quarter === 4 ? year + 1 : year;
      const quarterCode = `${nextYear}-Q${nextQuarter}`;
      const newBookId = `pricebook-${quarterCode.toLowerCase()}`;

      const clonedItems = currentBook?.items.map((item) => ({ ...item })) ?? [];
      const newBook: CatalogPriceBook = {
        id: newBookId,
        label: `${quarterCode} Draft`,
        quarterCode,
        effectiveDate: `${nextYear}-${String(((nextQuarter - 1) * 3) + 1).padStart(2, "0")}-01`,
        status: "draft",
        currencyCode: currentBook?.currencyCode ?? "USD",
        notes: `Cloned from ${currentBook?.label ?? "current active"}`,
        items: clonedItems,
      };

      draft.priceBooks = draft.priceBooks.map((book) => ({ ...book, status: book.id === draft.activePriceBookId ? "active" : book.status }));
      draft.priceBooks.unshift(newBook);
      draft.activePriceBookId = newBook.id;
      return draft;
    });
    setCatalogMessage("Created next-quarter draft price book and made it active in the builder.");
  };

  const setActivePriceBook = (priceBookId: string) => {
    updateCatalog((draft) => {
      draft.activePriceBookId = priceBookId;
      draft.priceBooks = draft.priceBooks.map((book) => ({
        ...book,
        status: book.id === priceBookId ? "active" : book.status === "active" ? "archived" : book.status,
      }));
      return draft;
    });
    setCatalogMessage("Active price book switched. New builder adds will use that quarter's prices.");
  };

  const loadCatalogItemIntoEditor = (item: ResolvedCatalogItem) => {
    setSelectedCatalogItemId(item.id);
    setCatalogDraft(buildCatalogDraftFromItem(item));
    setCatalogMessage(`Editing ${item.label}.`);
  };

  const resetCatalogDraft = () => {
    setSelectedCatalogItemId("");
    setCatalogDraft(emptyCatalogDraft);
  };

  const saveCatalogDraft = () => {
    updateCatalog((draft) => {
      const activeBook = getActivePriceBook(draft);
      if (!activeBook) return draft;

      const isSectionA = catalogDraft.section === "sectionA";
      const itemId = selectedCatalogItemId || `catalog_${catalogDraft.section}_${Date.now()}`;
      const existingItemIndex = draft.items.findIndex((item) => item.id === itemId);
      const nextSort = existingItemIndex >= 0 ? draft.items[existingItemIndex].sortOrder : draft.items.filter((item) => item.section === catalogDraft.section).length + 1;

      const nextItem: CatalogItem = {
        id: itemId,
        sku: catalogDraft.sku || `SKU-${Date.now()}`,
        kind: isSectionA ? "service" : "equipment",
        section: catalogDraft.section,
        label: catalogDraft.label || "New catalog item",
        category: catalogDraft.category || (isSectionA ? "Service" : "Equipment"),
        description: catalogDraft.description || undefined,
        partNumber: catalogDraft.partNumber || undefined,
        terminalType: catalogDraft.terminalType || undefined,
        serviceMode: isSectionA ? catalogDraft.serviceMode : undefined,
        rowType: isSectionA ? catalogDraft.rowType : undefined,
        unitLabel: catalogDraft.unitLabel || undefined,
        source: catalogDraft.source || "Manual catalog entry",
        isActive: true,
        sortOrder: nextSort,
        metadata: isSectionA && catalogDraft.rowType === "support" && catalogDraft.description
          ? { includedText: catalogDraft.description.split("\n").filter(Boolean).join("\n") }
          : undefined,
      };

      if (existingItemIndex >= 0) {
        draft.items[existingItemIndex] = nextItem;
      } else {
        draft.items.push(nextItem);
      }

      const priceIndex = activeBook.items.findIndex((entry) => entry.itemId === itemId);
      const nextPrice = {
        itemId,
        unitPrice: parseNumber(catalogDraft.unitPrice),
        currencyCode: activeBook.currencyCode,
      };
      if (priceIndex >= 0) {
        activeBook.items[priceIndex] = nextPrice;
      } else {
        activeBook.items.push(nextPrice);
      }

      return draft;
    });

    setCatalogMessage(selectedCatalogItemId ? "Catalog item updated." : "Catalog item added.");
    resetCatalogDraft();
  };

  const deactivateCatalogItem = (itemId: string) => {
    updateCatalog((draft) => {
      const target = draft.items.find((item) => item.id === itemId);
      if (target) target.isActive = false;
      return draft;
    });
    setCatalogMessage("Catalog item marked inactive. Existing quote rows stay as-is.");
  };

  const applyCatalogImport = () => {
    try {
      const imported = catalogImportMode === "json"
        ? deserializeCatalogStore(catalogImportText)
        : parseCatalogCsv(catalogImportText, `Imported-${new Date().toISOString().slice(0, 10)}`);

      if (!imported) {
        setCatalogMessage("Import failed. JSON could not be parsed into a catalog store.");
        return;
      }

      setCatalogStore(imported);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CATALOG_STORAGE_KEY, serializeCatalogStore(imported));
      }
      setCatalogMessage(`Imported catalog. Active price book: ${getActivePriceBook(imported)?.label ?? "n/a"}.`);
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : "Catalog import failed.");
    }
  };

  const csvExample = `type,sku,label,category,serviceMode,rowType,unitPrice,currencyCode,description,partNumber,terminalType,unitLabel,source,isActive\nequipment,SL-PERF-G3,Performance G3,Terminal,,,1999,USD,Rugged enterprise kit,,Performance G3,,Quarterly sheet,true\nservice,SVC-POOL-3TB,3 TB U.S. Pool for Starlink Service,Pool Plan,pool,service,1200,USD,Quarterly pooled data row,,,,Quarterly sheet,true`;

  return (
    <main className="min-h-screen px-4 py-6 text-[#232a31] md:px-6 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <section className="rounded-[28px] border border-white/60 bg-[var(--workspace-panel)] p-6 shadow-[0_16px_40px_rgba(75,88,106,0.12)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex max-w-[820px] items-start gap-4">
              <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-[18px] bg-white shadow-[0_10px_24px_rgba(31,42,52,0.08)] ring-1 ring-[#e3e8ee]">
                <Image src="/inet-logo.png" alt="iNet logo" width={44} height={44} className="h-auto w-auto object-contain" priority />
              </div>
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8b96a3]">RapidQuote</div>
                <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.03em] text-[#16202b]">Quote builder</h1>
                <p className="mt-2 max-w-[680px] text-[15px] leading-[1.55] text-[#5a6572]">
                  Build polished iNet proposal drafts fast, with live pricing totals and a clean handoff into the proposal view.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="builder-stat-card"><div className="builder-stat-label">Recurring monthly</div><div className="builder-stat-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div><div className="builder-stat-note">Live from Section A</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">One-time equipment</div><div className="builder-stat-value">{formatCurrency(equipmentTotal, currencyCode)}</div><div className="builder-stat-note">Live from Section B</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">Optional services</div><div className="builder-stat-value">{formatCurrency(sectionCTotal, currencyCode)}</div><div className="builder-stat-note">Inspection and install pricing</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">Pricing status</div><div className="builder-stat-value">Live</div><div className="builder-stat-note">Builder totals are active and ready for proposal review</div></div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/proposal" className="pill-button pill-button-active" onClick={persistProposalState}>
              Preview Proposal
            </Link>
            <Link href="/proposal" className="pill-button" target="_blank" rel="noreferrer" onClick={persistProposalState}>
              Open Proposal in New Tab
            </Link>
            <button type="button" className="pill-button" onClick={saveCatalogLocally}>Save Draft</button>
          </div>
        </section>

        {/* Catalog admin surface intentionally hidden from main builder UI for branding-only launch. */}

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="space-y-6">
            <section className="builder-panel">
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Quote setup</div><h2 className="builder-title">Core quote details</h2></div></div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="builder-field"><span>Proposal #</span><input value={quote.metadata.proposalNumber} onChange={(e) => updateQuote((draft) => { draft.metadata.proposalNumber = e.target.value; draft.documentation.proposalNumberLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Proposal date</span><input value={quote.metadata.proposalDate} onChange={(e) => updateQuote((draft) => { draft.metadata.proposalDate = e.target.value; draft.documentation.proposalDateLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Proposal title</span><input value={quote.metadata.documentTitle} onChange={(e) => updateQuote((draft) => { draft.metadata.documentTitle = e.target.value; draft.documentation.proposalTitle = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Status</span><select value={quote.metadata.status} onChange={(e) => updateQuote((draft) => { draft.metadata.status = e.target.value as QuoteRecord["metadata"]["status"]; draft.internal.quoteStatus = e.target.value as QuoteRecord["metadata"]["status"]; return draft; })}>{["draft", "sent", "open", "negotiating", "approved", "closed"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                <label className="builder-field"><span>Proposal subtitle</span><input value={quote.metadata.documentSubtitle} onChange={(e) => updateQuote((draft) => { draft.metadata.documentSubtitle = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Customer short name</span><input value={quote.metadata.customerShortName} onChange={(e) => updateQuote((draft) => { draft.metadata.customerShortName = e.target.value; draft.customer.logoText = e.target.value; return draft; })} /></label>
              </div>

              <div className="mt-5 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                <div className="builder-eyebrow">Proposal contacts</div>
                <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Proposal and address details</h3>
                <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Everything here feeds the proposal output directly so the cover page and info page match what gets edited in the builder.</p>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="space-y-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                    <div>
                      <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Customer</div>
                      <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Contact and address</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="builder-field compact"><span>Customer name</span><input value={quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.customer.name = e.target.value; draft.billTo.companyName = e.target.value; if (draft.shippingSameAsBillTo) draft.shipTo.companyName = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Contact name</span><input value={quote.customer.contactName} onChange={(e) => updateQuote((draft) => { draft.customer.contactName = e.target.value; draft.billTo.attention = e.target.value; if (draft.shippingSameAsBillTo) draft.shipTo.attention = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Contact phone</span><input value={quote.customer.contactPhone} onChange={(e) => updateQuote((draft) => { draft.customer.contactPhone = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Contact email</span><input value={quote.customer.contactEmail} onChange={(e) => updateQuote((draft) => { draft.customer.contactEmail = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact md:col-span-2"><span>Address line 1</span><input value={quote.customer.addressLines[0] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[0] = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact md:col-span-2"><span>Address line 2</span><input value={quote.customer.addressLines[1] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[1] = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact md:col-span-2"><span>Address line 3</span><input value={quote.customer.addressLines[2] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[2] = e.target.value; return draft; })} /></label>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                    <div>
                      <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">iNet</div>
                      <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Sales contact and address</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="builder-field compact"><span>Prepared by / salesman</span><input value={quote.inet.contactName} onChange={(e) => updateQuote((draft) => { draft.inet.contactName = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>iNet sales name</span><input value={quote.inet.name} onChange={(e) => updateQuote((draft) => { draft.inet.name = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Sales phone</span><input value={quote.inet.contactPhone} onChange={(e) => updateQuote((draft) => { draft.inet.contactPhone = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Sales email</span><input value={quote.inet.contactEmail} onChange={(e) => updateQuote((draft) => { draft.inet.contactEmail = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact md:col-span-2"><span>iNet address line 1</span><input value={quote.inet.addressLines[0] ?? ""} onChange={(e) => updateQuote((draft) => { draft.inet.addressLines[0] = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact md:col-span-2"><span>iNet address line 2</span><input value={quote.inet.addressLines[1] ?? ""} onChange={(e) => updateQuote((draft) => { draft.inet.addressLines[1] = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact md:col-span-2"><span>iNet address line 3</span><input value={quote.inet.addressLines[2] ?? ""} onChange={(e) => updateQuote((draft) => { draft.inet.addressLines[2] = e.target.value; return draft; })} /></label>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <AddressEditor
                    title="Bill To"
                    address={quote.billTo}
                    onChange={(next) => updateQuote((draft) => {
                      draft.billTo = next;
                      if (draft.shippingSameAsBillTo) draft.shipTo = JSON.parse(JSON.stringify(next));
                      return draft;
                    })}
                  />

                  <div className="space-y-4">
                    <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-white px-4 py-3 text-[14px] font-medium text-[#24303b]">
                      <input
                        type="checkbox"
                        checked={quote.shippingSameAsBillTo}
                        onChange={(e) => updateQuote((draft) => {
                          draft.shippingSameAsBillTo = e.target.checked;
                          if (e.target.checked) {
                            draft.shipTo = JSON.parse(JSON.stringify(draft.billTo));
                          }
                          return draft;
                        })}
                      />
                      Ship To same as Bill To
                    </label>

                    <AddressEditor
                      title="Ship To"
                      address={quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo}
                      disabled={quote.shippingSameAsBillTo}
                      onChange={(next) => updateQuote((draft) => {
                        draft.shipTo = next;
                        return draft;
                      })}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {([
                  { key: "purchase", label: "Purchase quote", description: "Show one-time hardware separately from recurring service pricing." },
                  { key: "lease", label: "Lease quote", description: "Blend hardware into a term-based monthly view without losing line items." },
                ] as { key: QuoteType; label: string; description: string }[]).map((option) => (
                  <ToggleCard key={option.key} label={option.label} description={option.description} active={quote.metadata.quoteType === option.key} onClick={() => updateQuote((draft) => { draft.metadata.quoteType = option.key; return draft; })} />
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="builder-field"><span>Section A provider option</span><select value={quote.metadata.customerProvider} onChange={(e) => updateQuote((draft) => { draft.metadata.customerProvider = e.target.value as QuoteRecord["metadata"]["customerProvider"]; return draft; })}><option value="Starlink">Starlink</option><option value="UniSIM">UniSIM</option><option value="T-Mobile">T-Mobile</option></select></label>
                <div className="rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                  <div className="builder-eyebrow">Customer branding</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Customer logo upload</div>
                  <button type="button" className="customer-logo-dropzone mt-3 w-full text-left" onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onCustomerLogoSelected(e.dataTransfer.files?.[0]); }}>
                    <div className="text-[14px] font-semibold text-[#17212c]">Drag and drop logo here</div>
                    <div className="mt-1 text-[13px] text-[#63707d]">Or click to browse. PNG, JPG, or SVG exported as image works best.</div>
                    {quote.customer.logoDataUrl && <img src={quote.customer.logoDataUrl} alt="Customer logo preview" className="customer-logo-preview mt-4" />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onCustomerLogoSelected(e.target.files?.[0])} />
                </div>
              </div>
            </section>

            <section className="builder-panel">
              <div className="builder-panel-header">
                <div><div className="builder-eyebrow">Sections</div><h2 className="builder-title">Quote Sections</h2></div>
                <div className="flex flex-wrap gap-2">
                  <SectionToggle label="Executive Summary" enabled={quote.executiveSummary.enabled} onChange={(next) => updateQuote((draft) => { draft.executiveSummary.enabled = next; return draft; })} />
                  <SectionToggle label="Monthly service pricing" enabled={quote.sections.sectionA.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionA.enabled = next; return draft; })} />
                  <SectionToggle label="Hardware and accessories" enabled={quote.sections.sectionB.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionB.enabled = next; return draft; })} />
                  <SectionToggle label="Section C — Site inspection and install" enabled={quote.sections.sectionC.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionC.enabled = next; return draft; })} />
                </div>
              </div>
              <p className="text-[14px] leading-[1.5] text-[#5c6772]">Clear section labels stay front and center so the builder reads like a quote tool a human can use, not a schema editor.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="builder-field"><span>Section A label</span><input value={quote.sections.sectionA.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.builderLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Section B label</span><input value={quote.sections.sectionB.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionB.builderLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Section C label</span><input value={quote.sections.sectionC.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.builderLabel = e.target.value; return draft; })} /></label>
              </div>
              <div className="mt-4 space-y-3">
                {customSectionFields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 md:grid-cols-[.9fr_1.4fr_auto]">
                    <label className="builder-field compact"><span>New section field {index + 1}</span><input value={field.label} onChange={(e) => setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))} /></label>
                    <label className="builder-field compact"><span>Value</span><input value={field.value} onChange={(e) => setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, value: e.target.value } : item))} /></label>
                    <button type="button" className="danger-button self-end" onClick={() => setCustomSectionFields((current) => current.filter((item) => item.id !== field.id))}>Remove field</button>
                  </div>
                ))}
                <button type="button" className="pill-button pill-button-active" onClick={addCustomSectionField}>Add section field</button>
              </div>
            </section>

            <section className="builder-panel">
              <div className="builder-panel-header">
                <div><div className="builder-eyebrow">Executive Summary</div><h2 className="builder-title">Summary for the proposal intro page</h2></div>
                <div className="flex flex-wrap gap-2">
                  <SectionToggle label="Include in proposal" enabled={quote.executiveSummary.enabled} onChange={(next) => updateQuote((draft) => { draft.executiveSummary.enabled = next; return draft; })} />
                  <button type="button" className="pill-button pill-button-active" onClick={generateExecutiveSummary}>Generate draft summary</button>
                </div>
              </div>
              <p className="text-[14px] leading-[1.5] text-[#5c6772]">Give the proposal a usable front-end summary. Generate a draft from the current builder selections, then edit it however you want.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="builder-field"><span>Summary heading</span><input value={quote.executiveSummary.heading ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.heading = e.target.value; return draft; })} /></label>
                <div className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-3 text-[13px] text-[#5e6974]">Uses customer name, provider, pricing mode, selected equipment, quantities, and optional services to build a practical first draft.</div>
              </div>
              <div className="mt-4 grid gap-4">
                <label className="builder-field"><span>Customer context</span><textarea rows={3} value={quote.executiveSummary.customerContext ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.customerContext = e.target.value; syncExecutiveSummaryParagraphs(draft); return draft; })} /></label>
                <label className="builder-field"><span>Summary body</span><textarea rows={6} value={quote.executiveSummary.body ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.body = e.target.value; syncExecutiveSummaryParagraphs(draft); return draft; })} /></label>
              </div>
            </section>

            {quote.sections.sectionA.enabled && (
              <section className="builder-panel">
                <div className="builder-panel-header">
                  <div><div className="builder-eyebrow">Section A</div><h2 className="builder-title">{quote.sections.sectionA.builderLabel}</h2></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`pill-button ${quote.sections.sectionA.mode === "pool" ? "pill-button-active" : ""}`} onClick={() => updateQuote((draft) => { draft.sections.sectionA.mode = "pool"; return draft; })}>Pool pricing</button>
                    <button type="button" className={`pill-button ${quote.sections.sectionA.mode === "per_kit" ? "pill-button-active" : ""}`} onClick={() => updateQuote((draft) => { draft.sections.sectionA.mode = "per_kit"; return draft; })}>Per-kit pricing</button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="builder-field"><span>Section title</span><input value={quote.sections.sectionA.title} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.title = e.target.value; return draft; })} /></label>
                  <label className="builder-field"><span>Term (months)</span><input type="number" value={quote.sections.sectionA.termMonths} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.termMonths = parseNumber(e.target.value); return draft; })} /></label>
                  <label className="builder-field"><span>Quick add source row</span><select defaultValue="" onChange={(e) => { if (e.target.value) { addSectionARowFromCatalog(e.target.value); e.target.value = ""; } }}><option value="">Choose active catalog item…</option>{sectionACatalog.map((item) => <option key={item.id} value={item.id}>{item.label} — {formatCurrency(item.unitPrice, item.currencyCode)}</option>)}</select></label>
                </div>

                <div className="mt-4 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                  <div className="builder-eyebrow">Fast data add</div>
                  <h3 className="mt-1 text-[18px] font-semibold text-[#16202b]">Better quick-add options</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-[.9fr_.8fr_auto_auto]">
                    <label className="builder-field compact"><span>Amount</span><input type="number" min="0" step="0.1" value={dataQuickAddValue} onChange={(e) => setDataQuickAddValue(e.target.value)} /></label>
                    <label className="builder-field compact"><span>Unit</span><select value={dataQuickAddUnit} onChange={(e) => setDataQuickAddUnit(e.target.value as DataQuickAddUnit)}><option value="GB">GB</option><option value="TB">TB</option></select></label>
                    <button type="button" className="pill-button" onClick={() => { setDataQuickAddValue("1"); setDataQuickAddUnit("TB"); addCustomDataRow({ value: "1", unit: "TB" }); }}>Quick add 1 TB</button>
                    <button type="button" className="pill-button pill-button-active" onClick={() => addCustomDataRow()}>Add custom data row</button>
                  </div>
                </div>

                <label className="builder-field mt-4"><span>Builder notes / intro</span><textarea value={quote.sections.sectionA.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.introText = e.target.value; return draft; })} rows={3} /></label>

                <div className="mt-5 space-y-3">
                  {activeSectionARows.map((row, index) => (
                    <div key={row.id} className="line-editor-card">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Section A row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">{row.rowType === "support" ? "Included support row" : "Monthly pricing row"}</div></div>
                        <RowActions totalRows={activeSectionARows.length} rowNumber={index + 1} onMoveUp={() => moveActiveSectionARow(row.id, -1)} onMoveDown={() => moveActiveSectionARow(row.id, 1)} onMoveTo={(targetPosition) => moveActiveSectionAToPosition(row.id, targetPosition)} onDuplicate={() => duplicateActiveSectionARow(row.id)} onRemove={() => removeActiveSectionARow(row.id)} />
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[2fr_.8fr_.8fr_1fr]">
                        <label className="builder-field compact"><span>Description</span><input value={row.description} onChange={(e) => updateActiveSectionARow(row.id, "description", e.target.value)} /></label>
                        <label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "quantity", e.target.value)} disabled={row.rowType === "support"} /></label>
                        <label className="builder-field compact"><span>Unit label</span><input value={row.unitLabel ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "unitLabel", e.target.value)} disabled={row.rowType === "support"} /></label>
                        <label className="builder-field compact"><span>{row.rowType === "overage" ? "Rate / GB" : "Monthly rate"}</span><input type="number" step="0.01" value={row.monthlyRate ?? row.unitPrice ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "monthlyRate", e.target.value)} disabled={row.rowType === "support"} /></label>
                      </div>
                      {row.rowType === "support" && <label className="builder-field compact mt-3"><span>Included bullets (one per line)</span><textarea rows={3} value={(row.includedText ?? []).join("\n")} onChange={(e) => updateActiveSectionARow(row.id, "includedText", e.target.value)} /></label>}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Source: {row.sourceLabel ?? "Manual row"}</span><span>{row.rowType === "support" ? "Included row" : `Subtotal: ${formatCurrency(row.totalMonthlyRate ?? row.monthlyRate ?? 0, currencyCode)}`}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {quote.sections.sectionB.enabled && (
              <section className="builder-panel">
                <div className="builder-panel-header">
                  <div><div className="builder-eyebrow">Section B</div><h2 className="builder-title">{quote.sections.sectionB.builderLabel}</h2></div>
                  <div className="rounded-[18px] border border-[#ead9db] bg-[#fff7f7] px-4 py-3 text-[13px] text-[#6d4950]">Builder focus: pick from active catalog, add custom hardware, or adjust the current line items without clutter.</div>
                </div>

                <label className="builder-field"><span>Section note</span><textarea rows={3} value={quote.sections.sectionB.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionB.introText = e.target.value; return draft; })} /></label>

                {suggestedAccessories.length > 0 && (
                  <div className="mt-4 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                    <div className="builder-eyebrow">Smart suggestions</div>
                    <h3 className="mt-1 text-[18px] font-semibold text-[#16202b]">Accessory suggestions based on selected Starlink device</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {suggestedAccessories.map(({ terminalType, item }) => (
                        <div key={item.id} className="rounded-[18px] border border-[#d9e0e7] bg-white p-4">
                          <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">For {terminalType}</div>
                          <div className="mt-1 text-[16px] font-semibold text-[#16202b]">{item.label}</div>
                          <div className="mt-1 text-[13px] text-[#60707f]">{item.description}</div>
                          <button type="button" className="mt-3 pill-button pill-button-active" onClick={() => addEquipmentRow(item.id)}>Add suggested accessory</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr_.9fr]">
                  <div className="rounded-[24px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="builder-eyebrow">Catalog items</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Clean picker</h3></div><div className="text-[13px] text-[#66717d]">{filteredEquipmentCatalog.length} match(es)</div></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_.8fr]"><label className="builder-field compact"><span>Search hardware</span><input placeholder="mini, mount, cable..." value={equipmentSearch} onChange={(e) => setEquipmentSearch(e.target.value)} /></label><label className="builder-field compact"><span>Category</span><select value={equipmentCategoryFilter} onChange={(e) => setEquipmentCategoryFilter(e.target.value)}>{equipmentCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">{filteredEquipmentCatalog.map((item) => <div key={item.id} className="rounded-[20px] border border-[#d9e0e7] bg-white p-4 shadow-[0_8px_20px_rgba(31,42,52,0.05)]"><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">{item.category}</div><h4 className="mt-1 text-[16px] font-semibold text-[#16202b]">{item.label}</h4></div><div className="rounded-full bg-[#f3f6fa] px-3 py-1 text-[12px] font-semibold text-[#465361]">{formatCurrency(item.unitPrice, currencyCode)}</div></div><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">{item.description ?? "Source-backed catalog item."}</p><div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#66717d]">{item.terminalType && <span className="rounded-full bg-[#f6f8fb] px-3 py-1">Type: {item.terminalType}</span>}<span className="rounded-full bg-[#f6f8fb] px-3 py-1">Book: {item.priceBookQuarterCode}</span></div><button type="button" className="mt-4 pill-button pill-button-active w-full" onClick={() => addEquipmentRow(item.id)}>Add to hardware rows</button></div>)}</div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                      <div className="builder-eyebrow">Custom item flow</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Manual hardware row</h3><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Use this when the catalog does not have the part yet, or when you are quoting a placeholder from a live customer call.</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="builder-field compact"><span>Item name</span><input value={customEquipmentDraft.itemName} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, itemName: e.target.value }))} /></label><label className="builder-field compact"><span>Category</span><input value={customEquipmentDraft.itemCategory} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, itemCategory: e.target.value }))} /></label><label className="builder-field compact"><span>Terminal type</span><input value={customEquipmentDraft.terminalType} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, terminalType: e.target.value }))} /></label><label className="builder-field compact"><span>Article / part #</span><input value={customEquipmentDraft.partNumber} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, partNumber: e.target.value }))} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={customEquipmentDraft.quantity} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, quantity: e.target.value }))} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={customEquipmentDraft.unitPrice} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, unitPrice: e.target.value }))} /></label></div>
                      <label className="builder-field compact mt-3"><span>Description / notes</span><textarea rows={3} value={customEquipmentDraft.description} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, description: e.target.value }))} /></label>
                      <button type="button" className="mt-4 pill-button pill-button-active w-full" onClick={addCustomEquipmentRow}>Add custom hardware row</button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">{quote.sections.sectionB.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Hardware row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">{row.sourceType === "standard" ? "Catalog-backed line" : "Custom line"}</div></div><RowActions totalRows={quote.sections.sectionB.lineItems.length} rowNumber={index + 1} onMoveUp={() => moveEquipmentRow(row.id, -1)} onMoveDown={() => moveEquipmentRow(row.id, 1)} onMoveTo={(targetPosition) => moveEquipmentRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateEquipmentRow(row.id)} onRemove={() => removeEquipmentRow(row.id)} /></div><div className="grid gap-3 lg:grid-cols-[1.7fr_1fr_.7fr_.8fr]"><label className="builder-field compact"><span>Item</span><input value={row.itemName} onChange={(e) => updateEquipmentRow(row.id, "itemName", e.target.value)} /></label><label className="builder-field compact"><span>Category</span><input value={row.itemCategory ?? ""} onChange={(e) => updateEquipmentRow(row.id, "itemCategory", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateEquipmentRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateEquipmentRow(row.id, "unitPrice", e.target.value)} /></label></div><div className="mt-3 grid gap-3 lg:grid-cols-3"><label className="builder-field compact"><span>Terminal type</span><input value={row.terminalType ?? ""} onChange={(e) => updateEquipmentRow(row.id, "terminalType", e.target.value)} /></label><label className="builder-field compact"><span>Article / part #</span><input value={row.partNumber ?? ""} onChange={(e) => updateEquipmentRow(row.id, "partNumber", e.target.value)} /></label><label className="builder-field compact"><span>Source label</span><input value={row.sourceLabel ?? ""} onChange={(e) => updateEquipmentRow(row.id, "sourceLabel", e.target.value)} /></label></div><label className="builder-field compact mt-3"><span>Description / notes</span><input value={row.description ?? ""} onChange={(e) => updateEquipmentRow(row.id, "description", e.target.value)} /></label><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Source: {row.sourceLabel ?? (row.sourceType === "custom" ? "User entry" : "Catalog")}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div>)}</div>
              </section>
            )}

            {quote.sections.sectionC.enabled && (
              <section className="builder-panel">
                <div className="builder-panel-header"><div><div className="builder-eyebrow">Section C</div><h2 className="builder-title">{quote.sections.sectionC.builderLabel}</h2></div><button type="button" className="pill-button pill-button-active" onClick={addServiceRow}>Add service row</button></div>
                <p className="text-[14px] leading-[1.5] text-[#5c6772]">This section covers site inspection and installation pricing in both budgetary and final states.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="builder-field"><span>Section title</span><input value={quote.sections.sectionC.title} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.title = e.target.value; draft.sections.sectionC.builderLabel = e.target.value; return draft; })} /></label>
                  <label className="builder-field"><span>Section intro / note</span><textarea rows={3} value={quote.sections.sectionC.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.introText = e.target.value; return draft; })} /></label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{servicePresetTemplates.map((preset) => <button key={preset.key} type="button" className="pill-button" onClick={() => addPresetServiceRow(preset.key)}>{preset.label}</button>)}</div>

                <div className="mt-5 space-y-3">{quote.sections.sectionC.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Service row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">Optional field service</div></div><RowActions totalRows={quote.sections.sectionC.lineItems.length} rowNumber={index + 1} onMoveUp={() => moveServiceRow(row.id, -1)} onMoveDown={() => moveServiceRow(row.id, 1)} onMoveTo={(targetPosition) => moveServiceRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateServiceRow(row.id)} onRemove={() => removeServiceRow(row.id)} /></div><div className="grid gap-3 lg:grid-cols-[2fr_.7fr_.8fr_1fr]"><label className="builder-field compact"><span>Description</span><input value={row.description} onChange={(e) => updateServiceRow(row.id, "description", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateServiceRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateServiceRow(row.id, "unitPrice", e.target.value)} /></label><label className="builder-field compact"><span>Pricing stage</span><select value={row.pricingStage ?? "budgetary"} onChange={(e) => updateServiceRow(row.id, "pricingStage", e.target.value)}><option value="budgetary">Budgetary</option><option value="final">Final</option></select></label></div><label className="builder-field compact mt-3"><span>Notes</span><input value={row.notes ?? ""} onChange={(e) => updateServiceRow(row.id, "notes", e.target.value)} /></label><div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.serviceCategory === "site_inspection" ? "Site inspection" : row.serviceCategory === "installation" ? "Installation" : "Custom service"}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div>)}</div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="builder-panel sticky top-6">
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Output model</div><h2 className="builder-title">PDF-ready summary</h2></div></div>
              <div className="space-y-5 text-[14px] text-[#32404c]">
                <div className="summary-block"><div className="summary-label">Customer</div><div className="summary-value">{quote.customer.name}</div><div className="summary-subvalue">{quote.customer.contactName} • {quote.metadata.proposalNumber} • {quote.metadata.proposalDate}</div></div>
                <div className="summary-block"><div className="summary-label">Proposal info</div><div className="summary-value">{quote.metadata.documentTitle}</div><div className="summary-subvalue">Prepared by {quote.inet.contactName} • {quote.inet.contactPhone}</div></div>
                <div className="summary-block"><div className="summary-label">Bill To / Ship To</div><div className="summary-value">{quote.billTo.companyName || quote.customer.name}</div><div className="summary-subvalue">{quote.shippingSameAsBillTo ? "Ship To matches Bill To" : `${quote.shipTo.companyName || "Custom Ship To"} configured separately`}</div></div>
                <div className="summary-block"><div className="summary-label">Executive Summary</div><div className="summary-value">{quote.executiveSummary.enabled ? (quote.executiveSummary.heading?.trim() || "Executive Summary") : "Hidden"}</div><div className="summary-subvalue">{quote.executiveSummary.enabled ? `${compactList([quote.executiveSummary.customerContext, quote.executiveSummary.body]).length} editable text block(s) ready for output` : "Not included in proposal output"}</div></div>
                <div className="summary-block"><div className="summary-label">Quote type</div><div className="summary-value">{quote.metadata.quoteType === "purchase" ? "Purchase" : "Lease"}</div><div className="summary-subvalue">{quote.metadata.quoteType === "purchase" ? "Separate one-time and recurring outputs" : `Estimated monthly blended total over ${quote.sections.sectionA.termMonths} months`}</div></div>
                <div className="summary-block"><div className="summary-label">Active price book</div><div className="summary-value">{activePriceBook?.label ?? "n/a"}</div><div className="summary-subvalue">{activePriceBook?.quarterCode ?? "n/a"} • {catalogStore.items.filter((item) => item.isActive).length} active catalog item(s)</div></div>
                <div className="summary-block"><div className="summary-label">Enabled sections</div><ul className="list-disc pl-5 text-[#56616d]">{quote.sections.sectionA.enabled && <li>Monthly service pricing</li>}{quote.sections.sectionB.enabled && <li>Hardware and accessories</li>}{quote.sections.sectionC.enabled && <li>Optional field services</li>}</ul></div>
                {customSectionFields.length > 0 && <div className="summary-block"><div className="summary-label">Extra section fields</div><div className="space-y-1 text-[#56616d]">{customSectionFields.map((field) => <div key={field.id}><strong>{field.label}:</strong> {field.value || "—"}</div>)}</div></div>}
                <div className="summary-block"><div className="summary-label">Section A output</div><div className="summary-value">{quote.sections.sectionA.mode === "pool" ? "Pool pricing schedule" : "Per-kit pricing schedule"}</div><div className="summary-subvalue">{activeSectionARows.length} row(s) ready for template mapping</div></div>
                <div className="summary-block"><div className="summary-label">Section B output</div><div className="summary-value">{quote.sections.sectionB.lineItems.length} hardware row(s)</div><div className="summary-subvalue">{suggestedAccessories.length > 0 ? `${suggestedAccessories.length} accessory suggestion(s) available` : "All current accessory suggestions already added"}</div></div>
                <div className="summary-block"><div className="summary-label">Section C output</div><div className="summary-value">{quote.sections.sectionC.title}</div><div className="summary-subvalue">{quote.sections.sectionC.lineItems.length} service row(s) • {quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "budgetary").length} budgetary / {quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "final").length} final</div></div>
                <div className="summary-block"><div className="summary-label">Totals</div><div className="space-y-2 text-[#56616d]"><div className="flex justify-between gap-3"><span>Recurring monthly</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div><div className="flex justify-between gap-3"><span>One-time equipment</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div><div className="flex justify-between gap-3"><span>Optional services</span><strong>{formatCurrency(sectionCTotal, currencyCode)}</strong></div>{quote.metadata.quoteType === "lease" && <div className="flex justify-between gap-3 text-[#b00000]"><span>Blended lease monthly</span><strong>{formatCurrency(leaseMonthly, currencyCode)}</strong></div>}</div></div>
                <div className="rounded-[18px] border border-dashed border-[#d5dbe2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-[1.5] text-[#5e6974]">This stays admin-simple: local catalog now, deeper CRM sync later.</div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}


"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { equipmentCatalog, sectionACatalog } from "@/app/lib/catalog";
import type { CrmConnectionStatus, CrmProvider } from "@/app/lib/crm";
import { PROPOSAL_STORAGE_KEY, serializeQuoteRecord } from "@/app/lib/proposal-state";
import {
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

const crmStatusOptions: CrmConnectionStatus[] = ["disconnected", "configured", "connected", "error"];

const emptyEquipmentDraft: EquipmentDraft = {
  itemName: "",
  itemCategory: "Custom",
  terminalType: "",
  partNumber: "",
  quantity: "1",
  unitPrice: "0",
  description: "",
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

function cloneQuote(source: QuoteRecord): QuoteRecord {
  return JSON.parse(JSON.stringify(source)) as QuoteRecord;
}

function moveInList<T>(list: T[], index: number, direction: -1 | 1) {
  if (list.length <= 1 || index < 0 || index >= list.length) return list;
  const nextIndex = (index + direction + list.length) % list.length;
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
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    setPressed(true);
    window.setTimeout(() => setPressed(false), 160);
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`rounded-[18px] border px-4 py-4 text-left transition ${
        pressed
          ? "border-[#b00000] bg-[#b00000] text-white shadow-[0_12px_24px_rgba(176,0,0,0.18)]"
          : active
            ? "border-[#b00000] bg-[#fff6f6] shadow-[0_12px_24px_rgba(176,0,0,0.10)]"
            : "border-[#d8dde3] bg-white hover:border-[#c3ccd6]"
      }`}
    >
      <div className={`text-[15px] font-semibold ${pressed ? "text-white" : "text-[#16202b]"}`}>{label}</div>
      <div className={`mt-1 text-[13px] leading-[1.45] ${pressed ? "text-white/90" : "text-[#5d6772]"}`}>{description}</div>
    </button>
  );
}

function SectionToggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (next: boolean) => void }) {
  const [pressed, setPressed] = useState(false);

  return (
    <label className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-[14px] font-medium transition ${pressed ? "border-[#b00000] bg-[#b00000] text-white" : "border-[#d7dde4] bg-white text-[#24303b]"}`}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          setPressed(true);
          window.setTimeout(() => setPressed(false), 160);
          onChange(event.target.checked);
        }}
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
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    setPressed(true);
    window.setTimeout(() => setPressed(false), 160);
    onClick();
  };

  const baseClass = variant === "danger" ? "danger-button" : "pill-button";
  const pressedClass = "button-flash-active";

  return (
    <button type="button" className={`${baseClass} ${pressed ? pressedClass : ""} ${className}`.trim()} onClick={handleClick}>
      {children}
    </button>
  );
}

function RowActions({
  rowNumber,
  onMoveUp,
  onMoveDown,
  onMoveTo,
  onDuplicate,
  onRemove,
}: {
  rowNumber: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveTo: (targetPosition: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [targetRow, setTargetRow] = useState(String(rowNumber));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton onClick={onMoveUp}>↑ Up</ActionButton>
      <ActionButton onClick={onMoveDown}>↓ Down</ActionButton>
      <label className="builder-inline-select min-w-[120px]">
        <span>Row #</span>
        <input value={targetRow} onChange={(e) => setTargetRow(e.target.value)} />
      </label>
      <ActionButton onClick={() => onMoveTo(parseNumber(targetRow) || rowNumber)}>↻ Refresh</ActionButton>
      <ActionButton onClick={onDuplicate}>Duplicate</ActionButton>
      <ActionButton variant="danger" onClick={onRemove}>Remove</ActionButton>
    </div>
  );
}

const accessoryMap: Record<string, string[]> = {
  Performance: ["perf-pipe-adapter", "cable-50m", "non-pen-mount"],
  Standard: ["pipe-adapter", "cable-50m", "non-pen-mount"],
  Mini: ["savage-case", "cable-50m"],
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

export default function QuotePreview() {
  const [quote, setQuote] = useState<QuoteRecord>(() => cloneQuote(sampleQuoteRecord));
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentCategoryFilter, setEquipmentCategoryFilter] = useState("All");
  const [customEquipmentDraft, setCustomEquipmentDraft] = useState<EquipmentDraft>(emptyEquipmentDraft);
  const [customSectionFields, setCustomSectionFields] = useState<CustomSectionField[]>([]);
  const [dataQuickAddValue, setDataQuickAddValue] = useState("1");
  const [dataQuickAddUnit, setDataQuickAddUnit] = useState<DataQuickAddUnit>("TB");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currencyCode = quote.metadata.currencyCode || "USD";
  const activeSectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;

  const recurringMonthlyTotal = useMemo(() => Number(activeSectionARows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2)), [activeSectionARows]);
  const equipmentTotal = useMemo(() => Number(quote.sections.sectionB.lineItems.reduce((sum, row) => sum + (row.totalPrice ?? row.quantity * row.unitPrice), 0).toFixed(2)), [quote.sections.sectionB.lineItems]);
  const sectionCTotal = useMemo(() => Number(quote.sections.sectionC.lineItems.reduce((sum, row) => sum + row.totalPrice, 0).toFixed(2)), [quote.sections.sectionC.lineItems]);

  const leaseMonthly = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    const term = Math.max(quote.sections.sectionA.termMonths || 1, 1);
    return Number((recurringMonthlyTotal + equipmentTotal / term).toFixed(2));
  }, [equipmentTotal, quote.metadata.quoteType, quote.sections.sectionA.termMonths, recurringMonthlyTotal]);

  const equipmentCategories = useMemo(() => ["All", ...Array.from(new Set(equipmentCatalog.map((item) => item.category))).sort()], []);

  const filteredEquipmentCatalog = useMemo(() => {
    const search = equipmentSearch.trim().toLowerCase();
    return equipmentCatalog.filter((item) => {
      const matchesCategory = equipmentCategoryFilter === "All" || item.category === equipmentCategoryFilter;
      const haystack = [item.label, item.category, item.terminalType, item.description, item.partNumber].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [equipmentCategoryFilter, equipmentSearch]);

  const suggestedAccessories = useMemo(() => {
    const selectedTerminalTypes = Array.from(new Set(quote.sections.sectionB.lineItems.map((row) => row.terminalType).filter(Boolean))) as string[];
    const existingIds = new Set(
      quote.sections.sectionB.lineItems
        .map((row) => equipmentCatalog.find((item) => item.label === row.itemName)?.id)
        .filter(Boolean),
    );

    return selectedTerminalTypes
      .flatMap((terminalType) => (accessoryMap[terminalType] ?? []).map((catalogId) => ({ terminalType, catalogId })))
      .filter(({ catalogId }, index, list) => list.findIndex((entry) => entry.catalogId === catalogId) === index)
      .filter(({ catalogId }) => !existingIds.has(catalogId))
      .map(({ terminalType, catalogId }) => ({ terminalType, item: equipmentCatalog.find((entry) => entry.id === catalogId) }))
      .filter((entry): entry is { terminalType: string; item: (typeof equipmentCatalog)[number] } => Boolean(entry.item));
  }, [quote.sections.sectionB.lineItems]);

  const updateQuote = (updater: (current: QuoteRecord) => QuoteRecord) => setQuote((current) => updater(cloneQuote(current)));

  const updateConnector = (provider: CrmProvider, updater: (connector: QuoteRecord["integrations"]["connectors"][number]) => void) => {
    updateQuote((draft) => {
      const connector = draft.integrations.connectors.find((item) => item.provider === provider);
      if (!connector) return draft;
      updater(connector);
      draft.internal.crmSyncReady = draft.integrations.connectors.some((item) => item.enabled && item.status !== "disconnected");
      return draft;
    });
  };

  const updateReference = (key: "account" | "contact" | "deal" | "quote", field: "externalId" | "externalLabel", value: string) => {
    updateQuote((draft) => {
      const current = draft.integrations.quoteReferences[key];
      if (!current) {
        draft.integrations.quoteReferences[key] = {
          provider: "salesforce",
          entityType: key === "deal" ? "deal" : key,
          externalId: field === "externalId" ? value : "",
          externalLabel: field === "externalLabel" ? value : "",
        };
      } else {
        current[field] = value;
      }
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
      const rowId = `a_${draft.sections.sectionA.mode}_${Date.now()}`;
      const isSupport = item.id === "support-included";
      const isTerminal = item.id === "terminal-access-fee";
      const isOverage = item.id === "pool-overage";
      const row =
        draft.sections.sectionA.mode === "pool"
          ? computeSectionARow({
              id: rowId,
              rowType: isSupport ? "support" : isTerminal ? "terminal_fee" : isOverage ? "overage" : "service",
              description: item.label,
              quantity: isSupport || isOverage ? null : 1,
              unitLabel: item.unitLabel ?? null,
              unitPrice: item.defaultUnitPrice,
              monthlyRate: item.defaultUnitPrice,
              totalMonthlyRate: item.defaultUnitPrice,
              includedText: isSupport ? ["NOC 24/7/365 Support", "Customer portal access"] : undefined,
              sourceLabel: item.source,
            })
          : computeSectionARow({
              id: rowId,
              rowType: isSupport ? "support" : isTerminal ? "terminal_fee" : "service",
              description: item.label,
              quantity: isSupport ? null : 1,
              unitLabel: item.unitLabel ?? null,
              unitPrice: item.defaultUnitPrice,
              monthlyRate: item.defaultUnitPrice,
              totalMonthlyRate: item.defaultUnitPrice,
              includedText: isSupport ? ["Included support"] : undefined,
              sourceLabel: item.source,
            });

      target.push(row);
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
      draft.sections.sectionB.lineItems.push(
        computeEquipmentRow({
          id: `b_${Date.now()}`,
          sourceType: "standard",
          itemName: item.label,
          itemCategory: item.category,
          terminalType: item.terminalType,
          partNumber: item.partNumber,
          quantity: 1,
          unitPrice: item.defaultUnitPrice,
          totalPrice: item.defaultUnitPrice,
          description: item.description,
          sourceLabel: item.source,
        }),
      );
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
  };

  return (
    <main className="min-h-screen px-4 py-6 text-[#232a31] md:px-6 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <section className="rounded-[28px] border border-white/60 bg-[var(--workspace-panel)] p-6 shadow-[0_16px_40px_rgba(75,88,106,0.12)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-[780px]">
              <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8b96a3]">Quote Tool App</div>
              <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.03em] text-[#16202b]">Fillable quote builder</h1>
              <p className="mt-2 text-[15px] leading-[1.55] text-[#5a6572]">
                This pass shifts the builder closer to the source proposal style while keeping the quote tool practical. Section controls, provider selection, customer branding, and pricing rows are ready for quote assembly.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="builder-stat-card"><div className="builder-stat-label">Recurring monthly</div><div className="builder-stat-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div><div className="builder-stat-note">Live from Section A</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">One-time equipment</div><div className="builder-stat-value">{formatCurrency(equipmentTotal, currencyCode)}</div><div className="builder-stat-note">Live from Section B</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">Optional services</div><div className="builder-stat-value">{formatCurrency(sectionCTotal, currencyCode)}</div><div className="builder-stat-note">Inspection and install pricing</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">Lease rollup</div><div className="builder-stat-value">{quote.metadata.quoteType === "lease" ? formatCurrency(leaseMonthly, currencyCode) : "Off"}</div><div className="builder-stat-note">Equipment amortized across term</div></div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/proposal" className="pill-button pill-button-active" onClick={persistProposalState}>
              Preview Proposal
            </Link>
            <Link href="/proposal" className="pill-button" target="_blank" rel="noreferrer" onClick={persistProposalState}>
              Open Proposal in New Tab
            </Link>
          </div>
        </section>

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
                      <label className="builder-field compact"><span>Customer name</span><input value={quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.customer.name = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Contact name</span><input value={quote.customer.contactName} onChange={(e) => updateQuote((draft) => { draft.customer.contactName = e.target.value; return draft; })} /></label>
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
                <div><div className="builder-eyebrow">Integrations</div><h2 className="builder-title">CRM settings groundwork</h2></div>
                <div className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-3 text-[13px] text-[#5e6974] max-w-[420px]">
                  Standalone mode stays first. These settings only prepare optional Salesforce and HubSpot connectors.
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {quote.integrations.connectors.map((connector) => {
                  const isSalesforce = connector.provider === "salesforce";
                  return (
                    <div key={connector.provider} className="rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="builder-eyebrow">Optional connector</div>
                          <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">{connector.label}</h3>
                          <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">{connector.description}</p>
                        </div>
                        <label className="inline-flex items-center gap-2 rounded-full border border-[#d7dde4] bg-white px-4 py-2 text-[13px] font-semibold text-[#24303b]">
                          <input
                            type="checkbox"
                            checked={connector.enabled}
                            onChange={(e) => updateConnector(connector.provider, (draftConnector) => {
                              draftConnector.enabled = e.target.checked;
                              draftConnector.syncPreference.enabled = e.target.checked;
                            })}
                          />
                          Enabled
                        </label>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="builder-field compact">
                          <span>Connection status</span>
                          <select
                            value={connector.status}
                            onChange={(e) => updateConnector(connector.provider, (draftConnector) => {
                              draftConnector.status = e.target.value as CrmConnectionStatus;
                            })}
                          >
                            {crmStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </label>
                        <label className="builder-field compact">
                          <span>Default sync direction</span>
                          <select
                            value={connector.syncPreference.defaultDirection}
                            onChange={(e) => updateConnector(connector.provider, (draftConnector) => {
                              draftConnector.syncPreference.defaultDirection = e.target.value as typeof draftConnector.syncPreference.defaultDirection;
                            })}
                          >
                            <option value="push">Push from quote tool</option>
                            <option value="pull">Pull into quote tool</option>
                            <option value="bidirectional">Bidirectional</option>
                          </select>
                        </label>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {isSalesforce ? (
                          <>
                            <label className="builder-field compact">
                              <span>Instance URL</span>
                              <input
                                value={typeof connector.config === "object" && "instanceUrl" in connector.config ? connector.config.instanceUrl ?? "" : ""}
                                onChange={(e) => updateConnector(connector.provider, (draftConnector) => {
                                  if ("instanceUrl" in draftConnector.config) draftConnector.config.instanceUrl = e.target.value;
                                })}
                              />
                            </label>
                            <label className="builder-field compact">
                              <span>Environment</span>
                              <select
                                value={typeof connector.config === "object" && "environment" in connector.config ? connector.config.environment : "sandbox"}
                                onChange={(e) => updateConnector(connector.provider, (draftConnector) => {
                                  if ("environment" in draftConnector.config) draftConnector.config.environment = e.target.value as "production" | "sandbox";
                                })}
                              >
                                <option value="sandbox">Sandbox</option>
                                <option value="production">Production</option>
                              </select>
                            </label>
                          </>
                        ) : (
                          <>
                            <label className="builder-field compact">
                              <span>Portal ID</span>
                              <input
                                value={typeof connector.config === "object" && "portalId" in connector.config ? connector.config.portalId ?? "" : ""}
                                onChange={(e) => updateConnector(connector.provider, (draftConnector) => {
                                  if ("portalId" in draftConnector.config) draftConnector.config.portalId = e.target.value;
                                })}
                              />
                            </label>
                            <label className="builder-field compact">
                              <span>App label</span>
                              <input
                                value={typeof connector.config === "object" && "privateAppLabel" in connector.config ? connector.config.privateAppLabel ?? "" : ""}
                                onChange={(e) => updateConnector(connector.provider, (draftConnector) => {
                                  if ("privateAppLabel" in draftConnector.config) draftConnector.config.privateAppLabel = e.target.value;
                                })}
                              />
                            </label>
                          </>
                        )}
                      </div>

                      <div className="mt-4 grid gap-2 md:grid-cols-3 text-[13px] text-[#56616d]">
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={connector.syncPreference.autoCreateAccount} onChange={(e) => updateConnector(connector.provider, (draftConnector) => { draftConnector.syncPreference.autoCreateAccount = e.target.checked; })} /> Auto-create account/company</label>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={connector.syncPreference.autoCreateDeal} onChange={(e) => updateConnector(connector.provider, (draftConnector) => { draftConnector.syncPreference.autoCreateDeal = e.target.checked; })} /> Auto-create deal/opportunity</label>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={connector.syncPreference.autoAttachQuotePdf} onChange={(e) => updateConnector(connector.provider, (draftConnector) => { draftConnector.syncPreference.autoAttachQuotePdf = e.target.checked; })} /> Attach PDF on sync</label>
                      </div>

                      <div className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Default field mapping stubs</div>
                        <div className="mt-2 space-y-2 text-[13px] text-[#5e6974]">
                          {connector.fieldMappings.map((mapping) => (
                            <div key={`${mapping.provider}-${mapping.internalField}-${mapping.externalField}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-[#f7f9fb] px-3 py-2">
                              <span><strong>{mapping.internalField}</strong> → {mapping.externalField}</span>
                              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697684]">{mapping.direction}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                <div className="builder-eyebrow">External IDs stay separate</div>
                <h3 className="mt-1 text-[18px] font-semibold text-[#16202b]">CRM reference slots</h3>
                <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">These are connector-facing references only. The quote still works even if every field below is blank.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="builder-field compact"><span>Account / company label</span><input value={quote.integrations.quoteReferences.account?.externalLabel ?? ""} onChange={(e) => updateReference("account", "externalLabel", e.target.value)} /></label>
                  <label className="builder-field compact"><span>Account / company ID</span><input value={quote.integrations.quoteReferences.account?.externalId ?? ""} onChange={(e) => updateReference("account", "externalId", e.target.value)} /></label>
                  <label className="builder-field compact"><span>Contact label</span><input value={quote.integrations.quoteReferences.contact?.externalLabel ?? ""} onChange={(e) => updateReference("contact", "externalLabel", e.target.value)} /></label>
                  <label className="builder-field compact"><span>Contact ID</span><input value={quote.integrations.quoteReferences.contact?.externalId ?? ""} onChange={(e) => updateReference("contact", "externalId", e.target.value)} /></label>
                  <label className="builder-field compact"><span>Deal / opportunity label</span><input value={quote.integrations.quoteReferences.deal?.externalLabel ?? ""} onChange={(e) => updateReference("deal", "externalLabel", e.target.value)} /></label>
                  <label className="builder-field compact"><span>Deal / opportunity ID</span><input value={quote.integrations.quoteReferences.deal?.externalId ?? ""} onChange={(e) => updateReference("deal", "externalId", e.target.value)} /></label>
                  <label className="builder-field compact"><span>Quote label</span><input value={quote.integrations.quoteReferences.quote?.externalLabel ?? ""} onChange={(e) => updateReference("quote", "externalLabel", e.target.value)} /></label>
                  <label className="builder-field compact"><span>Quote ID</span><input value={quote.integrations.quoteReferences.quote?.externalId ?? ""} onChange={(e) => updateReference("quote", "externalId", e.target.value)} /></label>
                </div>
              </div>
            </section>

            <section className="builder-panel">
              <div className="builder-panel-header">
                <div><div className="builder-eyebrow">Sections</div><h2 className="builder-title">Quote Sections</h2></div>
                <div className="flex flex-wrap gap-2">
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
                  <label className="builder-field"><span>Quick add source row</span><select defaultValue="" onChange={(e) => { if (e.target.value) { addSectionARowFromCatalog(e.target.value); e.target.value = ""; } }}><option value="">Choose Section A item…</option>{sectionACatalog.filter((item) => quote.sections.sectionA.mode === "pool" ? !item.id.startsWith("block-") : !item.id.startsWith("pool-")).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
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
                        <RowActions rowNumber={index + 1} onMoveUp={() => moveActiveSectionARow(row.id, -1)} onMoveDown={() => moveActiveSectionARow(row.id, 1)} onMoveTo={(targetPosition) => moveActiveSectionAToPosition(row.id, targetPosition)} onDuplicate={() => duplicateActiveSectionARow(row.id)} onRemove={() => removeActiveSectionARow(row.id)} />
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
                  <div className="rounded-[18px] border border-[#ead9db] bg-[#fff7f7] px-4 py-3 text-[13px] text-[#6d4950]">Builder focus: pick from catalog, add custom hardware, or mint an article number without leaving the row-builder.</div>
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
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="builder-eyebrow">Standard catalog items</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Clean picker</h3></div><div className="text-[13px] text-[#66717d]">{filteredEquipmentCatalog.length} match(es)</div></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_.8fr]"><label className="builder-field compact"><span>Search hardware</span><input placeholder="kit, mount, cable..." value={equipmentSearch} onChange={(e) => setEquipmentSearch(e.target.value)} /></label><label className="builder-field compact"><span>Category</span><select value={equipmentCategoryFilter} onChange={(e) => setEquipmentCategoryFilter(e.target.value)}>{equipmentCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">{filteredEquipmentCatalog.map((item) => <div key={item.id} className="rounded-[20px] border border-[#d9e0e7] bg-white p-4 shadow-[0_8px_20px_rgba(31,42,52,0.05)]"><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">{item.category}</div><h4 className="mt-1 text-[16px] font-semibold text-[#16202b]">{item.label}</h4></div><div className="rounded-full bg-[#f3f6fa] px-3 py-1 text-[12px] font-semibold text-[#465361]">{formatCurrency(item.defaultUnitPrice, currencyCode)}</div></div><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">{item.description ?? "Source-backed catalog item."}</p><div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#66717d]">{item.terminalType && <span className="rounded-full bg-[#f6f8fb] px-3 py-1">Type: {item.terminalType}</span>}<span className="rounded-full bg-[#f6f8fb] px-3 py-1">Source: {item.source}</span></div><button type="button" className="mt-4 pill-button pill-button-active w-full" onClick={() => addEquipmentRow(item.id)}>Add to hardware rows</button></div>)}</div>
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

                <div className="mt-5 space-y-3">{quote.sections.sectionB.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Hardware row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">{row.sourceType === "standard" ? "Catalog-backed line" : "Custom line"}</div></div><RowActions rowNumber={index + 1} onMoveUp={() => moveEquipmentRow(row.id, -1)} onMoveDown={() => moveEquipmentRow(row.id, 1)} onMoveTo={(targetPosition) => moveEquipmentRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateEquipmentRow(row.id)} onRemove={() => removeEquipmentRow(row.id)} /></div><div className="grid gap-3 lg:grid-cols-[1.7fr_1fr_.7fr_.8fr]"><label className="builder-field compact"><span>Item</span><input value={row.itemName} onChange={(e) => updateEquipmentRow(row.id, "itemName", e.target.value)} /></label><label className="builder-field compact"><span>Category</span><input value={row.itemCategory ?? ""} onChange={(e) => updateEquipmentRow(row.id, "itemCategory", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateEquipmentRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateEquipmentRow(row.id, "unitPrice", e.target.value)} /></label></div><div className="mt-3 grid gap-3 lg:grid-cols-3"><label className="builder-field compact"><span>Terminal type</span><input value={row.terminalType ?? ""} onChange={(e) => updateEquipmentRow(row.id, "terminalType", e.target.value)} /></label><label className="builder-field compact"><span>Article / part #</span><input value={row.partNumber ?? ""} onChange={(e) => updateEquipmentRow(row.id, "partNumber", e.target.value)} /></label><label className="builder-field compact"><span>Source label</span><input value={row.sourceLabel ?? ""} onChange={(e) => updateEquipmentRow(row.id, "sourceLabel", e.target.value)} /></label></div><label className="builder-field compact mt-3"><span>Description / notes</span><input value={row.description ?? ""} onChange={(e) => updateEquipmentRow(row.id, "description", e.target.value)} /></label><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Source: {row.sourceLabel ?? (row.sourceType === "custom" ? "User entry" : "Catalog")}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div>)}</div>
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

                <div className="mt-5 space-y-3">{quote.sections.sectionC.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Service row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">Optional field service</div></div><RowActions rowNumber={index + 1} onMoveUp={() => moveServiceRow(row.id, -1)} onMoveDown={() => moveServiceRow(row.id, 1)} onMoveTo={(targetPosition) => moveServiceRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateServiceRow(row.id)} onRemove={() => removeServiceRow(row.id)} /></div><div className="grid gap-3 lg:grid-cols-[2fr_.7fr_.8fr_1fr]"><label className="builder-field compact"><span>Description</span><input value={row.description} onChange={(e) => updateServiceRow(row.id, "description", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateServiceRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateServiceRow(row.id, "unitPrice", e.target.value)} /></label><label className="builder-field compact"><span>Pricing stage</span><select value={row.pricingStage ?? "budgetary"} onChange={(e) => updateServiceRow(row.id, "pricingStage", e.target.value)}><option value="budgetary">Budgetary</option><option value="final">Final</option></select></label></div><label className="builder-field compact mt-3"><span>Notes</span><input value={row.notes ?? ""} onChange={(e) => updateServiceRow(row.id, "notes", e.target.value)} /></label><div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.serviceCategory === "site_inspection" ? "Site inspection" : row.serviceCategory === "installation" ? "Installation" : "Custom service"}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div>)}</div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="builder-panel sticky top-6">
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Output model</div><h2 className="builder-title">PDF-ready summary</h2></div></div>
              <div className="space-y-5 text-[14px] text-[#32404c]">
                <div className="summary-block"><div className="summary-label">Customer</div><div className="summary-value">{quote.customer.name}</div><div className="summary-subvalue">{quote.customer.contactName} • {quote.metadata.proposalNumber} • {quote.metadata.proposalDate}</div></div>
                <div className="summary-block"><div className="summary-label">Proposal info</div><div className="summary-value">{quote.metadata.documentTitle}</div><div className="summary-subvalue">Prepared by {quote.inet.contactName} • {quote.inet.contactPhone}</div></div>
                <div className="summary-block"><div className="summary-label">Quote type</div><div className="summary-value">{quote.metadata.quoteType === "purchase" ? "Purchase" : "Lease"}</div><div className="summary-subvalue">{quote.metadata.quoteType === "purchase" ? "Separate one-time and recurring outputs" : `Estimated monthly blended total over ${quote.sections.sectionA.termMonths} months`}</div></div>
                <div className="summary-block"><div className="summary-label">Section A provider</div><div className="summary-value">{quote.metadata.customerProvider}</div><div className="summary-subvalue">Builder-only provider option for the recurring services section</div></div>
                <div className="summary-block"><div className="summary-label">CRM state</div><div className="summary-value">{quote.integrations.connectors.filter((connector) => connector.enabled).length ? `${quote.integrations.connectors.filter((connector) => connector.enabled).length} connector(s) enabled` : "Standalone mode"}</div><div className="summary-subvalue">{quote.integrations.lastSyncSummary ?? "No CRM sync summary yet."}</div></div>
                <div className="summary-block"><div className="summary-label">Enabled sections</div><ul className="list-disc pl-5 text-[#56616d]">{quote.sections.sectionA.enabled && <li>Monthly service pricing</li>}{quote.sections.sectionB.enabled && <li>Hardware and accessories</li>}{quote.sections.sectionC.enabled && <li>Optional field services</li>}</ul></div>
                {customSectionFields.length > 0 && <div className="summary-block"><div className="summary-label">Extra section fields</div><div className="space-y-1 text-[#56616d]">{customSectionFields.map((field) => <div key={field.id}><strong>{field.label}:</strong> {field.value || "—"}</div>)}</div></div>}
                <div className="summary-block"><div className="summary-label">Section A output</div><div className="summary-value">{quote.sections.sectionA.mode === "pool" ? "Pool pricing schedule" : "Per-kit pricing schedule"}</div><div className="summary-subvalue">{activeSectionARows.length} row(s) ready for template mapping</div></div>
                <div className="summary-block"><div className="summary-label">Section B output</div><div className="summary-value">{quote.sections.sectionB.lineItems.length} hardware row(s)</div><div className="summary-subvalue">{suggestedAccessories.length > 0 ? `${suggestedAccessories.length} accessory suggestion(s) available` : "All current accessory suggestions already added"}</div></div>
                <div className="summary-block"><div className="summary-label">Section C output</div><div className="summary-value">{quote.sections.sectionC.title}</div><div className="summary-subvalue">{quote.sections.sectionC.lineItems.length} service row(s) • {quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "budgetary").length} budgetary / {quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "final").length} final</div></div>
                <div className="summary-block"><div className="summary-label">Totals</div><div className="space-y-2 text-[#56616d]"><div className="flex justify-between gap-3"><span>Recurring monthly</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div><div className="flex justify-between gap-3"><span>One-time equipment</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div><div className="flex justify-between gap-3"><span>Optional services</span><strong>{formatCurrency(sectionCTotal, currencyCode)}</strong></div>{quote.metadata.quoteType === "lease" && <div className="flex justify-between gap-3 text-[#b00000]"><span>Blended lease monthly</span><strong>{formatCurrency(leaseMonthly, currencyCode)}</strong></div>}</div></div>
                <div className="rounded-[18px] border border-dashed border-[#d5dbe2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-[1.5] text-[#5e6974]">Next step after this pass: serialize the builder state cleanly and map it into branded PDF / DOCX output. First make the row-builder solid.</div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import Link from "next/link";
import { ProductLogo } from "@/app/components/product-logo";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-shell";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, createProposalCopy, createProposalFromQuote, deserializeProposalStore, getActiveProposal, getDefaultProposalStore, mockUsers, serializeProposalStore, statusToStageLabel, upsertProposal, type SavedProposalRecord } from "@/app/lib/proposal-store";
import { PROPOSAL_STORAGE_KEY, serializeQuoteRecord } from "@/app/lib/proposal-state";
import { equipmentCatalog, sectionACatalog } from "@/app/lib/catalog";
import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, ensureMajorProjectState, getActiveMajorProjectOption } from "@/app/lib/major-project";
import { getQuoteContentPresence } from "@/app/lib/proposal-commercial-summary";
import {
  type AddressBlock,
  type EquipmentPricingRow,
  type PerKitPricingRow,
  type PoolPricingRow,
  type QuoteCustomField,
  type QuoteRecord,
  type QuoteType,
  type ServicePricingRow,
} from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
import { createBlankQuoteRecord } from "@/app/lib/quote-template";

type EquipmentDraft = {
  itemName: string;
  itemCategory: string;
  terminalType: string;
  partNumber: string;
  quantity: string;
  unitPrice: string;
  description: string;
};

type CustomSectionField = QuoteCustomField;

type DataQuickAddUnit = "GB" | "TB";
type ServiceStage = "budgetary" | "final";
type ServiceCategory = "site_inspection" | "installation" | "custom";

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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

function createEquipmentRowFromCatalog(catalogId: string): EquipmentPricingRow | null {
  const item = equipmentCatalog.find((entry) => entry.id === catalogId);
  if (!item) return null;

  return {
    id: `b_${catalogId}_${Date.now()}`,
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
  };
}

function createSectionARowFromCatalog(catalogId: string, mode: "pool" | "per_kit"): PoolPricingRow | PerKitPricingRow | null {
  const item = sectionACatalog.find((entry) => entry.id === catalogId);
  if (!item) return null;

  if (item.id === "support-included") {
    return {
      id: `a_${catalogId}_${Date.now()}`,
      rowType: "support",
      description: item.label,
      includedText: item.description ? [item.description] : ["iNet customer support and portal access included."],
      sourceLabel: item.source,
    };
  }

  if (item.id === "pool-overage" && mode === "pool") {
    return {
      id: `a_${catalogId}_${Date.now()}`,
      rowType: "overage",
      description: item.label,
      quantity: 1,
      unitLabel: item.unitLabel ?? "GB",
      unitPrice: item.defaultUnitPrice,
      monthlyRate: item.defaultUnitPrice,
      totalMonthlyRate: item.defaultUnitPrice,
      sourceLabel: item.source,
    };
  }

  if (item.id === "terminal-access-fee") {
    return {
      id: `a_${catalogId}_${Date.now()}`,
      rowType: "terminal_fee",
      description: item.label,
      quantity: 1,
      unitLabel: item.unitLabel ?? "kit",
      unitPrice: item.defaultUnitPrice,
      monthlyRate: item.defaultUnitPrice,
      totalMonthlyRate: item.defaultUnitPrice,
      sourceLabel: item.source,
    };
  }

  const compatibleWithMode =
    mode === "pool"
      ? item.category !== "Per Kit Data"
      : item.category !== "Pool Plan" && item.category !== "Pool Overage";

  if (!compatibleWithMode) return null;

  return {
    id: `a_${catalogId}_${Date.now()}`,
    rowType: "service",
    description: item.label,
    quantity: 1,
    unitLabel: item.unitLabel ?? (mode === "pool" ? "pool" : "block"),
    unitPrice: item.defaultUnitPrice,
    monthlyRate: item.defaultUnitPrice,
    totalMonthlyRate: item.defaultUnitPrice,
    sourceLabel: item.source,
  };
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
      <input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} />
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

function CommercialMetricCard({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className={`rounded-[18px] border p-4 ${accent ? "border-[#f1d1d1] bg-[#fff7f7]" : "border-[#dde3e8] bg-white"}`}>
      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">{label}</div>
      <div className={`mt-2 text-[24px] font-semibold tracking-[-0.03em] ${accent ? "text-[#b00000]" : "text-[#16202b]"}`}>{value}</div>
      <div className="mt-1 text-[13px] text-[#60707f]">{note}</div>
    </div>
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

export default function QuotePreview() {
  const { user } = useAuth();
  const [isHydrated, setIsHydrated] = useState(false);
  const [quote, setQuote] = useState<QuoteRecord>(createBlankQuoteRecord());
  const [activeProposal, setActiveProposal] = useState<SavedProposalRecord | null>(null);
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentCategoryFilter, setEquipmentCategoryFilter] = useState("All");
  const [customEquipmentDraft, setCustomEquipmentDraft] = useState<EquipmentDraft>(emptyEquipmentDraft);
  const [customSectionFields, setCustomSectionFields] = useState<CustomSectionField[]>(createBlankQuoteRecord().customFields ?? []);
  const [dataQuickAddValue, setDataQuickAddValue] = useState("1");
  const [dataQuickAddUnit, setDataQuickAddUnit] = useState<DataQuickAddUnit>("TB");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const activeProposalId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
    const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const fallbackStore = getDefaultProposalStore(createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }));
    const sessionUser = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.title,
          team: user.team,
        }
      : fallbackStore.currentUser;

    const store = savedStore
      ? {
          ...savedStore,
          currentUser: sessionUser,
        }
      : {
          ...fallbackStore,
          currentUser: sessionUser,
        };

    if (!savedStore) {
      window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(store));
    }

    const searchParams = new URLSearchParams(window.location.search);
    const requestedProposalId = searchParams.get("proposalId");
    const forceNewDraft = searchParams.get("mode") === "new";
    const matchedProposal = forceNewDraft
      ? null
      : getActiveProposal(store, requestedProposalId ?? activeProposalId);
    const nextQuote = ensureMajorProjectState(matchedProposal ? cloneQuote(matchedProposal.quote) : createBlankQuoteRecord());

    if (forceNewDraft) {
      window.localStorage.removeItem(ACTIVE_PROPOSAL_ID_KEY);
    } else if (matchedProposal) {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, matchedProposal.id);
    }

    setActiveProposal(matchedProposal);
    setQuote(nextQuote);
    setCustomSectionFields(nextQuote.customFields ?? []);
    setIsHydrated(true);
  }, [user]);

  const currencyCode = quote.metadata.currencyCode || "USD";
  const workflowMode = quote.metadata.workflowMode ?? "quick_quote";
  const isMajorProject = workflowMode === "major_project";
  const majorProjectState = ensureMajorProjectState(quote).majorProject;
  const activeMajorOption = getActiveMajorProjectOption(ensureMajorProjectState(quote));
  const activeSectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;

  const recurringMonthlyTotal = useMemo(() => Number(activeSectionARows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2)), [activeSectionARows]);
  const equipmentTotal = useMemo(() => Number(quote.sections.sectionB.lineItems.reduce((sum, row) => sum + (row.totalPrice ?? row.quantity * row.unitPrice), 0).toFixed(2)), [quote.sections.sectionB.lineItems]);
  const sectionCTotal = useMemo(() => Number(quote.sections.sectionC.lineItems.reduce((sum, row) => sum + row.totalPrice, 0).toFixed(2)), [quote.sections.sectionC.lineItems]);

  const selectedLeaseTerm = quote.metadata.leaseTermMonths ?? 12;
  const hasActiveDataAgreement = quote.metadata.hasActiveDataAgreement ?? false;
  const leaseMarginPercent = quote.metadata.leaseMarginPercent ?? 35;

  const leaseMarginAmount = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    return Number((equipmentTotal * (leaseMarginPercent / 100)).toFixed(2));
  }, [equipmentTotal, leaseMarginPercent, quote.metadata.quoteType]);

  const leaseEquipmentBase = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    return Number((equipmentTotal + leaseMarginAmount).toFixed(2));
  }, [equipmentTotal, leaseMarginAmount, quote.metadata.quoteType]);

  const leaseEquipmentMonthly = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    return Number((leaseEquipmentBase / selectedLeaseTerm).toFixed(2));
  }, [leaseEquipmentBase, quote.metadata.quoteType, selectedLeaseTerm]);

  const leaseMonthly = useMemo(() => {
    if (quote.metadata.quoteType !== "lease") return 0;
    if (!hasActiveDataAgreement) return 0;
    return Number((recurringMonthlyTotal + leaseEquipmentMonthly).toFixed(2));
  }, [hasActiveDataAgreement, leaseEquipmentMonthly, quote.metadata.quoteType, recurringMonthlyTotal]);

  const commercialMetrics = useMemo(() => buildCommercialMetrics(quote), [quote]);
  const majorProjectMetrics = useMemo(() => buildMajorProjectMetrics(quote), [quote]);

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

  const contentPresence = useMemo(() => getQuoteContentPresence(quote), [quote]);

  const filteredSectionACatalog = useMemo(() => {
    return sectionACatalog.filter((item) => {
      if (quote.sections.sectionA.mode === "pool") {
        return item.category !== "Per Kit Data";
      }
      return item.category !== "Pool Plan" && item.category !== "Pool Overage";
    });
  }, [quote.sections.sectionA.mode]);

  const suggestedAccessories = useMemo(() => {
    const selectedTerminalTypes = Array.from(new Set(quote.sections.sectionB.lineItems.map((row) => row.terminalType).filter(Boolean))) as string[];
    const existingLabels = new Set(quote.sections.sectionB.lineItems.map((row) => row.itemName));

    return selectedTerminalTypes
      .flatMap((terminalType) => (accessoryMap[terminalType] ?? []).map((catalogId) => ({ terminalType, catalogId })))
      .filter(({ catalogId }, index, list) => list.findIndex((entry) => entry.catalogId === catalogId) === index)
      .map(({ terminalType, catalogId }) => ({ terminalType, item: equipmentCatalog.find((entry) => entry.id === catalogId) }))
      .filter((entry): entry is { terminalType: string; item: (typeof equipmentCatalog)[number] } => Boolean(entry.item))
      .filter(({ item }) => !existingLabels.has(item.label));
  }, [quote.sections.sectionB.lineItems]);

  const updateQuote = (updater: (current: QuoteRecord) => QuoteRecord) => setQuote((current) => ensureMajorProjectState(updater(cloneQuote(current))));

  const updateMajorProjectQuote = (updater: (draft: QuoteRecord) => QuoteRecord) => {
    updateQuote((current) => applyMajorProjectToQuote(updater(ensureMajorProjectState(current))));
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

  const updateMajorCommercialField = (field: keyof QuoteRecord["majorProject"]["commercial"], value: string | number | boolean) => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject) return draft;
      (draft.majorProject.commercial[field] as string | number | boolean) = value;
      return draft;
    });
  };

  const updateActiveMajorOption = (field: keyof NonNullable<QuoteRecord["majorProject"]>["options"][number], value: string | number) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      (option[field] as string | number | undefined) = value;
      return draft;
    });
  };

  const addMajorProjectOption = () => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject) return draft;
      const nextIndex = draft.majorProject.options.length + 1;
      const cloneFrom = draft.majorProject.options.find((entry) => entry.id === draft.majorProject?.activeOptionId) ?? draft.majorProject.options[0];
      const nextOption = {
        ...(cloneFrom ?? {
          id: `major-option-${Date.now()}`,
          label: `Option ${nextIndex}`,
          description: "",
          siteCount: draft.majorProject.commercial.siteCount,
          monthlyRatePerSite: draft.majorProject.commercial.monthlyRatePerSite,
          hardwarePerSite: draft.majorProject.commercial.oneTimeHardwarePerSite,
          installPerSite: draft.majorProject.commercial.oneTimeInstallPerSite,
          otherOneTimePerSite: draft.majorProject.commercial.oneTimeOtherPerSite,
          vendorRecurringPerSite: draft.majorProject.commercial.recurringVendorPerSite,
          supportRecurringPerSite: draft.majorProject.commercial.recurringSupportPerSite,
          otherRecurringPerSite: draft.majorProject.commercial.recurringOtherPerSite,
        }),
        id: `major-option-${Date.now()}`,
        label: `Option ${nextIndex}`,
      };
      draft.majorProject.options.push(nextOption);
      draft.majorProject.activeOptionId = nextOption.id;
      return draft;
    });
  };

  const removeActiveMajorOption = () => {
    updateMajorProjectQuote((draft) => {
      if (!draft.majorProject || draft.majorProject.options.length <= 1) return draft;
      draft.majorProject.options = draft.majorProject.options.filter((entry) => entry.id !== draft.majorProject?.activeOptionId);
      draft.majorProject.activeOptionId = draft.majorProject.options[0]?.id ?? draft.majorProject.activeOptionId;
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
    const row = createSectionARowFromCatalog(catalogId, quote.sections.sectionA.mode);
    if (!row) return;

    updateQuote((draft) => {
      const target = draft.sections.sectionA.mode === "pool" ? draft.sections.sectionA.poolRows : draft.sections.sectionA.perKitRows;
      target.push(computeSectionARow(row));
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
    const row = createEquipmentRowFromCatalog(catalogId);
    if (!row) return;

    updateQuote((draft) => {
      draft.sections.sectionB.lineItems.push(computeEquipmentRow(row));
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

  const addCustomSectionField = (visibility: QuoteCustomField["visibility"] = "customer") => {
    const nextField = {
      id: `field_${Date.now()}`,
      label: visibility === "customer" ? `Customer detail ${customSectionFields.length + 1}` : `Internal note ${customSectionFields.length + 1}`,
      value: "",
      visibility,
    };
    setCustomSectionFields((current) => [...current, nextField]);
    updateQuote((draft) => {
      draft.customFields = [...(draft.customFields ?? []), nextField];
      return draft;
    });
  };

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
    if (typeof window === "undefined") return null;

    const preparedQuote = isMajorProject ? applyMajorProjectToQuote(quote) : quote;
    const nextQuote = {
      ...preparedQuote,
      metadata: {
        ...preparedQuote.metadata,
        lastTouchedAt: new Date().toISOString(),
      },
      internal: {
        ...preparedQuote.internal,
        savedProposalId: activeProposal?.id ?? preparedQuote.internal.savedProposalId ?? preparedQuote.internal.quoteId,
      },
    };

    window.sessionStorage.setItem(PROPOSAL_STORAGE_KEY, serializeQuoteRecord(nextQuote));

    const currentStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY)) ?? getDefaultProposalStore(
      createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }),
    );

    const proposalId = activeProposal?.id ?? nextQuote.internal.savedProposalId ?? nextQuote.internal.quoteId;
    const owner = currentStore.users.find((user) => user.id === (nextQuote.metadata.ownerUserId ?? activeProposal?.owner.id)) ?? currentStore.currentUser;
    const now = new Date().toISOString();
    const updatedProposal = createProposalFromQuote({ quote: nextQuote, owner, currentUser: currentStore.currentUser });
    updatedProposal.id = proposalId;
    updatedProposal.createdAt = activeProposal?.createdAt ?? now;
    updatedProposal.updatedAt = now;
    updatedProposal.status = nextQuote.metadata.status;
    updatedProposal.stageLabel = statusToStageLabel(nextQuote.metadata.status);
    updatedProposal.owner = owner;
    updatedProposal.createdBy = activeProposal?.createdBy ?? currentStore.currentUser;
    updatedProposal.activity = [
      ...(activeProposal?.activity ?? []),
      {
        id: `activity_updated_${Date.now()}`,
        type: "updated",
        message: "Proposal saved from builder",
        at: now,
        by: { id: currentStore.currentUser.id, name: currentStore.currentUser.name },
      },
    ];
    updatedProposal.quote.internal.savedProposalId = proposalId;
    updatedProposal.quote.internal.workspaceOwnerId = owner.id;
    updatedProposal.quote.internal.workspaceOwnerName = owner.name;
    updatedProposal.quote.metadata.ownerUserId = owner.id;
    updatedProposal.quote.metadata.ownerName = owner.name;

    const nextStore = upsertProposal(currentStore, updatedProposal);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, proposalId);
    setActiveProposal(updatedProposal);
    setQuote(nextQuote);

    return { proposal: updatedProposal, store: nextStore };
  };

  const copyProposalFromBuilder = () => {
    const persisted = persistProposalState();
    if (!persisted || typeof window === "undefined") return;

    const copiedProposal = createProposalCopy({
      proposal: persisted.proposal,
      owner: persisted.proposal.owner,
      currentUser: persisted.store.currentUser,
    });
    const nextStore = upsertProposal(persisted.store, copiedProposal);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, copiedProposal.id);
    window.sessionStorage.setItem(PROPOSAL_STORAGE_KEY, serializeQuoteRecord(copiedProposal.quote));
    setActiveProposal(copiedProposal);
    setQuote(copiedProposal.quote);
  };

  return isHydrated ? (
    <main className="min-h-screen px-4 py-6 text-[#232a31] md:px-6 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <section className="rounded-[28px] border border-white/60 bg-[var(--workspace-panel)] p-6 shadow-[0_16px_40px_rgba(75,88,106,0.12)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex max-w-[820px] items-start gap-4">
              <ProductLogo width={156} height={44} className="workspace-brand-logo product-logo workspace-logo-inline shrink-0" priority />
              <div>
                <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.03em] text-[#16202b]">Proposal Editor</h1>
                <p className="mt-2 max-w-[680px] text-[15px] leading-[1.55] text-[#5a6572]">
                  This is the builder/editor. Make content changes here, then move to Preview Proposal when you want the customer-facing document. Session-aware ownership is now part of the editing flow so the product can grow into real collaboration.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="builder-stat-card"><div className="builder-stat-label">Recurring monthly</div><div className="builder-stat-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div><div className="builder-stat-note">Updated from Section A</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">One-time equipment</div><div className="builder-stat-value">{formatCurrency(equipmentTotal, currencyCode)}</div><div className="builder-stat-note">Updated from Section B</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">Optional services</div><div className="builder-stat-value">{formatCurrency(sectionCTotal, currencyCode)}</div><div className="builder-stat-note">Inspection and install totals</div></div>
              <div className="builder-stat-card"><div className="builder-stat-label">Editor owner</div><div className="builder-stat-value">{user?.initials ?? "RQ"}</div><div className="builder-stat-note">{user ? `${user.name} • ${user.title}` : "Signed-in user context"}</div></div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="pill-button">
              My Proposals
            </Link>
            <Link href="/proposal" className="pill-button pill-button-active" onClick={persistProposalState}>
              Preview Proposal
            </Link>
            <button type="button" className="pill-button" onClick={persistProposalState}>Save Draft</button>
            <button type="button" className="pill-button" onClick={copyProposalFromBuilder}>Copy Proposal</button>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="space-y-6">
            <section className="builder-panel">
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Quote setup</div><h2 className="builder-title">Quote details</h2></div></div>

              <div className="mt-4 rounded-[18px] border border-[#d8e0e8] bg-[#f7fafc] p-4 text-[14px] leading-[1.6] text-[#435160]">
                RapidQuote tracks proposal status only: <strong>Draft</strong>, <strong>In Review</strong>, and <strong>Sent</strong>. If the opportunity moves beyond proposal work, manage it in <strong>Salesforce</strong> instead of closing it inside RapidQuote.
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="builder-field"><span>Proposal #</span><input value={quote.metadata.proposalNumber} onChange={(e) => updateQuote((draft) => { draft.metadata.proposalNumber = e.target.value; draft.documentation.proposalNumberLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Proposal date</span><input value={quote.metadata.proposalDate} onChange={(e) => updateQuote((draft) => { draft.metadata.proposalDate = e.target.value; draft.documentation.proposalDateLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Proposal title</span><input value={quote.metadata.documentTitle} onChange={(e) => updateQuote((draft) => { draft.metadata.documentTitle = e.target.value; draft.documentation.proposalTitle = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Status</span><select value={quote.metadata.status} onChange={(e) => updateQuote((draft) => { draft.metadata.status = e.target.value as QuoteRecord["metadata"]["status"]; draft.internal.quoteStatus = e.target.value as QuoteRecord["metadata"]["status"]; return draft; })}>{[{ value: "draft", label: "Draft" }, { value: "in_review", label: "In Review" }, { value: "sent", label: "Sent" }].map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="builder-field"><span>Proposal owner</span><select value={quote.metadata.ownerUserId ?? activeProposal?.owner.id ?? mockUsers[0].id} onChange={(e) => updateQuote((draft) => { const owner = mockUsers.find((user) => user.id === e.target.value) ?? mockUsers[0]; draft.metadata.ownerUserId = owner.id; draft.metadata.ownerName = owner.name; draft.internal.workspaceOwnerId = owner.id; draft.internal.workspaceOwnerName = owner.name; draft.internal.crmOwnerLabel = owner.name; return draft; })}>{mockUsers.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.role}</option>)}</select></label>
                <label className="builder-field"><span>Owner display name</span><input value={quote.metadata.ownerName ?? activeProposal?.owner.name ?? ""} onChange={(e) => updateQuote((draft) => { draft.metadata.ownerName = e.target.value; draft.internal.workspaceOwnerName = e.target.value; draft.internal.crmOwnerLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Account ID</span><input value={quote.metadata.accountId ?? ""} onChange={(e) => updateQuote((draft) => { draft.metadata.accountId = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Account name</span><input value={quote.metadata.accountName ?? quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.metadata.accountName = e.target.value; return draft; })} /></label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                <label className="builder-field"><span>Proposal subtitle</span><input value={quote.metadata.documentSubtitle} onChange={(e) => updateQuote((draft) => { draft.metadata.documentSubtitle = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Customer short name</span><input value={quote.metadata.customerShortName} onChange={(e) => updateQuote((draft) => { draft.metadata.customerShortName = e.target.value; draft.customer.logoText = e.target.value; return draft; })} /></label>
              </div>

              <div className="mt-5 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                <div className="builder-eyebrow">Contacts</div>
                <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Proposal and address details</h3>
                <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Update these details once and they carry through to the proposal cover and contact pages.</p>

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
                    <div className="flex items-start gap-3">
                      <Image src="/inet-logo.png" alt="iNet logo" width={120} height={34} className="workspace-logo-inline h-auto w-auto object-contain" />
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">iNet</div>
                        <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Sales contact and address</div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="builder-field compact"><span>Prepared by</span><input value={quote.inet.contactName} onChange={(e) => updateQuote((draft) => { draft.inet.contactName = e.target.value; return draft; })} /></label>
                      <label className="builder-field compact"><span>Sales team name</span><input value={quote.inet.name} onChange={(e) => updateQuote((draft) => { draft.inet.name = e.target.value; return draft; })} /></label>
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
                      Ship to same as bill to
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

              <div className="mt-5 rounded-[22px] border border-[#d9e2ea] bg-[#f8fbfd] p-4 md:p-5">
                <div className="builder-eyebrow">Workflow mode</div>
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Choose the quote path first</h3>
                    <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                      Quick Quote keeps the current lightweight builder for standard deals. Major Project turns the commercial model into the primary input and pushes customer proposal pages downstream from that structure.
                    </p>
                  </div>
                  <div className={`rounded-[16px] border px-4 py-3 text-[13px] ${isMajorProject ? "border-[#ead9db] bg-[#fff7f7] text-[#7a042e]" : "border-[#dde3e8] bg-white text-[#5f6c78]"}`}>
                    {isMajorProject ? "Major Project is driving the downstream proposal sections." : "Quick Quote is driving the proposal sections directly."}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ToggleCard
                    label="Quick Quote"
                    description="Best for standard deals where the rep edits service, hardware, and field-service rows directly."
                    active={!isMajorProject}
                    onClick={() => updateQuote((draft) => { draft.metadata.workflowMode = "quick_quote"; return draft; })}
                  />
                  <ToggleCard
                    label="Major Project"
                    description="Best for multi-site or structured commercial work. Build the deal from sites, per-site rates, one-time costs, terms, and options."
                    active={isMajorProject}
                    onClick={() => updateMajorProjectQuote((draft) => { draft.metadata.workflowMode = "major_project"; if (draft.majorProject) draft.majorProject.enabled = true; return draft; })}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {([
                  { key: "purchase", label: "Purchase quote", description: "Show one-time hardware separately from recurring service pricing." },
                  { key: "lease", label: "Lease quote", description: "Blend hardware into a term-based monthly view without losing line items." },
                ] as { key: QuoteType; label: string; description: string }[]).map((option) => (
                  <ToggleCard
                    key={option.key}
                    label={option.label}
                    description={option.description}
                    active={quote.metadata.quoteType === option.key}
                    onClick={() => updateQuote((draft) => {
                      draft.metadata.quoteType = option.key;
                      if (option.key === "lease") {
                        draft.metadata.leaseTermMonths = draft.metadata.leaseTermMonths ?? 12;
                        draft.metadata.hasActiveDataAgreement = draft.metadata.hasActiveDataAgreement ?? false;
                      }
                      return draft;
                    })}
                  />
                ))}
              </div>

              {quote.metadata.quoteType === "lease" && (
                <div className="mt-5 rounded-[22px] border border-[#ead9db] bg-[#fff7f7] p-4 md:p-5">
                  <div className="builder-eyebrow">Lease calculator</div>
                  <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Lease pricing builder</h3>
                  <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                    Lease pricing is gated by an active data agreement. Hardware margin is editable, defaults to 35%, and is spread across the selected lease term.
                  </p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
                    <div className="space-y-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                      <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-white px-4 py-3 text-[14px] font-medium text-[#24303b]">
                        <input
                          type="checkbox"
                          checked={hasActiveDataAgreement}
                          onChange={(e) => updateQuote((draft) => {
                            draft.metadata.hasActiveDataAgreement = e.target.checked;
                            return draft;
                          })}
                        />
                        Active data agreement is in place
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="builder-field compact">
                          <span>Lease term</span>
                          <select
                            value={selectedLeaseTerm}
                            onChange={(e) => updateQuote((draft) => {
                              draft.metadata.leaseTermMonths = Number(e.target.value) as 12 | 24 | 36;
                              return draft;
                            })}
                          >
                            <option value={12}>12 months</option>
                            <option value={24}>24 months</option>
                            <option value={36}>36 months</option>
                          </select>
                        </label>

                        <label className="builder-field compact">
                          <span>Lease margin %</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={leaseMarginPercent}
                            onChange={(e) => updateQuote((draft) => {
                              draft.metadata.leaseMarginPercent = Math.max(parseNumber(e.target.value), 0);
                              return draft;
                            })}
                          />
                        </label>
                      </div>

                      <div className={`rounded-[18px] border px-4 py-3 text-[13px] leading-[1.5] ${hasActiveDataAgreement ? "border-[#d9e7dd] bg-[#f5fbf6] text-[#365444]" : "border-[#f0d1d1] bg-[#fff1f1] text-[#7d4b4b]"}`}>
                        {hasActiveDataAgreement
                          ? `Lease pricing is active. The monthly lease total below now includes the ${leaseMarginPercent}% hardware margin spread across the selected term.`
                          : "Lease pricing is locked until an active data agreement is confirmed. Turn this on to enable the lease monthly number."}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Purchase hardware total</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Lease margin ({leaseMarginPercent}%)</span><strong>{formatCurrency(leaseMarginAmount, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Lease hardware base</span><strong>{formatCurrency(leaseEquipmentBase, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Selected term</span><strong>{selectedLeaseTerm} months</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Hardware per month</span><strong>{formatCurrency(leaseEquipmentMonthly, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Recurring monthly service</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>
                      <div className="rounded-[16px] border border-[#e8edf2] bg-[#fafcfd] px-4 py-3 text-[13px] text-[#5d6874]">
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Calculation breakdown</div>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between gap-3"><span>1. Equipment total</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>2. + Margin ({leaseMarginPercent}%)</span><strong>+ {formatCurrency(leaseMarginAmount, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>3. Lease hardware base</span><strong>{formatCurrency(leaseEquipmentBase, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>4. ÷ Term ({selectedLeaseTerm})</span><strong>{formatCurrency(leaseEquipmentMonthly, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>5. + Recurring monthly service</span><strong>+ {formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>
                        </div>
                      </div>
                      <div className="border-t border-[#e8edf2] pt-3">
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Lease monthly</div>
                        <div className={`mt-1 text-[28px] font-semibold tracking-[-0.03em] ${hasActiveDataAgreement ? "text-[#b00000]" : "text-[#7f8a96]"}`}>
                          {hasActiveDataAgreement ? formatCurrency(leaseMonthly, currencyCode) : "Data agreement required"}
                        </div>
                        <div className="mt-1 text-[13px] text-[#60707f]">
                          {hasActiveDataAgreement
                            ? `Formula: ${formatCurrency(equipmentTotal, currencyCode)} + ${leaseMarginPercent}% margin = ${formatCurrency(leaseEquipmentBase, currencyCode)}; then ${formatCurrency(leaseEquipmentBase, currencyCode)} ÷ ${selectedLeaseTerm} = ${formatCurrency(leaseEquipmentMonthly, currencyCode)}; then + ${formatCurrency(recurringMonthlyTotal, currencyCode)} recurring monthly service.`
                            : "This lease calculator stays disabled until the active data agreement box is checked."}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 rounded-[22px] border border-[#d9e2ea] bg-[#f8fbfd] p-4 md:p-5">
                <div className="builder-eyebrow">Internal commercial</div>
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Margin foundation</h3>
                    <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                      Internal-only deal economics mapped from the workbook structure: revenue stays tied to builder sections, cost stays separate, and margins roll up automatically.
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-[#dde3e8] bg-white px-4 py-3 text-[13px] text-[#5f6c78]">
                    Hidden from customer proposal, preview, and PDF output.
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
                  <div className="space-y-4 rounded-[18px] border border-[#dde3e8] bg-white p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="builder-field compact">
                        <span>Option label</span>
                        <input value={quote.commercial.meta.optionLabel} onChange={(e) => updateQuote((draft) => { draft.commercial.meta.optionLabel = e.target.value; return draft; })} />
                      </label>
                      <label className="builder-field compact">
                        <span>Comparison group</span>
                        <input value={quote.commercial.meta.comparisonGroup ?? ""} onChange={(e) => updateQuote((draft) => { draft.commercial.meta.comparisonGroup = e.target.value; return draft; })} />
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4">
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">One-time cost inputs</div>
                        <div className="mt-3 grid gap-3">
                          <label className="builder-field compact"><span>Equipment cost</span><input type="number" step="0.01" value={quote.commercial.costs.oneTimeEquipmentCost} onChange={(e) => updateQuote((draft) => { draft.commercial.costs.oneTimeEquipmentCost = Math.max(parseNumber(e.target.value), 0); return draft; })} /></label>
                          <label className="builder-field compact"><span>Labor cost</span><input type="number" step="0.01" value={quote.commercial.costs.oneTimeLaborCost} onChange={(e) => updateQuote((draft) => { draft.commercial.costs.oneTimeLaborCost = Math.max(parseNumber(e.target.value), 0); return draft; })} /></label>
                          <label className="builder-field compact"><span>Other one-time cost</span><input type="number" step="0.01" value={quote.commercial.costs.oneTimeOtherCost} onChange={(e) => updateQuote((draft) => { draft.commercial.costs.oneTimeOtherCost = Math.max(parseNumber(e.target.value), 0); return draft; })} /></label>
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4">
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Recurring cost inputs</div>
                        <div className="mt-3 grid gap-3">
                          <label className="builder-field compact"><span>Vendor cost / month</span><input type="number" step="0.01" value={quote.commercial.costs.recurringVendorCost} onChange={(e) => updateQuote((draft) => { draft.commercial.costs.recurringVendorCost = Math.max(parseNumber(e.target.value), 0); return draft; })} /></label>
                          <label className="builder-field compact"><span>Support cost / month</span><input type="number" step="0.01" value={quote.commercial.costs.recurringSupportCost} onChange={(e) => updateQuote((draft) => { draft.commercial.costs.recurringSupportCost = Math.max(parseNumber(e.target.value), 0); return draft; })} /></label>
                          <label className="builder-field compact"><span>Other recurring cost / month</span><input type="number" step="0.01" value={quote.commercial.costs.recurringOtherCost} onChange={(e) => updateQuote((draft) => { draft.commercial.costs.recurringOtherCost = Math.max(parseNumber(e.target.value), 0); return draft; })} /></label>
                        </div>
                      </div>
                    </div>

                    <label className="builder-field">
                      <span>Internal notes</span>
                      <textarea rows={3} value={quote.commercial.meta.notes ?? ""} onChange={(e) => updateQuote((draft) => { draft.commercial.meta.notes = e.target.value; return draft; })} />
                    </label>
                  </div>

                  <div className="space-y-4 rounded-[18px] border border-[#dde3e8] bg-white p-4">
                    <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Commercial summary</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CommercialMetricCard label="Recurring revenue" value={formatCurrency(commercialMetrics.recurringRevenue, currencyCode)} note="Pulled from Section A customer pricing" />
                      <CommercialMetricCard label="Recurring cost" value={formatCurrency(commercialMetrics.recurringCost, currencyCode)} note="Internal monthly cost inputs only" />
                      <CommercialMetricCard label="One-time revenue" value={formatCurrency(commercialMetrics.oneTimeRevenue, currencyCode)} note="Section B + Section C customer pricing" />
                      <CommercialMetricCard label="One-time cost" value={formatCurrency(commercialMetrics.oneTimeCost, currencyCode)} note="Internal equipment, labor, and other costs" />
                      <CommercialMetricCard label="Gross profit" value={formatCurrency(commercialMetrics.totalGrossProfit, currencyCode)} note="Combined recurring + one-time gross profit" accent />
                      <CommercialMetricCard label="Gross margin" value={formatPercent(commercialMetrics.totalGrossMarginPercent)} note="Gross profit ÷ total revenue" accent />
                    </div>

                    <div className="rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Rollup detail</div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3"><span>Recurring GP</span><strong>{formatCurrency(commercialMetrics.recurringGrossProfit, currencyCode)} • {formatPercent(commercialMetrics.recurringGrossMarginPercent)}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>One-time GP</span><strong>{formatCurrency(commercialMetrics.oneTimeGrossProfit, currencyCode)} • {formatPercent(commercialMetrics.oneTimeGrossMarginPercent)}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>Total revenue</span><strong>{formatCurrency(commercialMetrics.totalRevenue, currencyCode)}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>Total cost</span><strong>{formatCurrency(commercialMetrics.totalCost, currencyCode)}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isMajorProject && majorProjectState && (
                <div className="mt-5 rounded-[22px] border border-[#ead9db] bg-[#fff9f9] p-4 md:p-5">
                  <div className="builder-eyebrow">Major Project mode</div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Commercial model first</h3>
                      <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                        This lane is modeled after the workbook structure without pretending to be Excel. Set project assumptions, shape the active option, and RapidQuote will generate the downstream proposal sections and internal margin view.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="pill-button" onClick={addMajorProjectOption}>Add option</button>
                      <button type="button" className="pill-button" onClick={removeActiveMajorOption} disabled={(majorProjectState.options?.length ?? 0) <= 1}>Remove option</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
                    <div className="space-y-4 rounded-[18px] border border-[#e7d8db] bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="builder-field compact"><span>Project name</span><input value={majorProjectState.summary.projectName} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.projectName = e.target.value; return draft; })} /></label>
                        <label className="builder-field compact"><span>Version label</span><input value={majorProjectState.summary.versionLabel} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.versionLabel = e.target.value; return draft; })} /></label>
                        <label className="builder-field compact"><span>Payment terms</span><input value={majorProjectState.summary.paymentTerms} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.paymentTerms = e.target.value; return draft; })} /></label>
                        <label className="builder-field compact"><span>Billing start</span><input value={majorProjectState.summary.billingStart} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.billingStart = e.target.value; return draft; })} /></label>
                      </div>
                      <label className="builder-field"><span>Project description</span><textarea rows={3} value={majorProjectState.summary.projectDescription} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.projectDescription = e.target.value; return draft; })} /></label>
                      <label className="builder-field"><span>Commercial assumptions</span><textarea rows={3} value={majorProjectState.summary.assumptions} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.summary.assumptions = e.target.value; return draft; })} /></label>

                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="builder-field compact"><span>Term (months)</span><input type="number" value={majorProjectState.commercial.termMonths} onChange={(e) => updateMajorCommercialField("termMonths", parseNumber(e.target.value))} /></label>
                        <label className="builder-field compact"><span>Service mix</span><select value={majorProjectState.commercial.serviceMix} onChange={(e) => updateMajorCommercialField("serviceMix", e.target.value)}><option value="managed-network">Managed network</option><option value="starlink-pool">Starlink pool</option><option value="starlink-per-site">Starlink per site</option><option value="hybrid">Hybrid</option></select></label>
                        <label className="builder-field compact"><span>Optional services allowance</span><input type="number" step="0.01" value={majorProjectState.commercial.optionalServicesAmount} onChange={(e) => updateMajorCommercialField("optionalServicesAmount", Math.max(parseNumber(e.target.value), 0))} /></label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="builder-field compact"><span>Recurring label</span><input value={majorProjectState.commercial.recurringLabel} onChange={(e) => updateMajorCommercialField("recurringLabel", e.target.value)} /></label>
                        <label className="builder-field compact"><span>Hardware label</span><input value={majorProjectState.commercial.equipmentLabel} onChange={(e) => updateMajorCommercialField("equipmentLabel", e.target.value)} /></label>
                        <label className="builder-field compact"><span>Install label</span><input value={majorProjectState.commercial.installationLabel} onChange={(e) => updateMajorCommercialField("installationLabel", e.target.value)} /></label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-[#fbfcfe] px-4 py-3 text-[14px] font-medium text-[#24303b]"><input type="checkbox" checked={majorProjectState.commercial.includeHardware} onChange={(e) => updateMajorCommercialField("includeHardware", e.target.checked)} /> Include hardware</label>
                        <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-[#fbfcfe] px-4 py-3 text-[14px] font-medium text-[#24303b]"><input type="checkbox" checked={majorProjectState.commercial.includeInstallation} onChange={(e) => updateMajorCommercialField("includeInstallation", e.target.checked)} /> Include installation</label>
                        <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-[#fbfcfe] px-4 py-3 text-[14px] font-medium text-[#24303b]"><input type="checkbox" checked={majorProjectState.commercial.includeOptionalServices} onChange={(e) => updateMajorCommercialField("includeOptionalServices", e.target.checked)} /> Include optional services</label>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-[18px] border border-[#e7d8db] bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="builder-field compact"><span>Active option</span><select value={majorProjectState.activeOptionId} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.activeOptionId = e.target.value; return draft; })}>{majorProjectState.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                        <label className="builder-field compact"><span>Option label</span><input value={activeMajorOption?.label ?? ""} onChange={(e) => updateActiveMajorOption("label", e.target.value)} /></label>
                        <label className="builder-field compact md:col-span-2"><span>Option description</span><input value={activeMajorOption?.description ?? ""} onChange={(e) => updateActiveMajorOption("description", e.target.value)} /></label>
                      </div>
                      <div className="major-project-grid">
                        <label className="builder-field compact"><span>Sites</span><input type="number" value={activeMajorOption?.siteCount ?? 0} onChange={(e) => updateActiveMajorOption("siteCount", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>MRR / site</span><input type="number" step="0.01" value={activeMajorOption?.monthlyRatePerSite ?? 0} onChange={(e) => updateActiveMajorOption("monthlyRatePerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>Hardware / site</span><input type="number" step="0.01" value={activeMajorOption?.hardwarePerSite ?? 0} onChange={(e) => updateActiveMajorOption("hardwarePerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>Install / site</span><input type="number" step="0.01" value={activeMajorOption?.installPerSite ?? 0} onChange={(e) => updateActiveMajorOption("installPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>Other one-time / site</span><input type="number" step="0.01" value={activeMajorOption?.otherOneTimePerSite ?? 0} onChange={(e) => updateActiveMajorOption("otherOneTimePerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>Vendor recurring / site</span><input type="number" step="0.01" value={activeMajorOption?.vendorRecurringPerSite ?? 0} onChange={(e) => updateActiveMajorOption("vendorRecurringPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>Support recurring / site</span><input type="number" step="0.01" value={activeMajorOption?.supportRecurringPerSite ?? 0} onChange={(e) => updateActiveMajorOption("supportRecurringPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>Other recurring / site</span><input type="number" step="0.01" value={activeMajorOption?.otherRecurringPerSite ?? 0} onChange={(e) => updateActiveMajorOption("otherRecurringPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                      </div>

                      <div className="rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Major Project rollup</div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between gap-3"><span>Sites in active option</span><strong>{majorProjectMetrics.siteCount}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>Recurring revenue</span><strong>{formatCurrency(majorProjectMetrics.recurringRevenue, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>One-time revenue</span><strong>{formatCurrency(majorProjectMetrics.oneTimeRevenue, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>Total revenue</span><strong>{formatCurrency(majorProjectMetrics.totalRevenue, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>Total cost</span><strong>{formatCurrency(majorProjectMetrics.totalCost, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3 text-[#b00000]"><span>Gross margin</span><strong>{formatPercent(majorProjectMetrics.totalGrossMarginPercent)}</strong></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="builder-field"><span>Section A provider option</span><select value={quote.metadata.customerProvider} onChange={(e) => updateQuote((draft) => { draft.metadata.customerProvider = e.target.value as QuoteRecord["metadata"]["customerProvider"]; return draft; })}><option value="Starlink">Starlink</option><option value="UniSIM">UniSIM</option><option value="T-Mobile">T-Mobile</option></select></label>
                <div className="rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                  <div className="builder-eyebrow">Customer branding</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Customer logo upload</div>
                  <button type="button" className="customer-logo-dropzone mt-3 w-full text-left" onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onCustomerLogoSelected(e.dataTransfer.files?.[0]); }}>
                    <div className="text-[14px] font-semibold text-[#17212c]">Drag and drop a logo here</div>
                    <div className="mt-1 text-[13px] text-[#63707d]">Or click to browse. PNG, JPG, or SVG exported as image works best.</div>
                    {quote.customer.logoDataUrl && <img src={quote.customer.logoDataUrl} alt="Customer logo preview" className="customer-logo-preview mt-4" />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onCustomerLogoSelected(e.target.files?.[0])} />
                </div>
              </div>
            </section>

            <section className="builder-panel">
              <div className="builder-panel-header">
                <div><div className="builder-eyebrow">Sections</div><h2 className="builder-title">Proposal Sections</h2></div>
                <div className="flex flex-wrap gap-2">
                  <SectionToggle label="Executive Summary" enabled={quote.executiveSummary.enabled} onChange={(next) => updateQuote((draft) => { draft.executiveSummary.enabled = next; return draft; })} />
                  <SectionToggle label="Monthly Service" enabled={quote.sections.sectionA.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionA.enabled = next; return draft; })} />
                  <SectionToggle label="Hardware" enabled={quote.sections.sectionB.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionB.enabled = next; return draft; })} />
                  <SectionToggle label="Field Services" enabled={quote.sections.sectionC.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionC.enabled = next; return draft; })} />
                </div>
              </div>
              <p className="text-[14px] leading-[1.5] text-[#5c6772]">Keep section names clear so the proposal is easy to scan and easy to explain.</p>
              <div className="mt-3 rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-3 text-[13px] leading-[1.5] text-[#5e6974]">
                Customer details appear in the proposal document. Internal notes stay in the builder/workspace only.
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="builder-field"><span>Section A label</span><input value={quote.sections.sectionA.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.builderLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Section B label</span><input value={quote.sections.sectionB.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionB.builderLabel = e.target.value; return draft; })} /></label>
                <label className="builder-field"><span>Section C label</span><input value={quote.sections.sectionC.builderLabel} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.builderLabel = e.target.value; return draft; })} /></label>
              </div>
              <div className="mt-4 space-y-3">
                {customSectionFields.map((field, index) => (
                  <div key={field.id} className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[13px] font-semibold text-[#16202b]">
                        {field.visibility === "customer" ? `Customer detail ${index + 1}` : `Internal note ${index + 1}`}
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[12px] font-semibold ${field.visibility === "customer" ? "bg-[#ecf7ee] text-[#25643b]" : "bg-[#eef2f7] text-[#51606f]"}`}>
                        {field.visibility === "customer" ? "Appears in proposal" : "Builder only"}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_.8fr_auto]">
                      <label className="builder-field compact"><span>{field.visibility === "customer" ? "Customer-facing label" : "Internal label"}</span><input value={field.label} onChange={(e) => {
                        const nextValue = e.target.value;
                        setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, label: nextValue } : item));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).map((item) => item.id === field.id ? { ...item, label: nextValue } : item);
                          return draft;
                        });
                      }} /></label>
                      <label className="builder-field compact"><span>{field.visibility === "customer" ? "Customer-facing value" : "Internal note"}</span><input value={field.value} onChange={(e) => {
                        const nextValue = e.target.value;
                        setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, value: nextValue } : item));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).map((item) => item.id === field.id ? { ...item, value: nextValue } : item);
                          return draft;
                        });
                      }} /></label>
                      <label className="builder-field compact"><span>Visibility</span><select value={field.visibility} onChange={(e) => {
                        const nextVisibility = e.target.value as QuoteCustomField["visibility"];
                        setCustomSectionFields((current) => current.map((item) => item.id === field.id ? { ...item, visibility: nextVisibility } : item));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).map((item) => item.id === field.id ? { ...item, visibility: nextVisibility } : item);
                          return draft;
                        });
                      }}><option value="customer">Customer detail</option><option value="internal">Internal only</option></select></label>
                      <button type="button" className="danger-button self-end" onClick={() => {
                        setCustomSectionFields((current) => current.filter((item) => item.id !== field.id));
                        updateQuote((draft) => {
                          draft.customFields = (draft.customFields ?? []).filter((item) => item.id !== field.id);
                          return draft;
                        });
                      }}>Remove</button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="pill-button pill-button-active" onClick={() => addCustomSectionField("customer")}>Add customer detail</button>
                  <button type="button" className="pill-button" onClick={() => addCustomSectionField("internal")}>Add internal note</button>
                </div>
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
              <p className="text-[14px] leading-[1.5] text-[#5c6772]">Create a strong opening summary, then fine-tune it to match the customer conversation.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="builder-field"><span>Summary heading</span><input value={quote.executiveSummary.heading ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.heading = e.target.value; return draft; })} /></label>
                <div className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-3 text-[13px] text-[#5e6974]">Builds a first draft from the customer, provider, pricing, equipment, and service selections above.</div>
              </div>
              <div className="mt-4 grid gap-4">
                <label className="builder-field"><span>Customer context</span><textarea rows={3} value={quote.executiveSummary.customerContext ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.customerContext = e.target.value; syncExecutiveSummaryParagraphs(draft); return draft; })} /></label>
                <label className="builder-field"><span>Summary body</span><textarea rows={6} value={quote.executiveSummary.body ?? ""} onChange={(e) => updateQuote((draft) => { draft.executiveSummary.body = e.target.value; syncExecutiveSummaryParagraphs(draft); return draft; })} /></label>
              </div>
            </section>

            {!isMajorProject && quote.sections.sectionA.enabled && (
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
                  <label className="builder-field"><span>Quick add service row</span><select defaultValue="" onChange={(e) => { if (e.target.value) { addSectionARowFromCatalog(e.target.value); e.target.value = ""; } }}><option value="">Choose an item…</option>{filteredSectionACatalog.map((item) => <option key={item.id} value={item.id}>{item.label} — {formatCurrency(item.defaultUnitPrice, currencyCode)}</option>)}</select></label>
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

                <label className="builder-field mt-4"><span>Section intro</span><textarea value={quote.sections.sectionA.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionA.introText = e.target.value; return draft; })} rows={3} /></label>

                <div className="mt-5 space-y-3">
                  {activeSectionARows.map((row, index) => (
                    <div key={row.id} className="line-editor-card">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Section A row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">{row.rowType === "support" ? "Support and portal access" : "Monthly service line"}</div></div>
                        <RowActions totalRows={activeSectionARows.length} rowNumber={index + 1} onMoveUp={() => moveActiveSectionARow(row.id, -1)} onMoveDown={() => moveActiveSectionARow(row.id, 1)} onMoveTo={(targetPosition) => moveActiveSectionAToPosition(row.id, targetPosition)} onDuplicate={() => duplicateActiveSectionARow(row.id)} onRemove={() => removeActiveSectionARow(row.id)} />
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[2fr_.8fr_.8fr_1fr]">
                        <label className="builder-field compact"><span>Description</span><input value={row.description} onChange={(e) => updateActiveSectionARow(row.id, "description", e.target.value)} /></label>
                        <label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "quantity", e.target.value)} disabled={row.rowType === "support"} /></label>
                        <label className="builder-field compact"><span>Unit label</span><input value={row.unitLabel ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "unitLabel", e.target.value)} disabled={row.rowType === "support"} /></label>
                        <label className="builder-field compact"><span>{row.rowType === "overage" ? "Rate / GB" : "Monthly rate"}</span><input type="number" step="0.01" value={row.monthlyRate ?? row.unitPrice ?? ""} onChange={(e) => updateActiveSectionARow(row.id, "monthlyRate", e.target.value)} disabled={row.rowType === "support"} /></label>
                      </div>
                      {row.rowType === "support" && <label className="builder-field compact mt-3"><span>Support details (one per line)</span><textarea rows={3} value={(row.includedText ?? []).join("\n")} onChange={(e) => updateActiveSectionARow(row.id, "includedText", e.target.value)} /></label>}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.rowType === "support" ? "Included support and portal access" : "Monthly service line"}</span><span>{row.rowType === "support" ? "Included with service" : `Subtotal: ${formatCurrency(row.totalMonthlyRate ?? row.monthlyRate ?? 0, currencyCode)}`}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!isMajorProject && quote.sections.sectionB.enabled && (
              <section className="builder-panel">
                <div className="builder-panel-header">
                  <div><div className="builder-eyebrow">Section B</div><h2 className="builder-title">{quote.sections.sectionB.builderLabel}</h2></div>
                  <div className="rounded-[18px] border border-[#ead9db] bg-[#fff7f7] px-4 py-3 text-[13px] text-[#6d4950]">Pick from recommended hardware, add a custom item, or fine-tune the current list without clutter.</div>
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
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="builder-eyebrow">Recommended items</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Hardware Picker</h3></div><div className="text-[13px] text-[#66717d]">{filteredEquipmentCatalog.length} match(es)</div></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_.8fr]"><label className="builder-field compact"><span>Search Hardware</span><input placeholder="mini, mount, cable..." value={equipmentSearch} onChange={(e) => setEquipmentSearch(e.target.value)} /></label><label className="builder-field compact"><span>Category</span><select value={equipmentCategoryFilter} onChange={(e) => setEquipmentCategoryFilter(e.target.value)}>{equipmentCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">{filteredEquipmentCatalog.map((item) => <div key={item.id} className="rounded-[20px] border border-[#d9e0e7] bg-white p-4 shadow-[0_8px_20px_rgba(31,42,52,0.05)]"><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">{item.category}</div><h4 className="mt-1 text-[16px] font-semibold text-[#16202b]">{item.label}</h4></div></div><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">{item.description ?? "Recommended equipment item."}</p><div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#66717d]">{item.terminalType && <span className="rounded-full bg-[#f6f8fb] px-3 py-1">Type: {item.terminalType}</span>}<span className="rounded-full bg-[#f6f8fb] px-3 py-1">Recommended</span></div><button type="button" className="mt-4 pill-button pill-button-active w-full" onClick={() => addEquipmentRow(item.id)}>Add to Hardware Rows</button></div>)}</div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                      <div className="builder-eyebrow">Custom item</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Manual Hardware Row</h3><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Use this when the exact part is missing or you need to quote a placeholder during a live call.</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="builder-field compact"><span>Item name</span><input value={customEquipmentDraft.itemName} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, itemName: e.target.value }))} /></label><label className="builder-field compact"><span>Category</span><input value={customEquipmentDraft.itemCategory} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, itemCategory: e.target.value }))} /></label><label className="builder-field compact"><span>Terminal type</span><input value={customEquipmentDraft.terminalType} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, terminalType: e.target.value }))} /></label><label className="builder-field compact"><span>Part #</span><input value={customEquipmentDraft.partNumber} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, partNumber: e.target.value }))} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={customEquipmentDraft.quantity} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, quantity: e.target.value }))} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={customEquipmentDraft.unitPrice} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, unitPrice: e.target.value }))} /></label></div>
                      <label className="builder-field compact mt-3"><span>Description / notes</span><textarea rows={3} value={customEquipmentDraft.description} onChange={(e) => setCustomEquipmentDraft((current) => ({ ...current, description: e.target.value }))} /></label>
                      <button type="button" className="mt-4 pill-button pill-button-active w-full" onClick={addCustomEquipmentRow}>Add Custom Hardware Row</button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">{quote.sections.sectionB.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Hardware row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">{row.sourceType === "standard" ? "Recommended line" : "Custom line"}</div></div><RowActions totalRows={quote.sections.sectionB.lineItems.length} rowNumber={index + 1} onMoveUp={() => moveEquipmentRow(row.id, -1)} onMoveDown={() => moveEquipmentRow(row.id, 1)} onMoveTo={(targetPosition) => moveEquipmentRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateEquipmentRow(row.id)} onRemove={() => removeEquipmentRow(row.id)} /></div><div className="grid gap-3 lg:grid-cols-[1.7fr_1fr_.7fr_.8fr]"><label className="builder-field compact"><span>Item</span><input value={row.itemName} onChange={(e) => updateEquipmentRow(row.id, "itemName", e.target.value)} /></label><label className="builder-field compact"><span>Category</span><input value={row.itemCategory ?? ""} onChange={(e) => updateEquipmentRow(row.id, "itemCategory", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateEquipmentRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit Price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateEquipmentRow(row.id, "unitPrice", e.target.value)} /></label></div><div className="mt-3 grid gap-3 lg:grid-cols-3"><label className="builder-field compact"><span>Terminal Type</span><input value={row.terminalType ?? ""} onChange={(e) => updateEquipmentRow(row.id, "terminalType", e.target.value)} /></label><label className="builder-field compact"><span>Part #</span><input value={row.partNumber ?? ""} onChange={(e) => updateEquipmentRow(row.id, "partNumber", e.target.value)} /></label><label className="builder-field compact"><span>Reference</span><input value={row.sourceLabel ?? ""} onChange={(e) => updateEquipmentRow(row.id, "sourceLabel", e.target.value)} /></label></div><label className="builder-field compact mt-3"><span>Description / Notes</span><input value={row.description ?? ""} onChange={(e) => updateEquipmentRow(row.id, "description", e.target.value)} /></label><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.sourceType === "custom" ? "Custom hardware line" : "Recommended hardware line"}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div>)}</div>
              </section>
            )}

            {!isMajorProject && quote.sections.sectionC.enabled && (
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
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Proposal summary</div><h2 className="builder-title">PDF-ready summary</h2></div></div>
              <div className="space-y-5 text-[14px] text-[#32404c]">
                <div className="summary-block"><div className="summary-label">Customer</div><div className="summary-value">{quote.customer.name}</div><div className="summary-subvalue">{quote.customer.contactName} • {quote.metadata.proposalNumber} • {quote.metadata.proposalDate}</div></div>
                <div className="summary-block"><div className="summary-label">Proposal info</div><div className="summary-value">{quote.metadata.documentTitle}</div><div className="summary-subvalue">Prepared by {quote.inet.contactName} • {quote.inet.contactPhone}</div></div>
                <div className="summary-block"><div className="summary-label">Bill To / Ship To</div><div className="summary-value">{quote.billTo.companyName || quote.customer.name}</div><div className="summary-subvalue">{quote.shippingSameAsBillTo ? "Ship To matches Bill To" : `${quote.shipTo.companyName || "Custom Ship To"} configured separately`}</div></div>
                <div className="summary-block"><div className="summary-label">Executive Summary</div><div className="summary-value">{quote.executiveSummary.enabled && contentPresence.hasExecutiveSummaryContent ? (quote.executiveSummary.heading?.trim() || "Executive Summary") : "Hidden"}</div><div className="summary-subvalue">{quote.executiveSummary.enabled && contentPresence.hasExecutiveSummaryContent ? `${compactList([quote.executiveSummary.customerContext, quote.executiveSummary.body]).length} editable text block(s) ready for output` : "Not included in proposal output"}</div></div>
                <div className="summary-block"><div className="summary-label">Workflow</div><div className="summary-value">{isMajorProject ? "Major Project" : "Quick Quote"}</div><div className="summary-subvalue">{isMajorProject ? "Commercial model is driving downstream proposal sections" : "Builder rows are driving proposal sections directly"}</div></div>
                <div className="summary-block"><div className="summary-label">Quote type</div><div className="summary-value">{quote.metadata.quoteType === "purchase" ? "Purchase" : "Lease"}</div><div className="summary-subvalue">{quote.metadata.quoteType === "purchase" ? "Separate one-time and recurring outputs" : hasActiveDataAgreement ? `Estimated monthly blended total over ${selectedLeaseTerm} months` : "Lease pricing blocked until active data agreement is confirmed"}</div></div>
                <div className="summary-block"><div className="summary-label">Current pricing</div><div className="summary-value">Current proposal data</div><div className="summary-subvalue">Recommended defaults plus any edits you made in this proposal</div></div>
                <div className="summary-block"><div className="summary-label">Enabled sections</div><ul className="list-disc pl-5 text-[#56616d]">{quote.executiveSummary.enabled && contentPresence.hasExecutiveSummaryContent && <li>Executive Summary</li>}{quote.sections.sectionA.enabled && contentPresence.hasSectionAContent && <li>Monthly Service</li>}{quote.sections.sectionB.enabled && contentPresence.hasSectionBContent && <li>Hardware</li>}{quote.sections.sectionC.enabled && contentPresence.hasSectionCContent && <li>Field Services</li>}</ul></div>
                {customSectionFields.length > 0 && <div className="summary-block"><div className="summary-label">Extra section fields</div><div className="space-y-1 text-[#56616d]">{customSectionFields.map((field) => <div key={field.id}><strong>{field.label}:</strong> {field.value || "—"} <span className="text-[#8b96a3]">({field.visibility === "customer" ? "proposal" : "internal"})</span></div>)}</div></div>}
                <div className="summary-block"><div className="summary-label">Section A output</div><div className="summary-value">{quote.sections.sectionA.mode === "pool" ? "Pool pricing schedule" : "Per-kit pricing schedule"}</div><div className="summary-subvalue">{isMajorProject ? `Generated from ${activeMajorOption?.label ?? "active major option"}` : `${activeSectionARows.length} row(s) ready for the proposal`}</div></div>
                <div className="summary-block"><div className="summary-label">Section B output</div><div className="summary-value">{contentPresence.hasSectionBContent ? `${quote.sections.sectionB.lineItems.length} hardware row(s)` : "No hardware added yet"}</div><div className="summary-subvalue">{contentPresence.hasSectionBContent ? (suggestedAccessories.length > 0 ? `${suggestedAccessories.length} accessory suggestion(s) available` : "All suggested accessories are already added") : "Add equipment only when this quote actually needs one-time hardware."}</div></div>
                <div className="summary-block"><div className="summary-label">Section C output</div><div className="summary-value">{contentPresence.hasSectionCContent ? quote.sections.sectionC.title : "No field services added yet"}</div><div className="summary-subvalue">{contentPresence.hasSectionCContent ? `${quote.sections.sectionC.lineItems.length} service row(s) • ${quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "budgetary").length} budgetary / ${quote.sections.sectionC.lineItems.filter((row) => row.pricingStage === "final").length} final` : "Field services stay out of the proposal until live rows exist."}</div></div>
                <div className="summary-block"><div className="summary-label">Totals</div><div className="space-y-2 text-[#56616d]"><div className="flex justify-between gap-3"><span>Recurring monthly</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>{contentPresence.hasSectionBContent && <div className="flex justify-between gap-3"><span>One-time equipment</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>}{contentPresence.hasSectionCContent && <div className="flex justify-between gap-3"><span>Optional services</span><strong>{formatCurrency(sectionCTotal, currencyCode)}</strong></div>}{quote.metadata.quoteType === "lease" && <div className="flex justify-between gap-3 text-[#b00000]"><span>Blended lease monthly</span><strong>{hasActiveDataAgreement ? formatCurrency(leaseMonthly, currencyCode) : "Data agreement required"}</strong></div>}</div></div>
                <div className="rounded-[18px] border border-dashed border-[#d5dbe2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-[1.5] text-[#5e6974]">Keep it simple: build the quote, review the proposal, and send it with confidence.</div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  ) : <div className="workspace-shell"><div className="workspace-container">Loading proposal builder…</div></div>;
}

"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductLogo } from "@/app/components/product-logo";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/app/components/auth-shell";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, createProposalCopy, createProposalFromQuote, deserializeProposalStore, getActiveProposal, getDefaultProposalStore, mockUsers, serializeProposalStore, statusToStageLabel, upsertProposal, type SavedProposalRecord } from "@/app/lib/proposal-store";
import { resolvePreferredQuote } from "@/app/lib/active-proposal";
import {
  PROPOSAL_STORAGE_FALLBACK_KEY,
  PROPOSAL_STORAGE_KEY,
  deserializeQuoteRecord,
  persistQuoteRecord,
  serializeQuoteRecord,
} from "@/app/lib/proposal-state";
import { equipmentCatalog, sectionACatalog } from "@/app/lib/catalog";
import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import {
  CUSTOMER_PROFILE_STORE_FALLBACK_KEY,
  CUSTOMER_PROFILE_STORE_KEY,
  applyCustomerProfileToQuote,
  createCustomerProfileFromQuote,
  deserializeCustomerProfiles,
  serializeCustomerProfiles,
  upsertCustomerProfile,
  type SavedCustomerProfile,
} from "@/app/lib/customer-profiles";
import { ensureNickTrainingDemoProfiles, ensureNickTrainingDemoProposalStore } from "@/app/lib/nick-training-demo";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, ensureMajorProjectState, getActiveMajorProjectOption } from "@/app/lib/major-project";
import { getQuoteContentPresence } from "@/app/lib/proposal-commercial-summary";
import {
  type MajorProjectBundle,
  type MajorProjectComponent,
  type MajorProjectCustomerQuoteLine,
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
type MajorProjectEditorTab = "components" | "bundles" | "quote_lines";
type MajorProjectStepStatus = "current" | "complete" | "locked";
type MajorProjectScheduleFilter = "all" | "one_time" | "recurring";
type CustomerEntryMode = "start" | "select" | "create" | "review";
type EntryIntent = "new-customer" | "select-customer" | null;

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

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function majorProjectMarginPercent(revenue: number, cost: number) {
  if (revenue <= 0) return 0;
  return ((revenue - cost) / revenue) * 100;
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

function resolveCustomerEntryMode(params: {
  intent: EntryIntent;
  hasCustomer: boolean;
  savedProfileCount: number;
}) {
  const { intent, hasCustomer, savedProfileCount } = params;

  if (hasCustomer) return "review" satisfies CustomerEntryMode;
  if (intent === "new-customer") return "create" satisfies CustomerEntryMode;
  if (intent === "select-customer") {
    return (savedProfileCount > 0 ? "select" : "create") satisfies CustomerEntryMode;
  }
  return (savedProfileCount > 0 ? "start" : "create") satisfies CustomerEntryMode;
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

function majorProjectSectionTone(hasErrors: boolean, hasWarnings: boolean) {
  if (hasErrors) return "border-[#f0c7cf] bg-[#fff5f7] text-[#7a042e]";
  if (hasWarnings) return "border-[#f2ddba] bg-[#fff9ef] text-[#7a4b00]";
  return "border-[#dbe7df] bg-[#f5fbf6] text-[#215a36]";
}

function createMajorProjectComponentDraft(index: number, bundleId = ""): MajorProjectComponent {
  return {
    id: `major-component-${Date.now()}-${index}`,
    internalName: `Component ${index}`,
    customerFacingLabel: "",
    vendor: "",
    manufacturer: "",
    category: "third-party hardware",
    lineType: "hardware",
    quantity: 1,
    unit: "ea",
    customerUnitPrice: 0,
    customerExtendedPrice: 0,
    vendorUnitCost: 0,
    vendorExtendedCost: 0,
    schedule: "one_time",
    costBasis: "estimate",
    resaleBasis: "cost_plus",
    laborBucket: "",
    serviceBucket: "",
    passThrough: false,
    bundleAssignmentId: bundleId,
    notes: "",
  };
}

function createMajorProjectBundleDraft(index: number): MajorProjectBundle {
  return {
    id: `major-bundle-${Date.now()}-${index}`,
    internalName: `Bundle ${index}`,
    customerFacingLabel: `Customer bundle ${index}`,
    description: "",
    componentIds: [],
    includedCostComponentIds: [],
    includedRevenueComponentIds: [],
    schedule: "mixed",
    category: "solution",
  };
}

function createMajorProjectQuoteLineDraft(index: number): MajorProjectCustomerQuoteLine {
  return {
    id: `major-quote-line-${Date.now()}-${index}`,
    label: `Quote line ${index}`,
    description: "",
    bundleIds: [],
    includedCostComponentIds: [],
    includedRevenueComponentIds: [],
    schedule: "mixed",
    presentationCategory: "other",
  };
}

function MajorProjectStepCard({
  step,
  title,
  summary,
  detail,
  status,
  count,
  onOpen,
  children,
}: {
  step: string;
  title: string;
  summary: string;
  detail: string;
  status: MajorProjectStepStatus;
  count: number;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const isCurrent = status === "current";
  const isLocked = status === "locked";
  const toneClass = isCurrent
    ? "border-[#b00000] bg-[#fff6f6]"
    : isLocked
      ? "border-[#e6eaef] bg-[#f8fafc]"
      : "border-[#d7e3db] bg-[#f7fcf8]";

  return (
    <section className={`rounded-[18px] border p-3 md:p-4 ${toneClass}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Step {step}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h4 className="text-[18px] font-semibold tracking-[-0.03em] text-[#16202b]">{title}</h4>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${isCurrent ? "bg-[#b00000] text-white" : isLocked ? "bg-[#edf1f5] text-[#708090]" : "bg-[#dff2e4] text-[#1f6a37]"}`}>
              {isCurrent ? "Now" : isLocked ? "Locked" : "Done"}
            </span>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[#5f6c78]">{count} item{count === 1 ? "" : "s"}</span>
          </div>
          <p className="mt-1 text-[13px] text-[#44515d]">{summary}</p>
          <p className="text-[12px] text-[#708090]">{detail}</p>
        </div>
        {!isCurrent ? (
          <button type="button" className="pill-button self-start" onClick={onOpen} disabled={isLocked}>
            {isLocked ? "Finish earlier step first" : "Open step"}
          </button>
        ) : null}
      </div>
      {isCurrent ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

export default function QuotePreview() {
  const { user } = useAuth();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [quote, setQuote] = useState<QuoteRecord>(createBlankQuoteRecord());
  const [activeProposal, setActiveProposal] = useState<SavedProposalRecord | null>(null);
  const [customerProfiles, setCustomerProfiles] = useState<SavedCustomerProfile[]>([]);
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState("");
  const [autoUpdateCustomerProfile, setAutoUpdateCustomerProfile] = useState(false);
  const [customerEntryMode, setCustomerEntryMode] = useState<CustomerEntryMode>("start");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentCategoryFilter, setEquipmentCategoryFilter] = useState("All");
  const [customEquipmentDraft, setCustomEquipmentDraft] = useState<EquipmentDraft>(emptyEquipmentDraft);
  const [customSectionFields, setCustomSectionFields] = useState<CustomSectionField[]>(createBlankQuoteRecord().customFields ?? []);
  const [dataQuickAddValue, setDataQuickAddValue] = useState("1");
  const [dataQuickAddUnit, setDataQuickAddUnit] = useState<DataQuickAddUnit>("TB");
  const [majorProjectEditorTab, setMajorProjectEditorTab] = useState<MajorProjectEditorTab>("components");
  const [majorProjectComponentSearch, setMajorProjectComponentSearch] = useState("");
  const [majorProjectComponentScheduleFilter, setMajorProjectComponentScheduleFilter] = useState<MajorProjectScheduleFilter>("all");
  const [majorProjectBundleSearch, setMajorProjectBundleSearch] = useState("");
  const [majorProjectQuoteLineSearch, setMajorProjectQuoteLineSearch] = useState("");
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);

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

    const baseStore = savedStore
      ? {
          ...savedStore,
          currentUser: sessionUser,
        }
      : {
          ...fallbackStore,
          currentUser: sessionUser,
        };
    const store = ensureNickTrainingDemoProposalStore(baseStore);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(store));

    const searchParams = new URLSearchParams(window.location.search);
    const requestedProposalId = searchParams.get("proposalId");
    const savedQuote = deserializeQuoteRecord(
      window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY) ?? window.localStorage.getItem(PROPOSAL_STORAGE_FALLBACK_KEY),
    );
    const savedCustomerProfiles = ensureNickTrainingDemoProfiles(deserializeCustomerProfiles(
      window.localStorage.getItem(CUSTOMER_PROFILE_STORE_KEY) ?? window.localStorage.getItem(CUSTOMER_PROFILE_STORE_FALLBACK_KEY),
    ));
    window.localStorage.setItem(CUSTOMER_PROFILE_STORE_KEY, serializeCustomerProfiles(savedCustomerProfiles));
    const forceNewDraft = searchParams.get("mode") === "new";
    const entryIntent = (searchParams.get("entry") as EntryIntent) ?? null;
    const requestedCustomerProfileId = searchParams.get("customerProfileId");
    const requestedCustomerProfile = requestedCustomerProfileId
      ? savedCustomerProfiles.find((profile) => profile.id === requestedCustomerProfileId) ?? null
      : null;
    const matchedProposal = forceNewDraft
      ? null
      : getActiveProposal(store, requestedProposalId ?? activeProposalId ?? savedQuote?.internal?.savedProposalId ?? savedQuote?.internal?.quoteId ?? null);
    const resolvedQuote = forceNewDraft
      ? createBlankQuoteRecord()
      : resolvePreferredQuote({
        savedQuote,
        activeProposal: matchedProposal,
        fallbackQuote: createBlankQuoteRecord(),
      }).quote;
    const nextQuote = ensureMajorProjectState(cloneQuote(resolvedQuote));

    if (requestedCustomerProfile) {
      applyCustomerProfileToQuote(nextQuote, requestedCustomerProfile);
    }

    if (forceNewDraft) {
      window.localStorage.removeItem(ACTIVE_PROPOSAL_ID_KEY);
    } else if (matchedProposal) {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, matchedProposal.id);
    }

    persistQuoteRecord(nextQuote);

    setActiveProposal(matchedProposal);
    setQuote(nextQuote);
    setCustomSectionFields(nextQuote.customFields ?? []);
    setCustomerProfiles(savedCustomerProfiles);
    setSelectedCustomerProfileId(requestedCustomerProfile?.id ?? nextQuote.internal.savedCustomerProfileId ?? "");
    setCustomerEntryMode(requestedCustomerProfile ? "review" : resolveCustomerEntryMode({
      intent: entryIntent,
      hasCustomer: Boolean(nextQuote.customer.name.trim()),
      savedProfileCount: savedCustomerProfiles.length,
    }));
    setIsHydrated(true);
  }, [user]);

  useEffect(() => {
    if (!selectedCustomerProfileId) {
      setAutoUpdateCustomerProfile(false);
    }
  }, [selectedCustomerProfileId]);

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
    if (quote.metadata.quoteType !== "lease" || !isMajorProject) return 0;
    return Number((equipmentTotal * (leaseMarginPercent / 100)).toFixed(2));
  }, [equipmentTotal, isMajorProject, leaseMarginPercent, quote.metadata.quoteType]);

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
  const majorProjectHasBlockingErrors = isMajorProject && majorProjectMetrics.validation.errorCount > 0;

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
  const activeMajorOptionComponents = useMemo(() => activeMajorOption?.components ?? [], [activeMajorOption]);
  const activeMajorOptionBundles = useMemo(() => activeMajorOption?.bundles ?? [], [activeMajorOption]);
  const activeMajorOptionQuoteLines = useMemo(() => activeMajorOption?.customerQuoteLines ?? [], [activeMajorOption]);
  const componentOptions = useMemo(() => activeMajorOptionComponents.map((component) => ({
    id: component.id,
    label: component.internalName || component.customerFacingLabel || component.id,
  })), [activeMajorOptionComponents]);
  const bundleOptions = useMemo(() => activeMajorOptionBundles.map((bundle) => ({
    id: bundle.id,
    label: bundle.customerFacingLabel || bundle.internalName || bundle.id,
  })), [activeMajorOptionBundles]);
  const filteredMajorProjectComponents = useMemo(() => {
    const search = normalizeSearchValue(majorProjectComponentSearch);
    return activeMajorOptionComponents.filter((component) => {
      const matchesSchedule = majorProjectComponentScheduleFilter === "all" || component.schedule === majorProjectComponentScheduleFilter;
      const haystack = [
        component.internalName,
        component.customerFacingLabel,
        component.vendor,
        component.manufacturer,
        component.category,
        component.bundleAssignmentId,
        component.notes,
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesSchedule && matchesSearch;
    });
  }, [activeMajorOptionComponents, majorProjectComponentScheduleFilter, majorProjectComponentSearch]);
  const filteredMajorProjectBundles = useMemo(() => {
    const search = normalizeSearchValue(majorProjectBundleSearch);
    return activeMajorOptionBundles.filter((bundle) => {
      const haystack = [bundle.internalName, bundle.customerFacingLabel, bundle.category, bundle.description].filter(Boolean).join(" ").toLowerCase();
      return !search || haystack.includes(search);
    });
  }, [activeMajorOptionBundles, majorProjectBundleSearch]);
  const filteredMajorProjectQuoteLines = useMemo(() => {
    const search = normalizeSearchValue(majorProjectQuoteLineSearch);
    return activeMajorOptionQuoteLines.filter((line) => {
      const haystack = [line.label, line.description, line.presentationCategory, line.schedule].filter(Boolean).join(" ").toLowerCase();
      return !search || haystack.includes(search);
    });
  }, [activeMajorOptionQuoteLines, majorProjectQuoteLineSearch]);
  const majorProjectVendorMarginCards = useMemo(() => majorProjectMetrics.vendorSummary.map((vendor) => {
    const revenue = vendor.oneTimeRevenue + vendor.recurringRevenue;
    const cost = vendor.oneTimeCost + vendor.recurringCost;
    return {
      key: `${vendor.vendor}-${vendor.manufacturer ?? ""}`,
      label: vendor.vendor || "Unassigned vendor",
      note: vendor.manufacturer || "Vendor bucket",
      revenue,
      cost,
      grossProfit: revenue - cost,
      grossMarginPercent: majorProjectMarginPercent(revenue, cost),
    };
  }).sort((a, b) => b.revenue - a.revenue), [majorProjectMetrics.vendorSummary]);
  const majorProjectBundleMarginCards = useMemo(() => majorProjectMetrics.bundles.map((bundle) => {
    const revenue = bundle.oneTimeRevenue + bundle.recurringRevenue;
    const cost = bundle.oneTimeCost + bundle.recurringCost;
    return {
      key: bundle.id,
      label: bundle.internalName || bundle.customerFacingLabel || bundle.id,
      note: `${bundle.resolvedComponentIds.length} mapped component${bundle.resolvedComponentIds.length === 1 ? "" : "s"}`,
      revenue,
      cost,
      grossProfit: revenue - cost,
      grossMarginPercent: majorProjectMarginPercent(revenue, cost),
    };
  }).sort((a, b) => b.revenue - a.revenue), [majorProjectMetrics.bundles]);
  const majorProjectQuoteLineMarginCards = useMemo(() => majorProjectMetrics.customerQuoteLines.map((line) => {
    const revenue = line.oneTimeRevenue + line.recurringRevenue;
    const cost = line.oneTimeCost + line.recurringCost;
    return {
      key: line.id,
      label: line.label || line.id,
      note: `${line.resolvedBundleIds.length} bundle${line.resolvedBundleIds.length === 1 ? "" : "s"} feeding downstream`,
      revenue,
      cost,
      grossProfit: revenue - cost,
      grossMarginPercent: majorProjectMarginPercent(revenue, cost),
    };
  }).sort((a, b) => b.revenue - a.revenue), [majorProjectMetrics.customerQuoteLines]);
  const majorProjectPreviewCategorySummary = useMemo(() => {
    return majorProjectMetrics.customerQuoteLines.reduce((summary, line) => {
      const bucket = line.presentationCategory ?? "other";
      const revenue = line.oneTimeRevenue + line.recurringRevenue;
      if (bucket === "recurring") summary.recurring += revenue;
      else if (bucket === "hardware") summary.hardware += revenue;
      else summary.services += revenue;
      return summary;
    }, { recurring: 0, hardware: 0, services: 0 });
  }, [majorProjectMetrics.customerQuoteLines]);
  const hasComponentsStepContent = activeMajorOptionComponents.length > 0;
  const hasBundleStepContent = activeMajorOptionBundles.length > 0;
  const hasQuoteLineStepContent = activeMajorOptionQuoteLines.length > 0;
  const bundleCoverageCount = majorProjectMetrics.bundles.filter((bundle) => bundle.resolvedComponentIds.length > 0).length;
  const presentedBundleCount = activeMajorOptionBundles.length - majorProjectMetrics.validation.unpresentedBundleIds.length;
  const componentsStepStatus: MajorProjectStepStatus = majorProjectEditorTab === "components" ? "current" : hasComponentsStepContent ? "complete" : "current";
  const bundlesStepStatus: MajorProjectStepStatus = !hasComponentsStepContent
    ? "locked"
    : majorProjectEditorTab === "bundles"
      ? "current"
      : hasBundleStepContent && bundleCoverageCount > 0
        ? "complete"
        : "current";
  const quoteLinesStepStatus: MajorProjectStepStatus = !hasComponentsStepContent || !hasBundleStepContent || bundleCoverageCount === 0
    ? "locked"
    : majorProjectEditorTab === "quote_lines"
      ? "current"
      : hasQuoteLineStepContent && presentedBundleCount > 0
        ? "complete"
        : "current";

  useEffect(() => {
    if (!isMajorProject) return;
    if (majorProjectEditorTab === "bundles" && !hasComponentsStepContent) {
      setMajorProjectEditorTab("components");
      return;
    }
    if (majorProjectEditorTab === "quote_lines" && (!hasComponentsStepContent || !hasBundleStepContent || bundleCoverageCount === 0)) {
      setMajorProjectEditorTab(hasComponentsStepContent ? "bundles" : "components");
    }
  }, [bundleCoverageCount, hasBundleStepContent, hasComponentsStepContent, isMajorProject, majorProjectEditorTab]);

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

  const persistCustomerProfiles = (profiles: SavedCustomerProfile[]) => {
    if (typeof window !== "undefined") {
      const serializedProfiles = serializeCustomerProfiles(profiles);
      window.localStorage.setItem(CUSTOMER_PROFILE_STORE_KEY, serializedProfiles);
      window.localStorage.setItem(CUSTOMER_PROFILE_STORE_FALLBACK_KEY, serializedProfiles);
    }
    setCustomerProfiles(profiles);
  };

  const selectedCustomerProfile = useMemo(
    () => customerProfiles.find((profile) => profile.id === selectedCustomerProfileId) ?? null,
    [customerProfiles, selectedCustomerProfileId],
  );
  const customerEntryComplete = customerEntryMode === "review" && Boolean(quote.customer.name.trim());
  const customerHeadline = quote.customer.name.trim() || quote.metadata.accountName?.trim() || "No customer selected";
  const customerSubline = compactList([
    quote.customer.contactName,
    quote.customer.contactEmail,
    quote.customer.contactPhone,
  ]).join(" • ");
  const customerServiceAddress = compactList(quote.customer.addressLines).join(", ");
  const builderLocked = !customerEntryComplete;

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

  const updateActiveMajorComponent = (componentId: string, updater: (component: MajorProjectComponent) => MajorProjectComponent) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      option.components = option.components.map((component) => component.id === componentId ? updater(component) : component);
      return draft;
    });
  };

  const addMajorProjectComponent = (bundleId = "") => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      const nextIndex = (option.components?.length ?? 0) + 1;
      const resolvedBundleId = bundleId || option.bundles?.[0]?.id || "";
      if (!option.bundles?.length) {
        option.bundles = [createMajorProjectBundleDraft(1)];
      }
      option.components = [...(option.components ?? []), createMajorProjectComponentDraft(nextIndex, resolvedBundleId || option.bundles?.[0]?.id || "")];
      return draft;
    });
    setMajorProjectEditorTab("components");
  };

  const duplicateMajorProjectComponent = (componentId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.components) return draft;
      const component = option.components.find((entry) => entry.id === componentId);
      if (!component) return draft;
      option.components = [
        ...option.components,
        {
          ...component,
          id: `${component.id}-copy-${Date.now()}`,
          internalName: `${component.internalName || "Component"} copy`,
        },
      ];
      return draft;
    });
  };

  const removeMajorProjectComponent = (componentId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      option.components = (option.components ?? []).filter((component) => component.id !== componentId);
      option.bundles = (option.bundles ?? []).map((bundle) => ({
        ...bundle,
        componentIds: (bundle.componentIds ?? []).filter((id) => id !== componentId),
        includedCostComponentIds: (bundle.includedCostComponentIds ?? []).filter((id) => id !== componentId),
        includedRevenueComponentIds: (bundle.includedRevenueComponentIds ?? []).filter((id) => id !== componentId),
      }));
      option.customerQuoteLines = (option.customerQuoteLines ?? []).map((line) => ({
        ...line,
        includedCostComponentIds: (line.includedCostComponentIds ?? []).filter((id) => id !== componentId),
        includedRevenueComponentIds: (line.includedRevenueComponentIds ?? []).filter((id) => id !== componentId),
      }));
      return draft;
    });
  };

  const updateActiveMajorBundle = (bundleId: string, updater: (bundle: MajorProjectBundle) => MajorProjectBundle) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.bundles) return draft;
      option.bundles = option.bundles.map((bundle) => bundle.id === bundleId ? updater(bundle) : bundle);
      return draft;
    });
  };

  const addMajorProjectBundle = () => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      const nextIndex = (option.bundles?.length ?? 0) + 1;
      const nextBundle = createMajorProjectBundleDraft(nextIndex);
      const unassignedComponentIds = (option.components ?? []).filter((component) => !component.bundleAssignmentId).map((component) => component.id);
      nextBundle.componentIds = unassignedComponentIds;
      nextBundle.includedCostComponentIds = unassignedComponentIds;
      nextBundle.includedRevenueComponentIds = unassignedComponentIds;
      option.components = (option.components ?? []).map((component) => component.bundleAssignmentId ? component : { ...component, bundleAssignmentId: nextBundle.id });
      option.bundles = [...(option.bundles ?? []), nextBundle];
      return draft;
    });
    setMajorProjectEditorTab("bundles");
  };

  const duplicateMajorProjectBundle = (bundleId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.bundles) return draft;
      const bundle = option.bundles.find((entry) => entry.id === bundleId);
      if (!bundle) return draft;
      option.bundles = [...option.bundles, {
        ...bundle,
        id: `${bundle.id}-copy-${Date.now()}`,
        internalName: `${bundle.internalName || "Bundle"} copy`,
        customerFacingLabel: `${bundle.customerFacingLabel || bundle.internalName || "Bundle"} copy`,
      }];
      return draft;
    });
  };

  const removeMajorProjectBundle = (bundleId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      option.bundles = (option.bundles ?? []).filter((bundle) => bundle.id !== bundleId);
      option.components = (option.components ?? []).map((component) => component.bundleAssignmentId === bundleId ? { ...component, bundleAssignmentId: "" } : component);
      option.customerQuoteLines = (option.customerQuoteLines ?? []).map((line) => ({
        ...line,
        bundleIds: (line.bundleIds ?? []).filter((id) => id !== bundleId),
      }));
      return draft;
    });
  };

  const updateActiveMajorQuoteLine = (quoteLineId: string, updater: (line: MajorProjectCustomerQuoteLine) => MajorProjectCustomerQuoteLine) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.customerQuoteLines) return draft;
      option.customerQuoteLines = option.customerQuoteLines.map((line) => line.id === quoteLineId ? updater(line) : line);
      return draft;
    });
  };

  const addMajorProjectQuoteLine = () => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      const nextIndex = (option.customerQuoteLines?.length ?? 0) + 1;
      const nextLine = createMajorProjectQuoteLineDraft(nextIndex);
      const firstUnusedBundle = (option.bundles ?? []).find((bundle) => !(option.customerQuoteLines ?? []).some((line) => (line.bundleIds ?? []).includes(bundle.id)));
      if (firstUnusedBundle) {
        const bundleComponentIds = (firstUnusedBundle.componentIds ?? []).length
          ? firstUnusedBundle.componentIds
          : (option.components ?? [])
            .filter((component) => component.bundleAssignmentId === firstUnusedBundle.id)
            .map((component) => component.id);
        const bundledComponents = (option.components ?? []).filter((component) => bundleComponentIds.includes(component.id));
        const hasRecurring = bundledComponents.some((component) => component.schedule === "recurring");
        const hasOneTime = bundledComponents.some((component) => component.schedule === "one_time");

        nextLine.label = firstUnusedBundle.customerFacingLabel || firstUnusedBundle.internalName || nextLine.label;
        nextLine.bundleIds = [firstUnusedBundle.id];
        nextLine.includedCostComponentIds = (firstUnusedBundle.includedCostComponentIds?.length ? firstUnusedBundle.includedCostComponentIds : bundleComponentIds);
        nextLine.includedRevenueComponentIds = (firstUnusedBundle.includedRevenueComponentIds?.length ? firstUnusedBundle.includedRevenueComponentIds : bundleComponentIds);
        nextLine.schedule = hasRecurring && hasOneTime ? "mixed" : hasRecurring ? "recurring" : "one_time";
        nextLine.presentationCategory = hasRecurring && !hasOneTime ? "recurring" : "hardware";
      }
      option.customerQuoteLines = [...(option.customerQuoteLines ?? []), nextLine];
      return draft;
    });
    setMajorProjectEditorTab("quote_lines");
  };

  const duplicateMajorProjectQuoteLine = (quoteLineId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option?.customerQuoteLines) return draft;
      const line = option.customerQuoteLines.find((entry) => entry.id === quoteLineId);
      if (!line) return draft;
      option.customerQuoteLines = [...option.customerQuoteLines, {
        ...line,
        id: `${line.id}-copy-${Date.now()}`,
        label: `${line.label || "Quote line"} copy`,
      }];
      return draft;
    });
  };

  const removeMajorProjectQuoteLine = (quoteLineId: string) => {
    updateMajorProjectQuote((draft) => {
      const option = draft.majorProject?.options.find((entry) => entry.id === draft.majorProject?.activeOptionId);
      if (!option) return draft;
      option.customerQuoteLines = (option.customerQuoteLines ?? []).filter((line) => line.id !== quoteLineId);
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

  const saveCustomerProfile = (profileId?: string) => {
    if (!quote.customer.name.trim()) {
      setWorkflowNotice("Add a customer name before saving a reusable customer profile.");
      return null;
    }

    const resolvedProfileId = profileId || selectedCustomerProfileId || undefined;
    const nextProfile = createCustomerProfileFromQuote(quote, resolvedProfileId);
    const nextProfiles = upsertCustomerProfile(customerProfiles, nextProfile);
    persistCustomerProfiles(nextProfiles);
    setCustomerProfiles(nextProfiles);
    setSelectedCustomerProfileId(nextProfile.id);
    setQuote((current) => ({
      ...current,
      internal: {
        ...current.internal,
        savedCustomerProfileId: nextProfile.id,
      },
    }));
    setWorkflowNotice(profileId || selectedCustomerProfileId ? "Saved customer profile updated." : "Saved customer profile created.");
    return nextProfile;
  };

  const applySelectedCustomerProfile = (profileId: string) => {
    const profile = customerProfiles.find((entry) => entry.id === profileId);
    if (!profile) return;

    setSelectedCustomerProfileId(profile.id);
    updateQuote((draft) => {
      applyCustomerProfileToQuote(draft, profile);
      return draft;
    });
    setCustomerEntryMode("review");
    setWorkflowNotice(`Autofilled proposal details from ${profile.companyName}.`);
  };

  const finishCustomerEntry = () => {
    if (!quote.customer.name.trim()) {
      setWorkflowNotice("Add a customer name before continuing into quote building.");
      setCustomerEntryMode("create");
      return;
    }

    updateQuote((draft) => {
      draft.metadata.accountName = draft.metadata.accountName?.trim() || draft.customer.name.trim();
      draft.customer.logoText = draft.metadata.customerShortName?.trim() || draft.customer.logoText || draft.customer.name.trim();
      return draft;
    });

    setCustomerEntryMode("review");
    setWorkflowNotice(`Customer locked in for this draft: ${quote.customer.name.trim()}.`);
  };

  const persistProposalState = () => {
    if (typeof window === "undefined") return null;

    if (!customerEntryComplete) {
      setWorkflowNotice("Finish customer intake before saving, previewing, or copying this proposal.");
      return null;
    }

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

    persistQuoteRecord(nextQuote);

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

    if (autoUpdateCustomerProfile && (selectedCustomerProfileId || nextQuote.customer.name.trim())) {
      const nextProfile = createCustomerProfileFromQuote(nextQuote, selectedCustomerProfileId || undefined);
      const nextProfiles = upsertCustomerProfile(customerProfiles, nextProfile);
      persistCustomerProfiles(nextProfiles);
      setCustomerProfiles(nextProfiles);
      nextQuote.internal.savedCustomerProfileId = nextProfile.id;
      updatedProposal.quote.internal.savedCustomerProfileId = nextProfile.id;
      setSelectedCustomerProfileId(nextProfile.id);
    }

    const nextUrl = `/new?proposalId=${proposalId}`;
    if (window.location.pathname !== "/new" || window.location.search !== `?proposalId=${proposalId}`) {
      window.history.replaceState({}, "", nextUrl);
    }

    setActiveProposal(updatedProposal);
    setQuote(nextQuote);
    setWorkflowNotice(
      majorProjectHasBlockingErrors
        ? `Draft saved, but Major Project validation still has ${majorProjectMetrics.validation.errorCount} blocking error${majorProjectMetrics.validation.errorCount === 1 ? "" : "s"}.`
        : "Draft saved.",
    );

    return { proposal: updatedProposal, store: nextStore };
  };

  const handlePreviewProposal = () => {
    const persisted = persistProposalState();
    if (!persisted) return;

    if (majorProjectHasBlockingErrors) {
      setWorkflowNotice(`Preview blocked until ${majorProjectMetrics.validation.errorCount} Major Project validation error${majorProjectMetrics.validation.errorCount === 1 ? " is" : "s are"} fixed.`);
      return;
    }

    router.push("/proposal");
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
    window.history.replaceState({}, "", `/new?proposalId=${copiedProposal.id}`);
    persistQuoteRecord(copiedProposal.quote);
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
            <button type="button" className="pill-button pill-button-active" onClick={handlePreviewProposal} disabled={!customerEntryComplete}>
              Preview Proposal
            </button>
            <button type="button" className="pill-button" onClick={persistProposalState} disabled={!customerEntryComplete}>Save Draft</button>
            <button type="button" className="pill-button" onClick={copyProposalFromBuilder} disabled={!customerEntryComplete}>Copy Proposal</button>
          </div>

          {(workflowNotice || majorProjectHasBlockingErrors) && (
            <div className={`mt-4 rounded-[18px] border px-4 py-3 text-[13px] ${majorProjectHasBlockingErrors ? "border-[#e7b7b7] bg-[#fff4f4] text-[#8d1f1f]" : "border-[#d8e0e8] bg-[#f7fafc] text-[#435160]"}`}>
              {workflowNotice ?? `Major Project preview is blocked until ${majorProjectMetrics.validation.errorCount} validation error${majorProjectMetrics.validation.errorCount === 1 ? " is" : "s are"} fixed.`}
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="space-y-6">
            <section className="builder-panel">
              <div className="builder-panel-header"><div><div className="builder-eyebrow">Step 1</div><h2 className="builder-title">Customer entry</h2></div></div>

              <div className="mt-4 rounded-[18px] border border-[#d8e0e8] bg-[#f7fafc] p-4 text-[14px] leading-[1.6] text-[#435160]">
                Start every draft by either selecting a saved customer or creating a lightweight customer record for this quote. Once that is done, the rest of the builder stays focused on the quote itself.
              </div>

              {customerEntryMode === "start" ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    className="rounded-[24px] border border-[#dde3e8] bg-white p-5 text-left shadow-[0_12px_28px_rgba(75,88,106,0.08)] transition hover:-translate-y-[1px] hover:border-[#c7d5e3]"
                    onClick={() => setCustomerEntryMode("select")}
                  >
                    <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Saved profile</div>
                    <div className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Choose Customer</div>
                    <p className="mt-2 text-[14px] leading-[1.55] text-[#5c6772]">Pull in an existing customer profile and keep moving. Good fit when the account already exists in RapidQuote.</p>
                    <div className="mt-4 text-[13px] font-medium text-[#2e5b85]">{customerProfiles.length} saved customer profile{customerProfiles.length === 1 ? "" : "s"} available</div>
                  </button>

                  <button
                    type="button"
                    className="rounded-[24px] border border-[#dde3e8] bg-white p-5 text-left shadow-[0_12px_28px_rgba(75,88,106,0.08)] transition hover:-translate-y-[1px] hover:border-[#c7d5e3]"
                    onClick={() => setCustomerEntryMode("create")}
                  >
                    <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">New draft</div>
                    <div className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Create Customer</div>
                    <p className="mt-2 text-[14px] leading-[1.55] text-[#5c6772]">Add just the customer details this quote needs now: company, contact, service address, and billing/shipping basics.</p>
                    <div className="mt-4 text-[13px] font-medium text-[#2e5b85]">Lightweight by design — not a CRM detour</div>
                  </button>
                </div>
              ) : null}

              {customerEntryMode === "select" ? (
                <div className="mt-5 rounded-[22px] border border-[#dde3e8] bg-white p-4 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="builder-eyebrow">Choose customer</div>
                      <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Choose a saved customer</h3>
                      <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Pick a saved customer to fill the quote instantly, then continue with either Quick Quote or Major Project.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("start")}>Back</button>
                      <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("create")}>Create instead</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_auto] lg:items-end">
                    <label className="builder-field">
                      <span>Saved customer</span>
                      <select value={selectedCustomerProfileId} onChange={(e) => setSelectedCustomerProfileId(e.target.value)}>
                        <option value="">Select a saved customer</option>
                        {customerProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.companyName}{profile.mainContactName ? ` — ${profile.mainContactName}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button type="button" className="pill-button pill-button-active" disabled={!selectedCustomerProfileId} onClick={() => applySelectedCustomerProfile(selectedCustomerProfileId)}>
                      Use selected customer
                    </button>
                  </div>

                  {selectedCustomerProfile ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Main contact</strong>{selectedCustomerProfile.mainContactName || "Not set"}<br />{selectedCustomerProfile.mainContactEmail || "No email"}<br />{selectedCustomerProfile.mainContactPhone || "No phone"}</div>
                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Billing</strong>{selectedCustomerProfile.billingAddress.companyName || selectedCustomerProfile.companyName}<br />{selectedCustomerProfile.billingAddress.lines.join(", ") || "No billing address"}</div>
                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Shipping / service</strong>{selectedCustomerProfile.shippingSameAsBillTo ? "Matches billing" : selectedCustomerProfile.shippingAddress.lines.join(", ") || "No shipping address"}<br />Owner default: {selectedCustomerProfile.defaultOwnerName || "Not set"}</div>
                    </div>
                  ) : customerProfiles.length === 0 ? (
                    <div className="mt-4 rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No saved customer profiles yet. Create one from this draft, then reuse it next time.</div>
                  ) : null}
                </div>
              ) : null}

              {(customerEntryMode === "create" || customerEntryMode === "review") ? (
                <div className="mt-5 rounded-[22px] border border-[#dde3e8] bg-white p-4 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="builder-eyebrow">{customerEntryMode === "review" ? "Customer selected" : "Create customer"}</div>
                      <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">{customerEntryMode === "review" ? customerHeadline : "Customer details for this quote"}</h3>
                      <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                        {customerEntryMode === "review"
                          ? "The quote now carries this customer data through the proposal, preview, and PDF outputs."
                          : "Keep this tight: add only the customer details the quote needs, then move on to pricing and scope."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {customerEntryMode === "review" ? (
                        <>
                          <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("select")}>Select different customer</button>
                          <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("create")}>Edit customer</button>
                        </>
                      ) : (
                        <>
                          {customerProfiles.length > 0 ? (
                            <button type="button" className="pill-button" onClick={() => setCustomerEntryMode("select")}>Choose customer</button>
                          ) : null}
                          <button type="button" className="pill-button" onClick={() => setCustomerEntryMode(customerEntryComplete ? "review" : "start")}>Cancel</button>
                          <button type="button" className="pill-button pill-button-active" onClick={finishCustomerEntry}>Use this customer</button>
                        </>
                      )}
                    </div>
                  </div>

                  {customerEntryMode === "review" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Contact</strong>{customerSubline || "No contact details yet"}</div>
                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Service address</strong>{customerServiceAddress || "No service address yet"}</div>
                      <div className="rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] p-4 text-[13px] text-[#51606d]"><strong className="block text-[#16202b]">Saved profile</strong>{selectedCustomerProfile ? selectedCustomerProfile.companyName : "Not linked yet"}<br />{selectedCustomerProfileId ? "Auto-update available on save" : "Save this customer when ready"}</div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <label className="builder-field"><span>Customer name</span><input value={quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.customer.name = e.target.value; draft.metadata.accountName = draft.metadata.accountName?.trim() ? draft.metadata.accountName : e.target.value; draft.billTo.companyName = draft.billTo.companyName?.trim() ? draft.billTo.companyName : e.target.value; if (draft.shippingSameAsBillTo) draft.shipTo.companyName = draft.billTo.companyName; return draft; })} /></label>
                        <label className="builder-field"><span>Contact name</span><input value={quote.customer.contactName} onChange={(e) => updateQuote((draft) => { draft.customer.contactName = e.target.value; draft.billTo.attention = draft.billTo.attention?.trim() ? draft.billTo.attention : e.target.value; if (draft.shippingSameAsBillTo) draft.shipTo.attention = draft.billTo.attention; return draft; })} /></label>
                        <label className="builder-field"><span>Contact phone</span><input value={quote.customer.contactPhone} onChange={(e) => updateQuote((draft) => { draft.customer.contactPhone = e.target.value; return draft; })} /></label>
                        <label className="builder-field"><span>Contact email</span><input value={quote.customer.contactEmail} onChange={(e) => updateQuote((draft) => { draft.customer.contactEmail = e.target.value; return draft; })} /></label>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                        <label className="builder-field"><span>Account name</span><input value={quote.metadata.accountName ?? quote.customer.name} onChange={(e) => updateQuote((draft) => { draft.metadata.accountName = e.target.value; return draft; })} /></label>
                        <label className="builder-field"><span>Customer short name</span><input value={quote.metadata.customerShortName} onChange={(e) => updateQuote((draft) => { draft.metadata.customerShortName = e.target.value; draft.customer.logoText = e.target.value; return draft; })} /></label>
                      </div>


                      <div className="mt-4 rounded-[20px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                        <div className="builder-eyebrow">Service address</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="builder-field compact md:col-span-2"><span>Address line 1</span><input value={quote.customer.addressLines[0] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[0] = e.target.value; return draft; })} /></label>
                          <label className="builder-field compact md:col-span-2"><span>Address line 2</span><input value={quote.customer.addressLines[1] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[1] = e.target.value; return draft; })} /></label>
                          <label className="builder-field compact md:col-span-2"><span>Address line 3</span><input value={quote.customer.addressLines[2] ?? ""} onChange={(e) => updateQuote((draft) => { draft.customer.addressLines[2] = e.target.value; return draft; })} /></label>
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

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" className="pill-button" onClick={() => saveCustomerProfile()}>
                          {selectedCustomerProfile ? "Update saved customer" : "Save customer profile"}
                        </button>

                        <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-[#f8fbfd] px-4 py-3 text-[13px] font-medium text-[#24303b]">
                          <input
                            type="checkbox"
                            checked={autoUpdateCustomerProfile && Boolean(selectedCustomerProfileId)}
                            disabled={!selectedCustomerProfileId}
                            onChange={(e) => setAutoUpdateCustomerProfile(e.target.checked)}
                          />
                          Update saved customer on draft save
                        </label>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </section>

            {builderLocked ? (
              <section className="builder-panel">
                <div className="builder-panel-header"><div><div className="builder-eyebrow">Step 2 locked</div><h2 className="builder-title">Finish customer intake first</h2></div></div>
                <div className="rounded-[22px] border border-dashed border-[#d7dde4] bg-[#fbfcfe] p-5 text-[14px] leading-[1.6] text-[#51606d]">
                  Quote setup, commercial sections, and proposal outputs unlock after you either create a customer or apply a saved customer profile.
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4"><strong className="block text-[#16202b]">1. Customer</strong>Add company and contact basics.</div>
                    <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4"><strong className="block text-[#16202b]">2. Service + billing</strong>Confirm service address, bill-to, and ship-to.</div>
                    <div className="rounded-[18px] border border-[#e2e7ec] bg-white p-4"><strong className="block text-[#16202b]">3. Continue building</strong>Once saved, the full quote builder opens automatically.</div>
                  </div>
                </div>
              </section>
            ) : (
            <>
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
                <div className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-3 text-[13px] text-[#51606d]"><span className="block text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Customer on this draft</span><strong className="mt-1 block text-[16px] text-[#16202b]">{customerHeadline}</strong><span className="mt-1 block">{customerSubline || "Use Customer entry above to edit customer details."}</span></div>
              </div>

              <div className="mt-5 rounded-[22px] border border-[#dde3e8] bg-[#fbfcfe] p-4 md:p-5">
                <div className="builder-eyebrow">Contacts</div>
                <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Sales-side proposal details</h3>
                <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Customer basics now live in Customer entry above. This section stays focused on iNet details and any final billing/shipping adjustments needed for the quote.</p>

                <div className="mt-4">
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
                      Quick Quote is only for standard Starlink/LTE connectivity deals with router, install materials, and simple field-service rows. Major Project keeps the full components → bundles → customer quote lines workflow.
                    </p>
                  </div>
                  <div className={`rounded-[16px] border px-4 py-3 text-[13px] ${isMajorProject ? "border-[#ead9db] bg-[#fff7f7] text-[#7a042e]" : "border-[#dde3e8] bg-white text-[#5f6c78]"}`}>
                    {isMajorProject ? "Major Project uses components → bundles → customer quote lines." : "Quick Quote builds standard connectivity quotes from simple line items."}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ToggleCard
                    label="Quick Quote"
                    description="Best for Starlink/LTE service, router, install materials, and simple install or site-inspection rows."
                    active={!isMajorProject}
                    onClick={() => updateQuote((draft) => { draft.metadata.workflowMode = "quick_quote"; return draft; })}
                  />
                  <ToggleCard
                    label="Major Project"
                    description="Best for structured projects. Build from internal components, group into bundles, then choose the customer-facing quote lines."
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
                    {isMajorProject
                      ? "Lease pricing is gated by an active data agreement. Hardware margin is editable and spread across the selected lease term."
                      : "Lease pricing is gated by an active data agreement. Quick Quote spreads the hardware total across the selected term, then adds monthly service."}
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

                        {isMajorProject && (
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
                        )}
                      </div>

                      <div className={`rounded-[18px] border px-4 py-3 text-[13px] leading-[1.5] ${hasActiveDataAgreement ? "border-[#d9e7dd] bg-[#f5fbf6] text-[#365444]" : "border-[#f0d1d1] bg-[#fff1f1] text-[#7d4b4b]"}`}>
                        {hasActiveDataAgreement
                          ? isMajorProject
                            ? `Lease pricing is active. The monthly lease total below now includes the ${leaseMarginPercent}% hardware margin spread across the selected term.`
                            : "Lease pricing is active. The monthly lease total below spreads hardware across the selected term and adds recurring monthly service."
                          : "Lease pricing is locked until an active data agreement is confirmed. Turn this on to enable the lease monthly number."}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Purchase hardware total</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>
                      {isMajorProject && <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Lease margin ({leaseMarginPercent}%)</span><strong>{formatCurrency(leaseMarginAmount, currencyCode)}</strong></div>}
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Lease hardware base</span><strong>{formatCurrency(leaseEquipmentBase, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Selected term</span><strong>{selectedLeaseTerm} months</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Hardware per month</span><strong>{formatCurrency(leaseEquipmentMonthly, currencyCode)}</strong></div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>Recurring monthly service</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>
                      <div className="rounded-[16px] border border-[#e8edf2] bg-[#fafcfd] px-4 py-3 text-[13px] text-[#5d6874]">
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Calculation breakdown</div>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between gap-3"><span>1. Equipment total</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>
                          {isMajorProject && <div className="flex items-center justify-between gap-3"><span>2. + Margin ({leaseMarginPercent}%)</span><strong>+ {formatCurrency(leaseMarginAmount, currencyCode)}</strong></div>}
                          <div className="flex items-center justify-between gap-3"><span>{isMajorProject ? "3." : "2."} Lease hardware base</span><strong>{formatCurrency(leaseEquipmentBase, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>{isMajorProject ? "4." : "3."} ÷ Term ({selectedLeaseTerm})</span><strong>{formatCurrency(leaseEquipmentMonthly, currencyCode)}</strong></div>
                          <div className="flex items-center justify-between gap-3"><span>{isMajorProject ? "5." : "4."} + Recurring monthly service</span><strong>+ {formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>
                        </div>
                      </div>
                      <div className="border-t border-[#e8edf2] pt-3">
                        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Lease monthly</div>
                        <div className={`mt-1 text-[28px] font-semibold tracking-[-0.03em] ${hasActiveDataAgreement ? "text-[#b00000]" : "text-[#7f8a96]"}`}>
                          {hasActiveDataAgreement ? formatCurrency(leaseMonthly, currencyCode) : "Data agreement required"}
                        </div>
                        <div className="mt-1 text-[13px] text-[#60707f]">
                          {hasActiveDataAgreement
                            ? isMajorProject
                              ? `Formula: ${formatCurrency(equipmentTotal, currencyCode)} + ${leaseMarginPercent}% margin = ${formatCurrency(leaseEquipmentBase, currencyCode)}; then ${formatCurrency(leaseEquipmentBase, currencyCode)} ÷ ${selectedLeaseTerm} = ${formatCurrency(leaseEquipmentMonthly, currencyCode)}; then + ${formatCurrency(recurringMonthlyTotal, currencyCode)} recurring monthly service.`
                              : `Formula: ${formatCurrency(equipmentTotal, currencyCode)} ÷ ${selectedLeaseTerm} = ${formatCurrency(leaseEquipmentMonthly, currencyCode)}; then + ${formatCurrency(recurringMonthlyTotal, currencyCode)} recurring monthly service.`
                            : "This lease calculator stays disabled until the active data agreement box is checked."}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isMajorProject && majorProjectState && (
                <div className="mt-5 space-y-3 rounded-[20px] border border-[#ead9db] bg-[#fff9f9] p-3 md:p-4">
                  <div className="builder-eyebrow">Major Project mode</div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Set the basics, then build the quote</h3>
                      <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                        Start with project basics and option setup. Then add products, bundle them, create customer quote lines, and review the live rollup at the end.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="pill-button" onClick={addMajorProjectOption}>Add option</button>
                      <button type="button" className="pill-button" onClick={removeActiveMajorOption} disabled={(majorProjectState.options?.length ?? 0) <= 1}>Remove option</button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
                    <div className="space-y-3 rounded-[16px] border border-[#e7d8db] bg-white p-3">
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

                    <div className="space-y-3 rounded-[16px] border border-[#e7d8db] bg-white p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="builder-field compact"><span>Active option</span><select value={majorProjectState.activeOptionId} onChange={(e) => updateMajorProjectQuote((draft) => { if (draft.majorProject) draft.majorProject.activeOptionId = e.target.value; return draft; })}>{majorProjectState.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                        <label className="builder-field compact"><span>Option label</span><input value={activeMajorOption?.label ?? ""} onChange={(e) => updateActiveMajorOption("label", e.target.value)} /></label>
                        <label className="builder-field compact"><span>Sites</span><input type="number" value={activeMajorOption?.siteCount ?? 0} onChange={(e) => updateActiveMajorOption("siteCount", Math.max(parseNumber(e.target.value), 0))} /></label>
                        <label className="builder-field compact"><span>Option description</span><input value={activeMajorOption?.description ?? ""} onChange={(e) => updateActiveMajorOption("description", e.target.value)} /></label>
                      </div>
                      <details className="rounded-[14px] border border-[#efe3e5] bg-[#fffafa] p-3">
                        <summary className="cursor-pointer list-none text-[13px] font-semibold text-[#16202b]">Advanced per-site assumptions</summary>
                        <div className="major-project-grid mt-3">
                          <label className="builder-field compact"><span>MRR / site</span><input type="number" step="0.01" value={activeMajorOption?.monthlyRatePerSite ?? 0} onChange={(e) => updateActiveMajorOption("monthlyRatePerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                          <label className="builder-field compact"><span>Hardware / site</span><input type="number" step="0.01" value={activeMajorOption?.hardwarePerSite ?? 0} onChange={(e) => updateActiveMajorOption("hardwarePerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                          <label className="builder-field compact"><span>Install / site</span><input type="number" step="0.01" value={activeMajorOption?.installPerSite ?? 0} onChange={(e) => updateActiveMajorOption("installPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                          <label className="builder-field compact"><span>Other one-time / site</span><input type="number" step="0.01" value={activeMajorOption?.otherOneTimePerSite ?? 0} onChange={(e) => updateActiveMajorOption("otherOneTimePerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                          <label className="builder-field compact"><span>Vendor recurring / site</span><input type="number" step="0.01" value={activeMajorOption?.vendorRecurringPerSite ?? 0} onChange={(e) => updateActiveMajorOption("vendorRecurringPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                          <label className="builder-field compact"><span>Support recurring / site</span><input type="number" step="0.01" value={activeMajorOption?.supportRecurringPerSite ?? 0} onChange={(e) => updateActiveMajorOption("supportRecurringPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                          <label className="builder-field compact"><span>Other recurring / site</span><input type="number" step="0.01" value={activeMajorOption?.otherRecurringPerSite ?? 0} onChange={(e) => updateActiveMajorOption("otherRecurringPerSite", Math.max(parseNumber(e.target.value), 0))} /></label>
                        </div>
                      </details>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[16px] border border-[#e7d8db] bg-white p-3">
                    <div className="rounded-[16px] border border-[#efe3e5] bg-[#fffafa] p-3">
                      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Authoring workflow</div>
                      <h4 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#16202b]">Build the offer in order</h4>
                      <div className="mt-2 grid gap-2 md:grid-cols-3 text-[12px] text-[#44515d]">
                        <div className="rounded-[14px] bg-white px-3 py-2"><strong className="block text-[#16202b]">1. Products</strong><span>Parts, services, labor.</span></div>
                        <div className="rounded-[14px] bg-white px-3 py-2"><strong className="block text-[#16202b]">2. Bundles</strong><span>Package the rows.</span></div>
                        <div className="rounded-[14px] bg-white px-3 py-2"><strong className="block text-[#16202b]">3. Customer lines</strong><span>Output to proposal.</span></div>
                      </div>
                    </div>

                    <MajorProjectStepCard
                      step="1"
                      title="Internal components"
                      count={activeMajorOptionComponents.length}
                      status={componentsStepStatus}
                      summary="Enter the real parts, services, labor, cost, and sell price first."
                      detail="Everything downstream rolls up from these rows."
                      onOpen={() => setMajorProjectEditorTab("components")}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                          <div>
                            <strong className="text-[#16202b]">Internal components are the source of truth.</strong>
                            <div className="mt-1">Set pricing, cost, schedule, and which internal bundle each component belongs to.</div>
                          </div>
                          <button type="button" className="pill-button pill-button-active" onClick={() => addMajorProjectComponent()}>Add component</button>
                        </div>
                        <div className="major-project-toolbar">
                          <label className="builder-field compact major-project-toolbar-search"><span>Find component</span><input value={majorProjectComponentSearch} onChange={(e) => setMajorProjectComponentSearch(e.target.value)} placeholder="Search name, vendor, category, notes" /></label>
                          <label className="builder-field compact"><span>Schedule</span><select value={majorProjectComponentScheduleFilter} onChange={(e) => setMajorProjectComponentScheduleFilter(e.target.value as MajorProjectScheduleFilter)}><option value="all">All schedules</option><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                          <div className="major-project-toolbar-stat"><strong>{filteredMajorProjectComponents.length}</strong><span>showing</span></div>
                          <div className="major-project-toolbar-stat"><strong>{activeMajorOptionComponents.length}</strong><span>total</span></div>
                        </div>

                        {activeMajorOptionComponents.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No components yet. Add the first internal component so there is real economics behind the project.</div>
                        ) : filteredMajorProjectComponents.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No components match the current filter. Clear the search or schedule filter to see everything again.</div>
                        ) : filteredMajorProjectComponents.map((component) => {
                          const index = activeMajorOptionComponents.findIndex((entry) => entry.id === component.id);
                          const componentRevenue = component.customerExtendedPrice;
                          const componentCost = component.vendorExtendedCost;
                          const componentGrossProfit = componentRevenue - componentCost;
                          const componentMargin = majorProjectMarginPercent(componentRevenue, componentCost);
                          const assignedBundleLabel = bundleOptions.find((bundle) => bundle.id === component.bundleAssignmentId)?.label ?? "Unassigned";
                          return (
                          <div key={component.id} className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Component {index + 1}</div>
                                <div className="mt-1 text-[18px] font-semibold text-[#16202b]">{component.internalName || `Component ${index + 1}`}</div>
                                <div className="major-project-chip-row mt-2">
                                  <span className="major-project-chip">{component.schedule === "recurring" ? "Recurring" : "One-time"}</span>
                                  <span className="major-project-chip">{component.vendor || "No vendor"}</span>
                                  <span className="major-project-chip">{assignedBundleLabel}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className="pill-button" onClick={() => duplicateMajorProjectComponent(component.id)}>Duplicate</button>
                                <button type="button" className="pill-button" onClick={() => addMajorProjectComponent(component.bundleAssignmentId ?? "")}>Add similar</button>
                                <button type="button" className="danger-button" onClick={() => removeMajorProjectComponent(component.id)}>Remove</button>
                              </div>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                              <label className="builder-field compact"><span>Internal name</span><input value={component.internalName} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, internalName: e.target.value }))} /></label>
                              <label className="builder-field compact"><span>Customer label (optional)</span><input value={component.customerFacingLabel ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, customerFacingLabel: e.target.value }))} /></label>
                              <label className="builder-field compact"><span>Vendor</span><input value={component.vendor} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, vendor: e.target.value }))} /></label>
                              <label className="builder-field compact"><span>Manufacturer</span><input value={component.manufacturer ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, manufacturer: e.target.value }))} /></label>
                              <label className="builder-field compact"><span>Category</span><input value={component.category} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, category: e.target.value }))} /></label>
                              <label className="builder-field compact"><span>Line type</span><select value={component.lineType} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, lineType: e.target.value as MajorProjectComponent["lineType"] }))}><option value="hardware">Hardware</option><option value="software">Software</option><option value="subscription">Subscription</option><option value="installation">Installation</option><option value="service">Service</option><option value="support">Support</option><option value="managed_service">Managed service</option><option value="optional_service">Optional service</option><option value="internal_labor">Internal labor</option><option value="shipping">Shipping</option><option value="tax">Tax</option><option value="other">Other</option></select></label>
                              <label className="builder-field compact"><span>Schedule</span><select value={component.schedule} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, schedule: e.target.value as MajorProjectComponent["schedule"] }))}><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                              <label className="builder-field compact"><span>Bundle assignment</span><select value={component.bundleAssignmentId ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, bundleAssignmentId: e.target.value }))}><option value="">Unassigned</option>{bundleOptions.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.label}</option>)}</select></label>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                              <label className="builder-field compact"><span>Qty</span><input type="number" step="0.01" value={component.quantity} onChange={(e) => updateActiveMajorComponent(component.id, (current) => { const quantity = Math.max(parseNumber(e.target.value), 0); return { ...current, quantity, customerExtendedPrice: Number((quantity * current.customerUnitPrice).toFixed(2)), vendorExtendedCost: Number((quantity * current.vendorUnitCost).toFixed(2)) }; })} /></label>
                              <label className="builder-field compact"><span>Unit</span><input value={component.unit} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, unit: e.target.value }))} /></label>
                              <label className="builder-field compact"><span>Customer unit price</span><input type="number" step="0.01" value={component.customerUnitPrice} onChange={(e) => updateActiveMajorComponent(component.id, (current) => { const customerUnitPrice = Math.max(parseNumber(e.target.value), 0); return { ...current, customerUnitPrice, customerExtendedPrice: Number((current.quantity * customerUnitPrice).toFixed(2)) }; })} /></label>
                              <label className="builder-field compact"><span>Vendor unit cost</span><input type="number" step="0.01" value={component.vendorUnitCost} onChange={(e) => updateActiveMajorComponent(component.id, (current) => { const vendorUnitCost = Math.max(parseNumber(e.target.value), 0); return { ...current, vendorUnitCost, vendorExtendedCost: Number((current.quantity * vendorUnitCost).toFixed(2)) }; })} /></label>
                            </div>
                            <details className="mt-3 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                              <summary className="cursor-pointer list-none text-[14px] font-semibold text-[#16202b]">
                                More controls
                                <span className="ml-2 text-[12px] font-normal text-[#6a7682]">Basis, pass-through, and notes.</span>
                              </summary>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                                <label className="builder-field compact"><span>Cost basis</span><select value={component.costBasis} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, costBasis: e.target.value as MajorProjectComponent["costBasis"] }))}><option value="vendor_quote">Vendor quote</option><option value="msrp">MSRP</option><option value="estimate">Estimate</option><option value="internal_labor">Internal labor</option><option value="blended">Blended</option><option value="other">Other</option></select></label>
                                <label className="builder-field compact"><span>Resale basis</span><select value={component.resaleBasis} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, resaleBasis: e.target.value as MajorProjectComponent["resaleBasis"] }))}><option value="fixed_fee">Fixed fee</option><option value="cost_plus">Cost plus</option><option value="target_margin">Target margin</option><option value="pass_through">Pass through</option><option value="bundle">Bundle</option><option value="other">Other</option></select></label>
                                <label className="inline-flex items-center gap-3 rounded-[18px] border border-[#d7dde4] bg-white px-4 py-3 text-[14px] font-medium text-[#24303b]"><input type="checkbox" checked={component.passThrough} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, passThrough: e.target.checked }))} /> Pass-through</label>
                              </div>
                              <label className="builder-field compact mt-3"><span>Notes</span><textarea rows={2} value={component.notes ?? ""} onChange={(e) => updateActiveMajorComponent(component.id, (current) => ({ ...current, notes: e.target.value }))} /></label>
                            </details>
                            <div className="mt-3 grid gap-3 lg:grid-cols-4 text-[12px] text-[#5f6c78]">
                              <div className="rounded-[14px] bg-white px-3 py-2">Revenue {formatCurrency(componentRevenue, currencyCode)}</div>
                              <div className="rounded-[14px] bg-white px-3 py-2">Cost {formatCurrency(componentCost, currencyCode)}</div>
                              <div className="rounded-[14px] bg-white px-3 py-2">GP {formatCurrency(componentGrossProfit, currencyCode)}</div>
                              <div className="rounded-[14px] bg-white px-3 py-2">Margin {formatPercent(componentMargin)}</div>
                            </div>
                          </div>
                        );})}
                      </div>
                    </MajorProjectStepCard>

                    <MajorProjectStepCard
                      step="2"
                      title="Internal bundles"
                      count={activeMajorOptionBundles.length}
                      status={bundlesStepStatus}
                      summary="Package the component rows into internal groups before anything turns customer-facing."
                      detail="Each bundle should cleanly collect the economics it represents."
                      onOpen={() => setMajorProjectEditorTab("bundles")}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                          <div><strong className="text-[#16202b]">Bundles are your internal grouping layer.</strong><div className="mt-1">Use them to collect the economic components that should roll together before anything becomes customer-facing.</div></div>
                          <button type="button" className="pill-button pill-button-active" onClick={addMajorProjectBundle}>Add bundle</button>
                        </div>
                        <div className="major-project-toolbar">
                          <label className="builder-field compact major-project-toolbar-search"><span>Find bundle</span><input value={majorProjectBundleSearch} onChange={(e) => setMajorProjectBundleSearch(e.target.value)} placeholder="Search bundle name, label, category" /></label>
                          <div className="major-project-toolbar-stat"><strong>{filteredMajorProjectBundles.length}</strong><span>showing</span></div>
                          <div className="major-project-toolbar-stat"><strong>{activeMajorOptionBundles.length}</strong><span>total</span></div>
                        </div>

                        {activeMajorOptionBundles.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No bundles yet. Add one so components can roll into meaningful internal packages.</div> : filteredMajorProjectBundles.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No bundles match that search right now.</div> : filteredMajorProjectBundles.map((bundle) => {
                          const bundleMetrics = majorProjectMetrics.bundles.find((entry) => entry.id === bundle.id);
                          const selectedIds = new Set(bundle.componentIds ?? []);
                          return (
                            <div key={bundle.id} className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div><div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Internal bundle</div><div className="mt-1 text-[18px] font-semibold text-[#16202b]">{bundle.internalName}</div><div className="major-project-chip-row mt-2"><span className="major-project-chip">{bundle.schedule ?? "mixed"}</span><span className="major-project-chip">{bundle.customerFacingLabel || "No customer label"}</span><span className="major-project-chip">{bundleMetrics?.resolvedComponentIds.length ?? 0} mapped</span></div></div>
                                <div className="flex flex-wrap gap-2"><button type="button" className="pill-button" onClick={() => duplicateMajorProjectBundle(bundle.id)}>Duplicate</button><button type="button" className="pill-button" onClick={() => addMajorProjectComponent(bundle.id)}>Add component into bundle</button><button type="button" className="danger-button" onClick={() => removeMajorProjectBundle(bundle.id)}>Remove</button></div>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                <label className="builder-field compact"><span>Internal name</span><input value={bundle.internalName} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, internalName: e.target.value }))} /></label>
                                <label className="builder-field compact"><span>Customer-facing label</span><input value={bundle.customerFacingLabel} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, customerFacingLabel: e.target.value }))} /></label>
                                <label className="builder-field compact"><span>Category</span><input value={bundle.category ?? ""} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, category: e.target.value }))} /></label>
                                <label className="builder-field compact"><span>Schedule</span><select value={bundle.schedule ?? "mixed"} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, schedule: e.target.value as MajorProjectBundle["schedule"] }))}><option value="mixed">Mixed</option><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                              </div>
                              <label className="builder-field compact mt-3"><span>Description</span><textarea rows={2} value={bundle.description ?? ""} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, description: e.target.value }))} /></label>
                              <div className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                                <div className="flex items-center justify-between gap-3"><div className="text-[14px] font-semibold text-[#16202b]">Included components</div><div className="text-[12px] text-[#7a8793]">{bundleMetrics?.resolvedComponentIds.length ?? 0} mapped</div></div>
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {componentOptions.map((component) => (
                                    <label key={component.id} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={selectedIds.has(component.id)} onChange={(e) => updateActiveMajorBundle(bundle.id, (current) => ({ ...current, componentIds: e.target.checked ? [...new Set([...(current.componentIds ?? []), component.id])] : (current.componentIds ?? []).filter((id) => id !== component.id), includedCostComponentIds: e.target.checked ? current.includedCostComponentIds : (current.includedCostComponentIds ?? []).filter((id) => id !== component.id), includedRevenueComponentIds: e.target.checked ? current.includedRevenueComponentIds : (current.includedRevenueComponentIds ?? []).filter((id) => id !== component.id) }))} /> {component.label}</label>
                                  ))}
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-4 text-[12px] text-[#5f6c78]"><div className="rounded-[14px] bg-white px-3 py-2">Revenue {formatCurrency((bundleMetrics?.oneTimeRevenue ?? 0) + (bundleMetrics?.recurringRevenue ?? 0), currencyCode)}</div><div className="rounded-[14px] bg-white px-3 py-2">Cost {formatCurrency((bundleMetrics?.oneTimeCost ?? 0) + (bundleMetrics?.recurringCost ?? 0), currencyCode)}</div><div className="rounded-[14px] bg-white px-3 py-2">One-time {formatCurrency(bundleMetrics?.oneTimeRevenue ?? 0, currencyCode)}</div><div className="rounded-[14px] bg-white px-3 py-2">Recurring {formatCurrency(bundleMetrics?.recurringRevenue ?? 0, currencyCode)}</div></div>
                            </div>
                          );
                        })}
                      </div>
                    </MajorProjectStepCard>

                    <MajorProjectStepCard
                      step="3"
                      title="Customer quote lines"
                      count={activeMajorOptionQuoteLines.length}
                      status={quoteLinesStepStatus}
                      summary="Choose which bundles show up for the customer and where they land in the proposal."
                      detail="Sections A, B, and C are downstream output only."
                      onOpen={() => setMajorProjectEditorTab("quote_lines")}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e8edf2] bg-[#fafcfd] p-4 text-[13px] text-[#5e6975]">
                          <div><strong className="text-[#16202b]">Customer quote lines are the presentation layer.</strong><div className="mt-1">Pick which bundles and any explicit component overrides should feed Section A, B, or C downstream.</div></div>
                          <button type="button" className="pill-button pill-button-active" onClick={addMajorProjectQuoteLine}>Add quote line</button>
                        </div>
                        <div className="major-project-toolbar">
                          <label className="builder-field compact major-project-toolbar-search"><span>Find quote line</span><input value={majorProjectQuoteLineSearch} onChange={(e) => setMajorProjectQuoteLineSearch(e.target.value)} placeholder="Search customer-facing labels and notes" /></label>
                          <div className="major-project-toolbar-stat"><strong>{filteredMajorProjectQuoteLines.length}</strong><span>showing</span></div>
                          <div className="major-project-toolbar-stat"><strong>{activeMajorOptionQuoteLines.length}</strong><span>total</span></div>
                        </div>
                        <div className="major-project-preview-handoff">
                          <div className="major-project-preview-handoff-card"><span>Section A / recurring</span><strong>{formatCurrency(majorProjectPreviewCategorySummary.recurring, currencyCode)}</strong></div>
                          <div className="major-project-preview-handoff-card"><span>Section B / hardware</span><strong>{formatCurrency(majorProjectPreviewCategorySummary.hardware, currencyCode)}</strong></div>
                          <div className="major-project-preview-handoff-card"><span>Section C / services</span><strong>{formatCurrency(majorProjectPreviewCategorySummary.services, currencyCode)}</strong></div>
                        </div>

                        {activeMajorOptionQuoteLines.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No customer quote lines yet. Add one so bundles start showing up downstream in the proposal structure.</div> : filteredMajorProjectQuoteLines.length === 0 ? <div className="rounded-[18px] border border-dashed border-[#d9e0e7] bg-[#fbfcfe] p-5 text-[14px] text-[#5d6772]">No customer quote lines match that search right now.</div> : filteredMajorProjectQuoteLines.map((line) => {
                          const metrics = majorProjectMetrics.customerQuoteLines.find((entry) => entry.id === line.id);
                          const selectedBundles = new Set(line.bundleIds ?? []);
                          const explicitRevenueIds = new Set(line.includedRevenueComponentIds ?? []);
                          const explicitCostIds = new Set(line.includedCostComponentIds ?? []);
                          return (
                            <div key={line.id} className="rounded-[18px] border border-[#dde3e8] bg-[#fbfcfe] p-4">
                              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div><div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Customer quote line</div><div className="mt-1 text-[18px] font-semibold text-[#16202b]">{line.label}</div><div className="major-project-chip-row mt-2"><span className="major-project-chip">{line.presentationCategory ?? "other"}</span><span className="major-project-chip">{line.schedule ?? "mixed"}</span><span className="major-project-chip">{metrics?.resolvedBundleIds.length ?? 0} bundle feeds</span></div></div>
                                <div className="flex flex-wrap gap-2"><button type="button" className="pill-button" onClick={() => duplicateMajorProjectQuoteLine(line.id)}>Duplicate</button><button type="button" className="danger-button" onClick={() => removeMajorProjectQuoteLine(line.id)}>Remove</button></div>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                <label className="builder-field compact"><span>Quote line label</span><input value={line.label} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, label: e.target.value }))} /></label>
                                <label className="builder-field compact"><span>Presentation category</span><select value={line.presentationCategory ?? "other"} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, presentationCategory: e.target.value as MajorProjectCustomerQuoteLine["presentationCategory"] }))}><option value="recurring">Section A / recurring</option><option value="hardware">Section B / hardware</option><option value="services">Section C / services</option><option value="other">Section C / other</option></select></label>
                                <label className="builder-field compact"><span>Schedule</span><select value={line.schedule ?? "mixed"} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, schedule: e.target.value as MajorProjectCustomerQuoteLine["schedule"] }))}><option value="mixed">Mixed</option><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                                <div className="rounded-[16px] border border-[#e2e7ec] bg-white px-4 py-3 text-[13px] text-[#5e6975]"><div className="font-semibold text-[#16202b]">Downstream total</div><div className="mt-1">{formatCurrency((metrics?.oneTimeRevenue ?? 0) + (metrics?.recurringRevenue ?? 0), currencyCode)}</div></div>
                              </div>
                              <label className="builder-field compact mt-3"><span>Description / proposal note</span><textarea rows={2} value={line.description ?? ""} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, description: e.target.value }))} /></label>
                              <div className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                                <div className="text-[14px] font-semibold text-[#16202b]">Bundles shown on this quote line</div>
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {bundleOptions.map((bundle) => (
                                    <label key={bundle.id} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={selectedBundles.has(bundle.id)} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, bundleIds: e.target.checked ? [...new Set([...(current.bundleIds ?? []), bundle.id])] : (current.bundleIds ?? []).filter((id) => id !== bundle.id) }))} /> {bundle.label}</label>
                                  ))}
                                </div>
                              </div>
                              <details className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-white p-4">
                                <summary className="cursor-pointer list-none text-[14px] font-semibold text-[#16202b]">
                                  Advanced overrides
                                  <span className="ml-2 text-[12px] font-normal text-[#6a7682]">Use only when the normal bundle rollup needs a manual exception.</span>
                                </summary>
                                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                  <div>
                                    <div className="text-[13px] font-semibold text-[#16202b]">Revenue overrides</div>
                                    <div className="mt-3 grid gap-2">
                                      {componentOptions.map((component) => (
                                        <label key={`${line.id}-rev-${component.id}`} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={explicitRevenueIds.has(component.id)} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, includedRevenueComponentIds: e.target.checked ? [...new Set([...(current.includedRevenueComponentIds ?? []), component.id])] : (current.includedRevenueComponentIds ?? []).filter((id) => id !== component.id) }))} /> {component.label}</label>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[13px] font-semibold text-[#16202b]">Cost overrides</div>
                                    <div className="mt-3 grid gap-2">
                                      {componentOptions.map((component) => (
                                        <label key={`${line.id}-cost-${component.id}`} className="inline-flex items-center gap-3 rounded-[14px] border border-[#e5eaf0] bg-[#fbfcfe] px-3 py-2 text-[13px] text-[#24303b]"><input type="checkbox" checked={explicitCostIds.has(component.id)} onChange={(e) => updateActiveMajorQuoteLine(line.id, (current) => ({ ...current, includedCostComponentIds: e.target.checked ? [...new Set([...(current.includedCostComponentIds ?? []), component.id])] : (current.includedCostComponentIds ?? []).filter((id) => id !== component.id) }))} /> {component.label}</label>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </details>
                              <div className="mt-3 grid gap-3 md:grid-cols-4 text-[12px] text-[#5f6c78]"><div className="rounded-[14px] bg-white px-3 py-2">Recurring revenue {formatCurrency(metrics?.recurringRevenue ?? 0, currencyCode)}</div><div className="rounded-[14px] bg-white px-3 py-2">One-time revenue {formatCurrency(metrics?.oneTimeRevenue ?? 0, currencyCode)}</div><div className="rounded-[14px] bg-white px-3 py-2">Recurring cost {formatCurrency(metrics?.recurringCost ?? 0, currencyCode)}</div><div className="rounded-[14px] bg-white px-3 py-2">One-time cost {formatCurrency(metrics?.oneTimeCost ?? 0, currencyCode)}</div></div>
                            </div>
                          );
                        })}
                      </div>
                    </MajorProjectStepCard>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[#dbe3ea] bg-[#f8fafc] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Project rollup</div>
                        <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Live totals and mapping check</div>
                      </div>
                      <div className="text-[12px] text-[#5d6976]">Updates as components, bundles, and customer quote lines are built.</div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

                      <div className={`rounded-[18px] border p-4 text-[13px] ${majorProjectSectionTone(majorProjectMetrics.validation.errorCount > 0, majorProjectMetrics.validation.warningCount > 0)}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-[0.14em] opacity-70">Mapping integrity</div>
                            <div className="mt-1 text-[16px] font-semibold text-[#16202b]">{majorProjectMetrics.validation.valid ? "Mapping is structurally clean" : "Mapping needs attention"}</div>
                          </div>
                          <div className="text-right text-[12px] font-semibold">
                            <div>{majorProjectMetrics.validation.errorCount} error{majorProjectMetrics.validation.errorCount === 1 ? "" : "s"}</div>
                            <div>{majorProjectMetrics.validation.warningCount} warning{majorProjectMetrics.validation.warningCount === 1 ? "" : "s"}</div>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-[12px] md:grid-cols-3">
                          <div className="rounded-[14px] bg-white/70 px-3 py-2"><strong>{majorProjectMetrics.components.length}</strong> components</div>
                          <div className="rounded-[14px] bg-white/70 px-3 py-2"><strong>{majorProjectMetrics.bundles.length}</strong> bundles</div>
                          <div className="rounded-[14px] bg-white/70 px-3 py-2"><strong>{majorProjectMetrics.customerQuoteLines.length}</strong> quote lines</div>
                        </div>
                        {majorProjectMetrics.validation.issues.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {majorProjectMetrics.validation.issues.slice(0, 6).map((issue, index) => (
                              <div key={`${issue.code}-${index}`} className="rounded-[14px] border border-current/10 bg-white/75 px-3 py-2">
                                <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-70">{issue.severity}</div>
                                <div className="mt-1 leading-[1.45]">{issue.message}</div>
                              </div>
                            ))}
                            {majorProjectMetrics.validation.issues.length > 6 ? (
                              <div className="text-[12px] opacity-75">+ {majorProjectMetrics.validation.issues.length - 6} more mapping issue(s)</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-3 text-[12px] leading-[1.45]">Every component is being used as the economic source, bundles are resolving cleanly, and customer quote lines have backing economics.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[#dbe3ea] bg-[#f8fafc] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8b96a3]">Margin views</div>
                        <div className="mt-1 text-[18px] font-semibold text-[#16202b]">Economics by vendor, bundle, and customer line</div>
                      </div>
                      <div className="text-[12px] text-[#5d6976]">Internal-only. Customer labels stay presentation-only.</div>
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      {[
                        { title: "Vendor buckets", items: majorProjectVendorMarginCards },
                        { title: "Internal bundles", items: majorProjectBundleMarginCards },
                        { title: "Customer quote lines", items: majorProjectQuoteLineMarginCards },
                      ].map((group) => (
                        <div key={group.title} className="rounded-[18px] border border-[#e1e7ed] bg-white p-4">
                          <div className="text-[14px] font-semibold text-[#16202b]">{group.title}</div>
                          <div className="mt-3 space-y-3">
                            {group.items.length === 0 ? <div className="text-[13px] text-[#66727e]">Nothing to summarize yet.</div> : group.items.slice(0, 6).map((item) => (
                              <div key={item.key} className="major-project-margin-card">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-[#16202b]">{item.label}</div>
                                    <div className="mt-1 text-[12px] text-[#697582]">{item.note}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[12px] text-[#697582]">Margin</div>
                                    <div className={`text-[15px] font-semibold ${item.grossProfit >= 0 ? "text-[#25643b]" : "text-[#b00000]"}`}>{formatPercent(item.grossMarginPercent)}</div>
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[12px] text-[#54616d]">
                                  <div>Revenue <strong className="block text-[#16202b]">{formatCurrency(item.revenue, currencyCode)}</strong></div>
                                  <div>Cost <strong className="block text-[#16202b]">{formatCurrency(item.cost, currencyCode)}</strong></div>
                                  <div>GP <strong className="block text-[#16202b]">{formatCurrency(item.grossProfit, currencyCode)}</strong></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isMajorProject && (
              <div className="mt-5 rounded-[22px] border border-[#d9e2ea] bg-[#f8fbfd] p-4 md:p-5">
                <div className="builder-eyebrow">Internal commercial</div>
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Margin foundation</h3>
                    <p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">
                      Internal-only economics for structured major quotes. Complete the product rows above first, then use this margin foundation as the final internal check.
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
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="builder-field"><span>Section A provider option</span><select value={quote.metadata.customerProvider} onChange={(e) => updateQuote((draft) => { draft.metadata.customerProvider = e.target.value as QuoteRecord["metadata"]["customerProvider"]; return draft; })}><option value="Starlink">Starlink</option><option value="UniSIM">UniSIM</option><option value="T-Mobile">T-Mobile</option></select></label>
              </div>
            </section>

            <section className="builder-panel">
              <div className="builder-panel-header">
                <div><div className="builder-eyebrow">Quick Quote sections</div><h2 className="builder-title">Service, hardware, and labor</h2></div>
                <div className="flex flex-wrap gap-2">
                  <SectionToggle label="Executive Summary" enabled={quote.executiveSummary.enabled} onChange={(next) => updateQuote((draft) => { draft.executiveSummary.enabled = next; return draft; })} />
                  <SectionToggle label="Connectivity service" enabled={quote.sections.sectionA.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionA.enabled = next; return draft; })} />
                  <SectionToggle label="Router & install materials" enabled={quote.sections.sectionB.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionB.enabled = next; return draft; })} />
                  <SectionToggle label="Install / site services" enabled={quote.sections.sectionC.enabled} onChange={(next) => updateQuote((draft) => { draft.sections.sectionC.enabled = next; return draft; })} />
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
                  <div><div className="builder-eyebrow">Quick Quote step 1</div><h2 className="builder-title">Connectivity service line items</h2><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Use this for Starlink, LTE/UniSIM, terminal access fees, support, and data pools or blocks.</p></div>
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
                  <div><div className="builder-eyebrow">Quick Quote step 2</div><h2 className="builder-title">Router and install materials</h2><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Add Starlink terminals when needed, plus routers, mounts, cables, and field-ready install materials.</p></div>
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
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="builder-eyebrow">Recommended items</div><h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#16202b]">Router and materials picker</h3></div><div className="text-[13px] text-[#66717d]">{filteredEquipmentCatalog.length} match(es)</div></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_.8fr]"><label className="builder-field compact"><span>Search Hardware</span><input placeholder="router, mini, mount, cable..." value={equipmentSearch} onChange={(e) => setEquipmentSearch(e.target.value)} /></label><label className="builder-field compact"><span>Category</span><select value={equipmentCategoryFilter} onChange={(e) => setEquipmentCategoryFilter(e.target.value)}>{equipmentCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>
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
                <div className="builder-panel-header"><div><div className="builder-eyebrow">Quick Quote step 3</div><h2 className="builder-title">Install and site service line items</h2><p className="mt-2 text-[13px] leading-[1.5] text-[#60707f]">Use this for site inspection, install allowance, configuration labor, and other simple service rows.</p></div><button type="button" className="pill-button pill-button-active" onClick={addServiceRow}>Add service row</button></div>
                <p className="text-[14px] leading-[1.5] text-[#5c6772]">This section covers site inspection and installation pricing in both budgetary and final states.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="builder-field"><span>Section title</span><input value={quote.sections.sectionC.title} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.title = e.target.value; draft.sections.sectionC.builderLabel = e.target.value; return draft; })} /></label>
                  <label className="builder-field"><span>Section intro / note</span><textarea rows={3} value={quote.sections.sectionC.introText ?? ""} onChange={(e) => updateQuote((draft) => { draft.sections.sectionC.introText = e.target.value; return draft; })} /></label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{servicePresetTemplates.map((preset) => <button key={preset.key} type="button" className="pill-button" onClick={() => addPresetServiceRow(preset.key)}>{preset.label}</button>)}</div>

                <div className="mt-5 space-y-3">{quote.sections.sectionC.lineItems.map((row, index) => <div key={row.id} className="line-editor-card"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Service row {index + 1}</div><div className="mt-1 text-[14px] font-semibold text-[#1a2430]">Optional field service</div></div><RowActions totalRows={quote.sections.sectionC.lineItems.length} rowNumber={index + 1} onMoveUp={() => moveServiceRow(row.id, -1)} onMoveDown={() => moveServiceRow(row.id, 1)} onMoveTo={(targetPosition) => moveServiceRowToPosition(row.id, targetPosition)} onDuplicate={() => duplicateServiceRow(row.id)} onRemove={() => removeServiceRow(row.id)} /></div><div className="grid gap-3 lg:grid-cols-[2fr_.7fr_.8fr_1fr]"><label className="builder-field compact"><span>Description</span><input value={row.description} onChange={(e) => updateServiceRow(row.id, "description", e.target.value)} /></label><label className="builder-field compact"><span>Qty</span><input type="number" value={row.quantity} onChange={(e) => updateServiceRow(row.id, "quantity", e.target.value)} /></label><label className="builder-field compact"><span>Unit price</span><input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateServiceRow(row.id, "unitPrice", e.target.value)} /></label><label className="builder-field compact"><span>Pricing stage</span><select value={row.pricingStage ?? "budgetary"} onChange={(e) => updateServiceRow(row.id, "pricingStage", e.target.value)}><option value="budgetary">Budgetary</option><option value="final">Final</option></select></label></div><label className="builder-field compact mt-3"><span>Notes</span><input value={row.notes ?? ""} onChange={(e) => updateServiceRow(row.id, "notes", e.target.value)} /></label><div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[#66717d]"><span>{row.serviceCategory === "site_inspection" ? "Site inspection" : row.serviceCategory === "installation" ? "Installation" : "Custom service"}</span><span>Line total: {formatCurrency(row.totalPrice, currencyCode)}</span></div></div>)}</div>
              </section>
            )}
            </>
            )}
          </div>

          <aside className="space-y-6">
            {builderLocked ? (
              <section className="builder-panel sticky top-6">
                <div className="builder-panel-header"><div><div className="builder-eyebrow">Customer intake</div><h2 className="builder-title">What’s ready so far</h2></div></div>
                <div className="space-y-4 text-[14px] text-[#32404c]">
                  <div className="summary-block"><div className="summary-label">Customer</div><div className="summary-value">{customerHeadline}</div><div className="summary-subvalue">{customerSubline || "No customer selected yet"}</div></div>
                  <div className="summary-block"><div className="summary-label">Service address</div><div className="summary-value">{customerServiceAddress || "Not set yet"}</div><div className="summary-subvalue">Complete the intake card on the left to continue.</div></div>
                  <div className="rounded-[18px] border border-dashed border-[#d5dbe2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-[1.5] text-[#5e6974]">Once the customer is selected, RapidQuote unlocks quote setup, pricing, preview, and PDF output.</div>
                </div>
              </section>
            ) : (
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
            )}
          </aside>
        </div>
      </div>
    </main>
  ) : <div className="workspace-shell"><div className="workspace-container">Loading proposal builder…</div></div>;
}

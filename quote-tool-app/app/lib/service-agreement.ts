import type {
  QuoteServiceAgreementState,
  ServiceAgreementCategoryKey,
  ServiceAgreementCategoryPricing,
  ServiceAgreementProfile,
  ServicePricingRow,
} from "@/app/lib/quote-record";

export const serviceAgreementCategoryDefinitions: Array<{ key: ServiceAgreementCategoryKey; label: string }> = [
  { key: "rig_up_new_install", label: "Rig Up New Install" },
  { key: "rig_moves", label: "Rig Moves" },
  { key: "rig_decommission", label: "Rig Decommission" },
  { key: "static_site_new_install", label: "Static Site - New Install" },
  { key: "static_site_cancel_terminate", label: "Static Site - Cancel/Terminate" },
  { key: "add_change_remove", label: "Add/Change/Remove equipment or services" },
  { key: "break_fixes_customer_fault", label: "Break Fixes (Customer Fault)" },
  { key: "site_survey", label: "Site Survey" },
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createDefaultServiceAgreementCategoryPricing(
  definition: { key: ServiceAgreementCategoryKey; label: string },
): ServiceAgreementCategoryPricing {
  return {
    key: definition.key,
    label: definition.label,
    rateBasis: "na",
    laborRate: null,
    mileageRate: null,
    notes: "",
  };
}

export function createDefaultServiceAgreementProfile(): ServiceAgreementProfile {
  return {
    agreementLabel: "",
    sourceDocument: undefined,
    signedDate: "",
    acceptedDate: "",
    notes: "",
    categories: serviceAgreementCategoryDefinitions.map((definition) => createDefaultServiceAgreementCategoryPricing(definition)),
    updatedAt: undefined,
  };
}

export function createDefaultQuoteServiceAgreementState(): QuoteServiceAgreementState {
  return {
    useCustomerDefaults: true,
    sourceCustomerProfileId: undefined,
    sourceCustomerProfileName: undefined,
    lastAppliedAt: undefined,
    profile: createDefaultServiceAgreementProfile(),
  };
}

export function normalizeServiceAgreementProfile(value: Partial<ServiceAgreementProfile> | null | undefined): ServiceAgreementProfile {
  const categoryMap = new Map(
    (value?.categories ?? []).map((entry) => [
      entry?.key,
      {
        key: entry?.key,
        label: normalizeText(entry?.label),
        rateBasis: entry?.rateBasis === "standard" || entry?.rateBasis === "non_standard" || entry?.rateBasis === "na" ? entry.rateBasis : "na",
        laborRate: normalizeNullableMoney(entry?.laborRate),
        mileageRate: normalizeNullableMoney(entry?.mileageRate),
        notes: normalizeText(entry?.notes),
      },
    ]),
  );

  return {
    agreementLabel: normalizeText(value?.agreementLabel),
    sourceDocument: normalizeText(value?.sourceDocument?.fileName)
      ? {
          fileName: normalizeText(value?.sourceDocument?.fileName),
          fileUrl: normalizeText(value?.sourceDocument?.fileUrl) || undefined,
          note: normalizeText(value?.sourceDocument?.note) || undefined,
        }
      : undefined,
    signedDate: normalizeText(value?.signedDate),
    acceptedDate: normalizeText(value?.acceptedDate),
    notes: normalizeText(value?.notes),
    categories: serviceAgreementCategoryDefinitions.map((definition) => {
      const existing = categoryMap.get(definition.key);
      return {
        ...createDefaultServiceAgreementCategoryPricing(definition),
        ...existing,
        label: existing?.label || definition.label,
      };
    }),
    updatedAt: normalizeText(value?.updatedAt) || undefined,
  };
}

export function normalizeQuoteServiceAgreementState(
  value: Partial<QuoteServiceAgreementState> | null | undefined,
): QuoteServiceAgreementState {
  return {
    ...createDefaultQuoteServiceAgreementState(),
    ...value,
    sourceCustomerProfileId: normalizeText(value?.sourceCustomerProfileId) || undefined,
    sourceCustomerProfileName: normalizeText(value?.sourceCustomerProfileName) || undefined,
    lastAppliedAt: normalizeText(value?.lastAppliedAt) || undefined,
    profile: normalizeServiceAgreementProfile(value?.profile),
  };
}

export function cloneServiceAgreementProfile(profile: ServiceAgreementProfile): ServiceAgreementProfile {
  return normalizeServiceAgreementProfile(JSON.parse(JSON.stringify(profile)) as ServiceAgreementProfile);
}

export function createQuoteServiceAgreementFromCustomer(params: {
  profile: ServiceAgreementProfile;
  customerProfileId?: string;
  customerName?: string;
}): QuoteServiceAgreementState {
  return {
    useCustomerDefaults: true,
    sourceCustomerProfileId: params.customerProfileId,
    sourceCustomerProfileName: params.customerName,
    lastAppliedAt: new Date().toISOString(),
    profile: cloneServiceAgreementProfile(params.profile),
  };
}

export function buildServiceAgreementNotes(category: ServiceAgreementCategoryPricing) {
  const parts = [
    category.rateBasis === "standard" ? "Standard rate" : category.rateBasis === "non_standard" ? "Non-standard rate" : "N/A",
    category.mileageRate !== null ? `Mileage ${category.mileageRate.toFixed(2)}/mile` : "",
    category.notes?.trim() ?? "",
  ];

  return parts.filter((part) => part.length > 0).join(" | ");
}

export function createServiceRowFromAgreementCategory(
  category: ServiceAgreementCategoryPricing,
  sourceLabel?: string,
): ServicePricingRow {
  const unitPrice = category.laborRate ?? 0;

  return {
    id: `c_sla_${category.key}_${Date.now()}`,
    sourceType: "custom",
    description: category.label,
    quantity: 1,
    unitPrice,
    totalPrice: unitPrice,
    pricingStage: category.rateBasis === "standard" ? "final" : "budgetary",
    serviceCategory: category.key === "site_survey" ? "site_inspection" : "installation",
    serviceAgreementCategoryKey: category.key,
    serviceAgreementRateBasis: category.rateBasis,
    mileageRate: category.mileageRate,
    notes: buildServiceAgreementNotes(category),
    sourceLabel: sourceLabel || "Customer SLA default",
  };
}

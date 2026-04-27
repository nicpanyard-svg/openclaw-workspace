import type { QuoteRecord } from "@/app/lib/quote-record";

export const CUSTOMER_PROFILE_STORE_KEY = "rapidquote:customer-profiles";
export const CUSTOMER_PROFILE_STORE_FALLBACK_KEY = "quote-tool-app:customer-profiles";

export type SavedCustomerProfile = {
  id: string;
  companyName: string;
  customerShortName: string;
  billingAddress: {
    companyName: string;
    attention: string;
    lines: string[];
  };
  shippingAddress: {
    companyName: string;
    attention: string;
    lines: string[];
  };
  shippingSameAsBillTo: boolean;
  serviceAddressLines: string[];
  mainContactName: string;
  mainContactEmail: string;
  mainContactPhone: string;
  defaultOwnerUserId?: string;
  defaultOwnerName?: string;
  createdAt: string;
  updatedAt: string;
};

export function serializeCustomerProfiles(profiles: SavedCustomerProfile[]) {
  return JSON.stringify(profiles);
}

function normalizeProfile(profile: Partial<SavedCustomerProfile> | null | undefined): SavedCustomerProfile | null {
  if (!profile?.id || !profile.companyName?.trim()) return null;

  const createdAt = profile.createdAt ?? new Date().toISOString();
  const updatedAt = profile.updatedAt ?? createdAt;

  return {
    id: profile.id,
    companyName: profile.companyName.trim(),
    customerShortName: profile.customerShortName?.trim() ?? "",
    billingAddress: {
      companyName: profile.billingAddress?.companyName?.trim() ?? profile.companyName.trim(),
      attention: profile.billingAddress?.attention?.trim() ?? profile.mainContactName?.trim() ?? "",
      lines: cleanLines(profile.billingAddress?.lines),
    },
    shippingAddress: {
      companyName: profile.shippingAddress?.companyName?.trim() ?? profile.billingAddress?.companyName?.trim() ?? profile.companyName.trim(),
      attention: profile.shippingAddress?.attention?.trim() ?? profile.billingAddress?.attention?.trim() ?? profile.mainContactName?.trim() ?? "",
      lines: cleanLines(profile.shippingAddress?.lines),
    },
    shippingSameAsBillTo: profile.shippingSameAsBillTo ?? false,
    serviceAddressLines: cleanLines(profile.serviceAddressLines),
    mainContactName: profile.mainContactName?.trim() ?? "",
    mainContactEmail: profile.mainContactEmail?.trim() ?? "",
    mainContactPhone: profile.mainContactPhone?.trim() ?? "",
    defaultOwnerUserId: profile.defaultOwnerUserId?.trim() || undefined,
    defaultOwnerName: profile.defaultOwnerName?.trim() || undefined,
    createdAt,
    updatedAt,
  };
}

export function deserializeCustomerProfiles(value: string | null | undefined): SavedCustomerProfile[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as Partial<SavedCustomerProfile>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((profile) => normalizeProfile(profile))
      .filter((profile): profile is SavedCustomerProfile => Boolean(profile));
  } catch {
    return [];
  }
}

function cleanLines(lines: string[] | undefined) {
  return (lines ?? []).map((line) => line?.trim() ?? "").filter((line) => line.length > 0);
}

export function createCustomerProfileFromQuote(quote: QuoteRecord, profileId?: string): SavedCustomerProfile {
  const now = new Date().toISOString();

  return {
    id: profileId ?? quote.internal.savedCustomerProfileId ?? `customer_${Date.now()}`,
    companyName: quote.customer.name.trim(),
    customerShortName: (quote.metadata.customerShortName ?? "").trim(),
    billingAddress: {
      companyName: (quote.billTo.companyName ?? quote.customer.name).trim(),
      attention: (quote.billTo.attention ?? quote.customer.contactName).trim(),
      lines: cleanLines(quote.billTo.lines),
    },
    shippingAddress: {
      companyName: (quote.shipTo.companyName ?? quote.billTo.companyName ?? quote.customer.name).trim(),
      attention: (quote.shipTo.attention ?? quote.billTo.attention ?? quote.customer.contactName).trim(),
      lines: cleanLines(quote.shipTo.lines),
    },
    shippingSameAsBillTo: quote.shippingSameAsBillTo,
    serviceAddressLines: cleanLines(quote.customer.addressLines),
    mainContactName: quote.customer.contactName.trim(),
    mainContactEmail: quote.customer.contactEmail.trim(),
    mainContactPhone: quote.customer.contactPhone.trim(),
    defaultOwnerUserId: quote.metadata.ownerUserId,
    defaultOwnerName: quote.metadata.ownerName,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyCustomerProfileToQuote(quote: QuoteRecord, profile: SavedCustomerProfile) {
  quote.customer.name = profile.companyName;
  quote.customer.logoText = profile.customerShortName || profile.companyName;
  quote.customer.contactName = profile.mainContactName;
  quote.customer.contactEmail = profile.mainContactEmail;
  quote.customer.contactPhone = profile.mainContactPhone;
  quote.customer.addressLines = [...profile.serviceAddressLines];

  quote.metadata.customerShortName = profile.customerShortName;
  quote.metadata.accountName = profile.companyName;

  if (profile.defaultOwnerUserId) {
    quote.metadata.ownerUserId = profile.defaultOwnerUserId;
  }
  if (profile.defaultOwnerName) {
    quote.metadata.ownerName = profile.defaultOwnerName;
    quote.internal.workspaceOwnerName = profile.defaultOwnerName;
    quote.internal.crmOwnerLabel = profile.defaultOwnerName;
  }
  if (profile.defaultOwnerUserId) {
    quote.internal.workspaceOwnerId = profile.defaultOwnerUserId;
  }

  quote.billTo = {
    companyName: profile.billingAddress.companyName || profile.companyName,
    attention: profile.billingAddress.attention || profile.mainContactName,
    lines: [...profile.billingAddress.lines],
  };

  quote.shippingSameAsBillTo = profile.shippingSameAsBillTo;
  quote.shipTo = profile.shippingSameAsBillTo
    ? {
        companyName: profile.billingAddress.companyName || profile.companyName,
        attention: profile.billingAddress.attention || profile.mainContactName,
        lines: [...profile.billingAddress.lines],
      }
    : {
        companyName: profile.shippingAddress.companyName || profile.companyName,
        attention: profile.shippingAddress.attention || profile.mainContactName,
        lines: [...profile.shippingAddress.lines],
      };

  quote.internal.savedCustomerProfileId = profile.id;

  return quote;
}

export function upsertCustomerProfile(profiles: SavedCustomerProfile[], profile: SavedCustomerProfile) {
  const existingProfile = profiles.find((entry) => entry.id === profile.id);
  const nextProfile: SavedCustomerProfile = existingProfile
    ? {
        ...profile,
        createdAt: existingProfile.createdAt,
        updatedAt: new Date().toISOString(),
      }
    : profile;

  const remaining = profiles.filter((entry) => entry.id !== nextProfile.id);
  return [nextProfile, ...remaining].sort((a, b) => a.companyName.localeCompare(b.companyName));
}

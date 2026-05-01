"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { useAuth } from "@/app/components/auth-shell";
import { CUSTOMER_PROFILE_STORE_FALLBACK_KEY, CUSTOMER_PROFILE_STORE_KEY, deserializeCustomerProfiles, serializeCustomerProfiles, type SavedCustomerProfile } from "@/app/lib/customer-profiles";
import { PROPOSAL_STORE_KEY, createProposalFromQuote, deserializeProposalStore, getDefaultProposalStore, mockUsers, serializeProposalStore } from "@/app/lib/proposal-store";
import { ensureNickTrainingDemoProfiles, ensureNickTrainingDemoProposalStore } from "@/app/lib/nick-training-demo";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

export function RapidQuoteFrontDoor() {
  const { user } = useAuth();
  const [isHydrated, setIsHydrated] = useState(false);
  const [customerProfiles, setCustomerProfiles] = useState<SavedCustomerProfile[]>([]);
  const [activeWorkspaceItemCount, setActiveWorkspaceItemCount] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");

  useEffect(() => {
    const seed = createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] });
    const fallbackStore = getDefaultProposalStore(seed);
    const sessionUser = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.title,
          team: user.team,
        }
      : fallbackStore.currentUser;

    const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const baseStore = savedStore
      ? {
          ...savedStore,
          currentUser: sessionUser,
        }
      : {
          ...fallbackStore,
          currentUser: sessionUser,
        };
    const nextStore = ensureNickTrainingDemoProposalStore(baseStore);

    const savedProfiles = deserializeCustomerProfiles(
      window.localStorage.getItem(CUSTOMER_PROFILE_STORE_KEY) ?? window.localStorage.getItem(CUSTOMER_PROFILE_STORE_FALLBACK_KEY),
    );
    const nextProfiles = ensureNickTrainingDemoProfiles(savedProfiles);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    window.localStorage.setItem(CUSTOMER_PROFILE_STORE_KEY, serializeCustomerProfiles(nextProfiles));

    setCustomerProfiles(nextProfiles);
    setActiveWorkspaceItemCount(nextStore.proposals.filter((proposal) => ["draft", "in_review", "sent"].includes(proposal.status)).length);
    setIsHydrated(true);
  }, [user]);

  const filteredCustomerProfiles = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return customerProfiles
      .slice()
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
      .filter((profile) => {
        if (!query) return true;
        return [
          profile.companyName,
          profile.mainContactName,
          profile.mainContactEmail,
          profile.serviceAddressLines.join(" "),
        ].some((value) => value.toLowerCase().includes(query));
      });
  }, [customerProfiles, customerSearch]);

  const visibleCustomerProfiles = filteredCustomerProfiles.slice(0, 6);

  return isHydrated ? (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-[#232a31] md:px-6 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <section className="rounded-[28px] border border-white/60 bg-[var(--workspace-panel)] p-6 shadow-[0_16px_40px_rgba(75,88,106,0.12)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <ProductLogo className="mt-1" />
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#8a95a3]">RapidQuote start page</div>
                <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.04em] text-[#16202b]">Pick the customer first. Then open the quote builder.</h1>
                <p className="mt-3 max-w-[760px] text-[15px] leading-[1.6] text-[#5d6772]">
                  This is the front door for intake: choose/create the customer, then jump into a clean quote or an existing proposal.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-4 text-[13px] text-[#56616d]"><strong className="block text-[22px] text-[#16202b]">{customerProfiles.length}</strong>saved customer{customerProfiles.length === 1 ? "" : "s"}</div>
              <div className="rounded-[20px] border border-[#dde3e8] bg-[#fbfcfe] px-4 py-4 text-[13px] text-[#56616d]"><strong className="block text-[22px] text-[#16202b]">{activeWorkspaceItemCount}</strong>workspace item{activeWorkspaceItemCount === 1 ? "" : "s"}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-[26px] border border-[#dde3e8] bg-white p-5 shadow-[0_12px_28px_rgba(31,42,52,0.06)]">
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Path 1</div>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#16202b]">Create New Customer</h2>
            <p className="mt-3 text-[14px] leading-[1.55] text-[#5d6772]">Start a clean draft and complete customer intake before the quote builder opens up.</p>
            <ul className="mt-4 space-y-2 text-[13px] text-[#60707f]">
              <li>• New account or one-off opportunity</li>
              <li>• Capture contact, service, bill-to, and ship-to first</li>
              <li>• Best when no saved profile exists yet</li>
            </ul>
            <Link href="/new?mode=new&entry=new-customer" className="mt-5 inline-flex rounded-full bg-[#b00000] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(176,0,0,0.18)]">Start new customer intake</Link>
          </article>

          <article className="rounded-[26px] border border-[#dde3e8] bg-white p-5 shadow-[0_12px_28px_rgba(31,42,52,0.06)]">
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Path 2</div>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#16202b]">Choose Customer</h2>
            <p className="mt-3 text-[14px] leading-[1.55] text-[#5d6772]">Search saved customers, pick the right account, then move straight into quote work.</p>
            <div className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] px-4 py-4 text-[13px] text-[#51606d]">
              <strong className="block text-[#16202b]">Saved profiles ready</strong>
              {customerProfiles.length > 0 ? `${customerProfiles.length} customer profile${customerProfiles.length === 1 ? " is" : "s are"} available.` : "No saved customer profiles yet — create one first."}
            </div>
            <label className="mt-4 block text-[13px] font-medium text-[#51606d]">
              Search customers
              <input
                className="mt-2 w-full rounded-[16px] border border-[#d7dde4] bg-[#fbfcfe] px-4 py-3 text-[14px] text-[#16202b] outline-none"
                placeholder="Company, contact, city, state..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </label>
            <div className="mt-4 space-y-2 text-[13px] text-[#60707f]">
              {visibleCustomerProfiles.map((profile) => (
                <Link key={profile.id} href={`/new?mode=new&entry=select-customer&customerProfileId=${encodeURIComponent(profile.id)}`} className="block rounded-[16px] border border-[#edf1f4] bg-[#fcfdfe] px-3 py-3 transition hover:border-[#b00000] hover:bg-white">
                  <strong className="block text-[#16202b]">{profile.companyName}</strong>
                  <span>{profile.mainContactName || "No contact saved"}</span>
                </Link>
              ))}
            </div>
            {customerProfiles.length > 0 ? (
              <Link href="/new?mode=new&entry=select-customer" className="mt-5 inline-flex rounded-full bg-[#16202b] px-5 py-3 text-[14px] font-semibold text-white">Choose from all customers</Link>
            ) : (
              <span className="mt-5 inline-flex rounded-full bg-[#e7ebef] px-5 py-3 text-[14px] font-semibold text-[#73808c]">No saved customers yet</span>
            )}
          </article>

          <article className="rounded-[26px] border border-[#dde3e8] bg-white p-5 shadow-[0_12px_28px_rgba(31,42,52,0.06)]">
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8b96a3]">Workspace</div>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#16202b]">Manage Proposals</h2>
            <p className="mt-3 text-[14px] leading-[1.55] text-[#5d6772]">Use the workspace for open proposals, ownership, status, totals, and follow-up work.</p>
            <div className="mt-4 rounded-[18px] border border-[#e2e7ec] bg-[#fbfcfe] px-4 py-4 text-[13px] text-[#51606d]">
              <strong className="block text-[#16202b]">Workspace</strong>
              Proposal lists live here so the Start page stays focused on customer intake.
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/workspace" className="inline-flex rounded-full border border-[#d5dce3] bg-white px-5 py-3 text-[14px] font-semibold text-[#24303b]">Open proposal workspace</Link>
            </div>
          </article>
        </section>

      </div>
    </main>
  ) : <div className="workspace-shell"><div className="workspace-container">Loading RapidQuote…</div></div>;
}

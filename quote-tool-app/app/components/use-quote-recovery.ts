"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QuoteRecord } from "../lib/quote-record";
import type { SavedProposalRecord } from "../lib/proposal-store";
import { PROPOSAL_STORE_KEY } from "../lib/proposal-store";
import { deletedProposalKey, withWorkspaceSaveLock } from "../lib/proposal-saving";
import {
  browserSaveError, createIndexedDbRecoveryStore, INITIAL_RECOVERY_STATE, QuoteRecoverySession, recoveryQuoteId,
  type QuoteRecoveryState, type RecoverySaveRequest, type RecoverySaveResult,
} from "../lib/quote-recovery";

export type UseQuoteRecoveryOptions = {
  quote: QuoteRecord;
  isHydrated: boolean;
  savedProposal: SavedProposalRecord | null;
  onSave: (request: RecoverySaveRequest) => RecoverySaveResult | null | Promise<RecoverySaveResult | null>;
  onRecover: (quote: QuoteRecord) => void;
  debounceMs?: number;
  startPaused?: boolean;
};

export function useQuoteRecovery(options: UseQuoteRecoveryOptions) {
  const router = useRouter();
  const { quote, isHydrated } = options;
  const quoteId = recoveryQuoteId(quote);
  const latest = useRef(options);
  const session = useRef<QuoteRecoverySession | null>(null);
  const navigating = useRef(false);
  const [view, setView] = useState<{ quoteId: string; state: QuoteRecoveryState }>({ quoteId: "", state: INITIAL_RECOVERY_STATE });

  useEffect(() => { latest.current = options; });

  const navigate = useCallback(async (href: string) => {
    const current = session.current;
    if (!current || navigating.current) return false;
    navigating.current = true;
    try {
      current.setQuote(latest.current.quote);
      const mayLeave = await current.prepareToLeave(() => window.confirm("Save this recovered draft before leaving? Choose Cancel to keep reviewing it."));
      if (!mayLeave || session.current !== current) return false;
      router.push(href);
      return true;
    } finally { navigating.current = false; }
  }, [router]);

  useEffect(() => {
    if (!isHydrated || !quoteId) return;
    let current: QuoteRecoverySession;
    try {
      current = new QuoteRecoverySession({
        quote: latest.current.quote,
        savedProposal: latest.current.savedProposal,
        storage: window.localStorage,
        history: createIndexedDbRecoveryStore(),
        withLock: withWorkspaceSaveLock,
        onSave: (request) => latest.current.onSave(request),
        onRecover: (recovered) => latest.current.onRecover(recovered),
        onChange: (state) => setView({ quoteId, state }),
        debounceMs: latest.current.debounceMs,
        startPaused: latest.current.startPaused,
      });
    } catch (error) {
      // Report denied storage access after hydration, without breaking the editor.
      queueMicrotask(() => setView({ quoteId, state: { ...INITIAL_RECOVERY_STATE, status: "error", dirty: true, error: browserSaveError(error) } }));
      return;
    }
    session.current = current;
    void current.start();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PROPOSAL_STORE_KEY || event.key === deletedProposalKey(quoteId)) current.checkForExternalChange();
    };
    const onFocus = () => current.checkForExternalChange();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = current.getState();
      if (state.dirty || state.status === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && current.getState().status === "pending") void current.saveNow("autosave");
    };
    const onInternalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.hasAttribute("download") || (target.target && target.target !== "_self")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || !["http:", "https:"].includes(destination.protocol)) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      void navigate(`${destination.pathname}${destination.search}${destination.hash}`);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onInternalLink, true);
    return () => {
      current.dispose();
      if (session.current === current) session.current = null;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onInternalLink, true);
    };
  }, [isHydrated, quoteId, navigate]);

  useEffect(() => { if (isHydrated) session.current?.setQuote(quote); }, [isHydrated, quote]);

  const saveNow = useCallback(() => session.current?.saveNow("manual") ?? Promise.resolve(null), []);
  const recover = useCallback((versionId: string) => session.current?.recover(versionId) ?? Promise.resolve(false), []);
  return { ...(view.quoteId === quoteId && isHydrated ? view.state : INITIAL_RECOVERY_STATE), saveNow, recover, navigate };
}

export type QuoteRecoveryControls = ReturnType<typeof useQuoteRecovery>;

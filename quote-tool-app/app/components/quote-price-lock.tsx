"use client";

import { Lock, LockOpen } from "lucide-react";

export function QuotePriceLock({ locked, label, onChange }: { locked: boolean; label: string; onChange: (locked: boolean) => void }) {
  const action = `${locked ? "Unlock" : "Lock"} unit price for ${label}`;
  return <button type="button" className="rq-icon-button rq-price-lock" data-locked={locked} aria-label={action} aria-pressed={locked} title={action} data-tooltip={action} onClick={() => onChange(!locked)}>
    {locked ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
  </button>;
}

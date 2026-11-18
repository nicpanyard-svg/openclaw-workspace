"use client";

import { Lock, LockOpen } from "lucide-react";

export function QuotePriceLock({ locked, label, onChange }: { locked: boolean; label: string; onChange: (locked: boolean) => void }) {
  const action = `${locked ? "Unlock" : "Lock"} unit price for ${label}`;
  const explanation = locked ? "Allow manual and bulk changes to this unit price." : "Keep this unit price unchanged. Quantity can still change the total.";
  return <button type="button" className="rq-icon-button rq-price-lock" data-locked={locked} aria-label={action} aria-pressed={locked} title={explanation} data-tooltip={explanation} onClick={() => onChange(!locked)}>
    {locked ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
  </button>;
}

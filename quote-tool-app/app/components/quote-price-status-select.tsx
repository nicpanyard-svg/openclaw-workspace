"use client";

import { getQuoteLinePriceProblem, getQuoteLinePriceStatus, QUOTE_PRICE_STATUSES, QUOTE_PRICE_STATUS_LABELS, type QuotePriceSource } from "../lib/quote-price-status";
import type { QuotePriceStatus } from "../lib/quote-record";

export function QuotePriceStatusSelect({ line, onChange, label = "Pricing status", disabled, className }: {
  line: QuotePriceSource;
  onChange: (status: QuotePriceStatus) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const problem = getQuoteLinePriceProblem(line);
  return <select aria-label={label} aria-invalid={problem ? true : undefined} title={problem ?? label}
    className={className} disabled={disabled} value={getQuoteLinePriceStatus(line)}
    onChange={event => onChange(event.target.value as QuotePriceStatus)}>
    {QUOTE_PRICE_STATUSES.map(status => <option key={status} value={status}>{QUOTE_PRICE_STATUS_LABELS[status]}</option>)}
  </select>;
}

"use client";

import { useId } from "react";
import { getQuoteLinePriceProblem, getQuoteLinePriceStatus, QUOTE_PRICE_STATUSES, QUOTE_PRICE_STATUS_LABELS, QUOTE_PRICE_STATUS_HELP, type QuotePriceSource } from "../lib/quote-price-status";
import type { QuotePriceStatus } from "../lib/quote-record";
import "./quote-price-status-select.css";

export function QuotePriceStatusSelect({ line, onChange, label = "Pricing status", disabled, className }: {
  line: QuotePriceSource;
  onChange: (status: QuotePriceStatus) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const problem = getQuoteLinePriceProblem(line);
  const status = getQuoteLinePriceStatus(line);
  const helpId = useId();
  const help = problem ?? QUOTE_PRICE_STATUS_HELP[status];
  return <span className="rq-price-status-field">
    <select aria-label={label} aria-describedby={helpId} aria-invalid={problem ? true : undefined} title={help}
    className={className} disabled={disabled} value={status}
    onChange={event => onChange(event.target.value as QuotePriceStatus)}>
    {QUOTE_PRICE_STATUSES.map(status => <option key={status} value={status}>{QUOTE_PRICE_STATUS_LABELS[status]}</option>)}
    </select>
    <span id={helpId} className="rq-price-status-help" data-error={Boolean(problem)}>{help}</span>
  </span>;
}

import type { QuoteLineBilling } from "@/app/lib/quote-record";

export function QuoteBillingSelect({ billing, label, onChange, cadences = ["one_time", "monthly", "annual"] }: {
  billing: QuoteLineBilling;
  label: string;
  onChange: (billing: QuoteLineBilling) => void;
  cadences?: QuoteLineBilling["cadence"][];
}) {
  const value = billing.cadence === "annual" && billing.startsYear === 2 ? "annual_renewal" : billing.cadence;
  return <select aria-label={label} title={value === "annual_renewal" ? `${label}: first year included; annual renewal from Year 2` : label} value={value} onChange={(event) => {
    const selected = event.target.value;
    onChange({ ...billing, cadence: selected === "annual_renewal" ? "annual" : selected as QuoteLineBilling["cadence"], startsYear: selected === "annual_renewal" ? 2 : 1 });
  }}>
    {cadences.includes("one_time") && <option value="one_time">One-time</option>}
    {cadences.includes("monthly") && <option value="monthly">Monthly</option>}
    {cadences.includes("annual") && <option value="annual">Annual prepaid</option>}
    {cadences.includes("annual") && <option value="annual_renewal">Annual / Year 2</option>}
  </select>;
}

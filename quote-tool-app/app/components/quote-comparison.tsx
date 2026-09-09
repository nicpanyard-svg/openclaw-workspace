"use client";

import { useMemo, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { getComparisonScenarios } from "@/app/lib/quote-experience";
import { QuoteExperienceDialog } from "./quote-experience-dialog";

export function QuoteComparison({
  quote,
  onSelect,
  onClose,
}: {
  quote: QuoteRecord;
  onSelect: (id: string, mode: "options" | "terms") => void;
  onClose: () => void;
}) {
  const hasOptions =
    quote.metadata.workflowMode === "major_project" &&
    Boolean(quote.majorProject?.enabled);
  const [mode, setMode] = useState<"options" | "terms">(
    hasOptions ? "options" : "terms",
  );
  const scenarios = useMemo(
    () => getComparisonScenarios(quote, mode),
    [quote, mode],
  );
  const money = (amount: number | null) =>
    amount == null
      ? "Agreement required"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: quote.metadata.currencyCode || "USD",
        }).format(amount);
  return (
    <QuoteExperienceDialog
      title="Compare options"
      onClose={onClose}
      className="qx-comparison"
    >
      <div className="qx-comparison-body">
        <div className="qx-tabs" aria-label="Comparison type">
          {hasOptions && (
            <button
              type="button"
              aria-pressed={mode === "options"}
              onClick={() => setMode("options")}
            >
              Project options
            </button>
          )}
          <button
            type="button"
            aria-pressed={mode === "terms"}
            onClick={() => setMode("terms")}
          >
            Purchase & lease
          </button>
        </div>
        <div className="qx-comparison-context">
          <strong>{quote.customer.name}</strong>
          <span>{quote.metadata.documentTitle}</span>
        </div>
        {mode === "terms" && !quote.metadata.hasActiveDataAgreement && (
          <p className="qx-price-status">
            Lease payments pending active data agreement.
          </p>
        )}
        <div
          className="qx-comparison-scroll"
          tabIndex={0}
          aria-label="Option pricing comparison"
        >
          <table>
            <caption className="sr-only">
              Customer prices by option, excluding optional items
            </caption>
            <thead>
              <tr>
                <th scope="col">Quoted charges</th>
                {scenarios.map((scenario) => (
                  <th
                    key={scenario.id}
                    scope="col"
                    data-selected={scenario.selected}
                  >
                    <span>{scenario.label}</span>
                    {scenario.selected && (
                      <small>
                        <Check size={13} />
                        Current
                      </small>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mode === "options" && (
                <tr>
                  <th scope="row">Sites</th>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id}>{scenario.siteCount}</td>
                  ))}
                </tr>
              )}
              <tr className="qx-compare-monthly">
                <th scope="row">Monthly payment</th>
                {scenarios.map((scenario) => (
                  <td key={scenario.id}>{money(scenario.monthly)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">One-time charges</th>
                {scenarios.map((scenario) => (
                  <td key={scenario.id}>{money(scenario.oneTime)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Year 1 annual subscriptions</th>
                {scenarios.map((scenario) => (
                  <td key={scenario.id}>{money(scenario.annualFirstYear)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Annual renewal / Year 2</th>
                {scenarios.map((scenario) => (
                  <td key={scenario.id}>
                    {money(scenario.annualRenewal)} / yr
                  </td>
                ))}
              </tr>
              <tr className="qx-compare-option">
                <th scope="row">Optional items</th>
                {scenarios.map((scenario) => (
                  <td key={scenario.id}>
                    {scenario.options.items.length} excluded
                  </td>
                ))}
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Selection</th>
                {scenarios.map((scenario) => (
                  <td key={scenario.id}>
                    <button
                      type="button"
                      className="qx-button"
                      aria-label={
                        scenario.selected
                          ? `${scenario.label} selected`
                          : `Use ${scenario.label}`
                      }
                      disabled={scenario.selected || scenario.monthly == null}
                      onClick={() => onSelect(scenario.id, mode)}
                    >
                      {scenario.selected ? (
                        <Check size={15} />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                      {scenario.selected ? "Selected" : "Use option"}
                    </button>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="qx-comparison-note">
          Alternative configurations, not a combined order. Annual subscriptions
          remain billed annually. Usage charges and optional items are excluded
          from these totals.
        </p>
      </div>
    </QuoteExperienceDialog>
  );
}

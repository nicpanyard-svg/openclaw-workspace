"use client";

import { Fragment, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import "./quote-line-table.css";

export type QuoteLineTableRow = {
  id: string;
  accessibleName: string;
  description: ReactNode;
  quantity: ReactNode;
  rate: ReactNode;
  cadence: ReactNode;
  total: ReactNode;
  optional: boolean;
  onOptionalChange: (checked: boolean) => void;
  details?: ReactNode;
  actions?: ReactNode;
};

export type QuoteLineTableProps = {
  label: string;
  rows: QuoteLineTableRow[];
  emptyMessage?: string;
};

function QuoteLine({ row }: { row: QuoteLineTableRow }) {
  // The parent's row key keeps expansion with the item when rows reorder.
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const hasDetails = row.details != null && typeof row.details !== "boolean";
  const hasActions = row.actions != null && typeof row.actions !== "boolean";

  return (
    <Fragment>
      <tr
        className="rq-line-table__row"
        role="row"
        data-optional={row.optional}
        data-expanded={hasDetails && expanded}
      >
        <td className="rq-line-table__cell rq-line-table__expansion" role="cell">
          {hasDetails && (
            <button
              className="rq-line-table__expand-button"
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={`${expanded ? "Collapse" : "Expand"} details for ${row.accessibleName}`}
              title={`${expanded ? "Collapse" : "Expand"} details for ${row.accessibleName}`}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? (
                <ChevronDown size={18} aria-hidden="true" />
              ) : (
                <ChevronRight size={18} aria-hidden="true" />
              )}
            </button>
          )}
        </td>
        <th
          className="rq-line-table__cell rq-line-table__item"
          scope="row"
          role="rowheader"
        >
          <span className="rq-line-table__mobile-label" aria-hidden="true">Item</span>
          <div className="rq-line-table__value">{row.description}</div>
        </th>
        <td className="rq-line-table__cell rq-line-table__quantity" role="cell">
          <span className="rq-line-table__mobile-label" aria-hidden="true">Qty</span>
          <div className="rq-line-table__value">{row.quantity}</div>
        </td>
        <td className="rq-line-table__cell rq-line-table__rate" role="cell">
          <span className="rq-line-table__mobile-label" aria-hidden="true">Unit price</span>
          <div className="rq-line-table__value">{row.rate}</div>
        </td>
        <td className="rq-line-table__cell rq-line-table__cadence" role="cell">
          <span className="rq-line-table__mobile-label" aria-hidden="true">Billing</span>
          <div className="rq-line-table__value">{row.cadence}</div>
        </td>
        <td className="rq-line-table__cell rq-line-table__optional" role="cell">
          <label className="rq-line-table__optional-label">
            <input
              className="rq-line-table__checkbox"
              type="checkbox"
              checked={row.optional}
              aria-label={`Optional item: ${row.accessibleName}`}
              onChange={(event) => row.onOptionalChange(event.currentTarget.checked)}
            />
            <span>Optional</span>
          </label>
        </td>
        <td className="rq-line-table__cell rq-line-table__total" role="cell">
          <span className="rq-line-table__mobile-label" aria-hidden="true">Total</span>
          <div className="rq-line-table__value">{row.total}</div>
        </td>
        <td className="rq-line-table__cell rq-line-table__actions" role="cell">
          {hasActions && (
            <>
              <span className="rq-line-table__mobile-label" aria-hidden="true">Actions</span>
              <div className="rq-line-table__action-list">{row.actions}</div>
            </>
          )}
        </td>
      </tr>
      {hasDetails && (
        <tr
          id={detailsId}
          className="rq-line-table__details-row"
          role="row"
          hidden={!expanded}
        >
          <td className="rq-line-table__details-cell" colSpan={8} role="cell">
            <div className="rq-line-table__details">{row.details}</div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function QuoteLineTable({
  label,
  rows,
  emptyMessage = "No items added.",
}: QuoteLineTableProps) {
  return (
    <div className="rq-line-table-container">
      {/* Explicit roles preserve table semantics when mobile CSS changes display. */}
      <table className="rq-line-table" role="table">
        <caption className="rq-line-table__caption">{label}</caption>
        <colgroup>
          <col className="rq-line-table__col-expansion" />
          <col />
          <col className="rq-line-table__col-quantity" />
          <col className="rq-line-table__col-rate" />
          <col className="rq-line-table__col-cadence" />
          <col className="rq-line-table__col-optional" />
          <col className="rq-line-table__col-total" />
          <col className="rq-line-table__col-actions" />
        </colgroup>
        <thead className="rq-line-table__head" role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader"><span className="rq-line-table__sr-only">Details</span></th>
            <th scope="col" role="columnheader">Item</th>
            <th className="rq-line-table__numeric-heading" scope="col" role="columnheader">Qty</th>
            <th className="rq-line-table__numeric-heading" scope="col" role="columnheader">Unit price</th>
            <th scope="col" role="columnheader">Billing</th>
            <th scope="col" role="columnheader">Optional</th>
            <th className="rq-line-table__numeric-heading" scope="col" role="columnheader">Total</th>
            <th scope="col" role="columnheader"><span className="rq-line-table__sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.length === 0 ? (
            <tr className="rq-line-table__empty-row" role="row">
              <td className="rq-line-table__empty" colSpan={8} role="cell">{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row) => <QuoteLine key={row.id} row={row} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

export default QuoteLineTable;

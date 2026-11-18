# Bulk Pricing And Negotiated Price Locks

## Scope

- Major Project component selection, presets (15%, 30%, 55%), custom margin,
  reviewed price changes, and per-item/bulk unit-price locks.
- Legacy simple-row locks survive migration into the current component editor.
- Quick Quote bulk pricing is deferred until it has per-item vendor costs.
- Valid deliberate selling-price edits clear old TBD status in the existing
  Quick Quote equipment/service/monthly editors and Major Project rows.
  Allowance and Included are not silently changed.
- No production deployment and no changes to actual customer quote data.

## Safeguards

- Cost / (1 - margin) is rounded to unit cents before quantity extension.
- Reject invalid margins and stale previews. No partial stale application.
- Skip locked, Included, pass-through, negative-credit, invalid-cost, and
  mismatched-cost lines. Quick Quote aggregate cost allocations are not unit costs.
- Required and optional totals stay separate, as do billing cadence and start year.
  Usage rates are shown individually rather than as a fixed charge.
- Locks protect unit price, not quantity. A changed quantity recalculates the
  extension at the negotiated unit price.
- Filter, option, mode, and quote changes clear the relevant row selection.
- Costs and internal controls do not appear in customer proposal/pro forma HTML.

## Verification

- Full automated suite: 539 passing tests.
- Scoped ESLint: zero errors; 10 existing warnings in the large quote editor.
- TypeScript: passed.
- Production build: passed on retry after the existing security reminder.
- Browser regression: pricing preview, cancel/apply, skips, locks, quantity
  changes, save/reopen, and legacy simple-row migration passed on synthetic quotes.
- Existing browser save/copy/conflict/recovery regression passed.
- Proposal and pro forma PDF generation regression passed.
- Desktop (1440px) and mobile (390px/320px) pricing preview screenshots inspected.
- Final production-build browser run passed, including invalid-margin blocking,
  Escape/cancel, filter selection reset, and manual price confirmation.

The Next.js build reports an existing security advisory. This work does not
upgrade Next.js or resolve that warning. Address it separately before release.

## Follow-Up

See `quote-workflow-roadmap-2026-11-18.md` for the updated order, including safe
BOM re-imports, WEST acceptance, accessory checks, linked device subscriptions,
undo, procurement, RFQ privacy, and the engineering handoff.

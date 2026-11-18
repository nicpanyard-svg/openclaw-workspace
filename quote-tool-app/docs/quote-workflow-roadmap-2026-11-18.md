# RapidQuote Workflow Update Plan

Updated November 18, 2026. Browser-only saving remains the agreed scope.
Local implementation is not a production release. Do not publish until the
release checks and WEST acceptance test below are complete.

## Phase 1: Save And Quote Safety

Implemented locally in `1b6ec79`:

- Browser autosave, recoverable snapshots, and clear save location.
- Same-browser tab conflict checks: stale revisions cannot overwrite newer work.
- Confirmed, Allowance, TBD, and Included pricing states.
- Required unpriced items remain visible and block a final priced export.
- Copy review for equipment, services, terms, and attachments.
- Linked internal/customer labels unless deliberately overridden.

Limits: browser-only saving cannot coordinate two people on separate computers.
Shared, multi-user conflict control requires account-backed storage and server
revision checks. That migration is deferred by request, not implemented.

## Phase 2: Faster, Consistent Pricing

Implemented and verified locally:

- Multi-row selection in the Major Project component editor, with legacy
  simple-row pricing and lock compatibility.
- 15%, 30%, 55%, and custom margin previews before applying prices.
- Negotiated unit-price locks, including protection from legacy import-pricing actions.
- Skip missing or inconsistent costs, Included items, pass-throughs, and credits.
- Keep required/optional and one-time/monthly/annual amounts separate.
- Reject a preview if its source quantities, costs, prices, locks, or option change.
- Clear stale TBD when a valid selling price is deliberately entered or applied.
- Preserve price locks through browser save/reopen and normal Major Project mapping.

Quick Quote currently has aggregate cost totals, not per-item vendor costs.
Do not infer those costs for bulk margin calculations. Add explicit per-item
cost inputs before bringing the bulk-margin feature into Quick Quote.

## Phase 3: Safe BOM Updates And Revision Review

Next priority, before expanding assembly workflows:

- Stable item IDs and manufacturer part numbers for BOM matching.
- Preview added, changed, removed, unmatched, and ambiguous rows before re-import.
- Description edits must not break an established import link.
- Keep negotiated prices, customer labels, optional flags, attachments, and bundle
  assignments unless the user approves a specific change.
- Keep BOM, bundles, customer preview, and PDF in agreement after each update.
- Compare revisions by equipment, quantity, price, and billing change.
- Make row deletion, bulk repricing, and attachment replacement easy to undo.

## Phase 4: Complete Assemblies And Device Services

Prioritize these two WEST safeguards:

- Required-accessory checks for mounts, enclosures, power, antennas, and wiring.
  Flag missing items; do not silently add equipment or costs.
- Link endpoint subscriptions to device quantities. Optional equipment must
  carry its related optional monthly charges without entering the base total.

Then add reusable complete assemblies with an internal BOM and clean customer
package labels, supporting multiple drawings and spec sheets.

## Phase 5: Purchasing, RFQs, And Engineering Handoff

- Exact manufacturer part number, supplier, price date, expiration, lead time,
  and freight allowance.
- Separate retail estimates from confirmed supplier quotes.
- RFQs from selected items, with controls to omit customer identity,
  proprietary product names, and selling prices.
- Engineering handoff with approved BOM, drawings, wiring references,
  installation responsibilities, and unresolved questions.
- Excel row paste, keyboard navigation, compact tables, and collapsed advanced
  fields. Multi-row selection begins in Phase 2; the other editing tools remain planned.

## WEST Acceptance Gate

Use the real WEST quote in a reviewed copy before release. Synthetic regression
tests are useful but do not replace this real-quote check.

- Optional equipment and optional services stay outside base totals.
- Monthly, annual, and one-time charges remain clearly separated.
- Required unpriced items stay visible.
- Removing equipment removes only its unused attachments and applicable terms;
  shared documents and terms needed by other items remain.
- Save, reopen, copy, customer preview, PDF, and workbook agree.
- Stale tabs cannot replace a newer saved version.
- Re-import correctly identifies changed descriptions, quantities, and parts.
- Device and service quantities agree; missing accessories are flagged.
- Customer exports contain no internal costs, margins, or supplier-only notes.
- Supplier RFQ redaction choices are respected.

WEST acceptance is pending. The later-phase features above are not complete.
An existing Next.js security advisory also needs a separate reviewed remediation
before production release; this pricing change does not resolve it.

# RapidQuote Salesforce CPQ Readiness

Date: 2026-05-17

This document turns the open CPQ/architecture backlog into repo-backed operating rules instead of leaving the readiness model only in issue text.

## Parent track: #26

RapidQuote remains standalone-first today, but the quote model should be safe to map into Salesforce later without rebuilding the core proposal engine.

The core principle is:

- RapidQuote owns quote math, customer-facing output, approval artifacts, and revision lineage.
- CRM connectors attach references and sync payloads around that core model.

Supporting code anchors:

- `app/lib/cpq-governance.ts`
- `app/lib/crm.ts`
- `app/lib/quote-record.ts`
- `app/lib/proposal-store.ts`
- `app/lib/proposal-state.ts`
- `docs/crm-neutral-architecture.md`

## Verified already implemented

### #25 Vendor and manufacturer/service provider dropdowns

This is already present in the mapped Major Project builder:

- vendor preset dropdown
- manufacturer / service provider preset dropdown
- `Custom` entry path for both

Primary surface:

- `app/components/quote-preview.tsx`

Reference walkthrough:

- `docs/issue-25-demo-walkthrough.md`

### #2 SLA in install / install-pricing workflow

The current builder already integrates SLA/service-agreement defaults into the install/service pricing path rather than keeping them as a disconnected side system.

Current integrated behavior:

- SLA defaults live next to Section C pricing
- saved customer defaults can be pulled directly into quote-level service pricing
- SLA categories can seed Section C rows

Primary surfaces:

- `app/components/quote-preview.tsx`
- `app/lib/service-agreement.ts`

## #27 Stable quote data model

RapidQuote should keep one durable internal quote record even when no CRM is connected.

Model rules:

- `QuoteRecord` is the canonical quote container.
- `governance` carries schema version, quote family, revision identity, and future account/opportunity mapping keys.
- `metadata` remains customer-visible/business-facing.
- `internal` remains workspace/runtime-focused.
- `integrations` stores connector references instead of leaking CRM IDs into core quote structures.

Current stabilization added:

- `QuoteGovernanceState`
- `governance.quoteFamilyId`
- `governance.revisionId`
- `governance.revisionNumber`
- `governance.revisionLabel`
- `governance.accountKey`
- `governance.opportunityKey`

## #28 Bundle, line item, and pricing architecture

Pricing ownership rules:

- internal components or Quick Quote rows own cost math
- bundles are packaging/grouping layers
- customer quote lines are presentation layers
- proposal sections and exports render from those structured layers, not from detached UI-only summaries

This keeps:

- standalone quoting usable now
- future CPQ mapping possible later
- cost ownership out of presentation-only rows

See:

- `app/lib/cpq-governance.ts` `RAPIDQUOTE_PRICING_ARCHITECTURE_RULES`

## #29 Customer, account, and opportunity mapping

Standalone-first mapping rules:

- customer block remains the immediate quote-side contact and proposal recipient
- bill-to / ship-to remain quote-local operational addresses
- `metadata.accountId` / `accountName` represent account context when known
- `metadata.opportunityId` / `opportunityName` reserve standalone-first opportunity identity
- CRM-specific IDs stay in `integrations.quoteReferences`

This lets RapidQuote:

- work without Salesforce
- preserve a stable mapping target for future Account / Contact / Opportunity sync

## #30 Revision and versioning rules

Revision rules:

- every quote belongs to a `quoteFamilyId`
- a copied quote starts a new family at revision `1.0`
- future true revisions should retain family identity and increment revision number
- active draft edits do not create a new revision automatically
- revision lineage is internal-first and should not depend on CRM availability

Current code support:

- copied quotes now reset to revision `1.0`
- copied quotes receive fresh governance state
- governance normalization backfills revision identity for older stored quotes

Future UI rule:

- add an explicit `Create Revision` action when the product is ready to distinguish revisioning from generic quote copying

## #31 Approval state model

The approval-state expansion work is already implemented.

Guiding rule:

- approval stage must remain an internal workflow state that can later be pushed into Salesforce, not the other way around

## #32 Export and output consistency

Output consistency rules:

- proposal HTML is the primary customer-facing content model
- PDF is derived from the same proposal content
- workbook uses the same commercial drivers even when it presents them differently for internal reviewers
- downstream sync payloads consume finalized quote/output state rather than recalculating economics outside RapidQuote

See:

- `app/lib/cpq-governance.ts` `RAPIDQUOTE_OUTPUT_CONSISTENCY_RULES`
- `docs/proposal-html-pdf-parity-review.md`

## #33 Salesforce sync contract

Sync contract rules:

- RapidQuote pushes quote math, totals, revision labels, approval status, and output references
- Salesforce provides external identity and pipeline linkage when connected
- account/contact/opportunity references can be shared
- external IDs are references only; they do not replace internal quote lineage

Current code support:

- first-class `opportunity` reference slot added in CRM quote references
- expanded default field mappings for status, revision version, opportunity name, and output totals

See:

- `app/lib/crm.ts`
- `app/lib/cpq-governance.ts` `RAPIDQUOTE_SALESFORCE_SYNC_CONTRACT`

## #34 Reduce core quote-builder UI churn

Builder stability rules:

- keep customer identity, workflow mode, quote identity, and status stable
- avoid duplicating controls that edit the same pricing truth in multiple places
- keep SLA defaults embedded in install/service pricing
- keep Major Project component ownership stable even when presentation layers evolve

This issue should be treated as guardrails on future builder work, not as license for broad refactors.

See:

- `app/lib/cpq-governance.ts` `RAPIDQUOTE_BUILDER_STABILITY_RULES`

## Practical readiness summary

RapidQuote is now better defined as:

- standalone-first quote engine
- internal source of truth for quote economics and output
- CRM-neutral at the core
- Salesforce-mappable through explicit governance and sync contracts

What still belongs in future product work:

- explicit revision-creation UI
- real connector execution instead of static mapping/config
- broader builder UX simplification over time

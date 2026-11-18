# Quote Workflow Safety

## Scope

Implemented the first three workflow priorities with three parallel agents, then integrated and verified the combined changes. Saving remains browser-only, as requested. No Microsoft 365 sign-in or cloud storage was added. Nothing was pushed or deployed.

Bulk margins/price locks, expanded assemblies, and supplier RFQs are not part of this release.

## Changes

- Builder autosaves drafts to the existing browser Workspace after a short debounce. Incomplete customer/pricing details do not prevent draft saving. Existing quote status is preserved.
- The save indicator explicitly names this browser. IndexedDB keeps up to eight recovery snapshots per quote, bounded by per-quote and total storage limits. Recovery is local, not a backup across devices.
- Recovery loads a draft without replacing the saved version. Autosave pauses until the user saves. Internal navigation flushes pending edits, and browser unload warns about unsaved work.
- Shared write locks, revision checks, deletion markers, and verified writes protect against stale tabs, deleted-quote resurrection, unreadable stores, and quota failures.
- Quick Quote and Major Project line items support Confirmed, Allowance, TBD, and Included. Nonzero legacy prices infer Confirmed. Zero prices do not imply free service: explicitly choose Included when appropriate. Selecting a status does not change money or quantity.
- Required unresolved pricing blocks customer PDF/pro forma exports. Optional TBD remains visible. Labels survive normalization, Quick-to-Major conversion, mapped bundles, customer HTML, and PDF output.
- All three duplicate entry points use a review dialog. Equipment/services, terms, line specs, and supporting files can be retained or removed. Different-customer copies clear identity/profile links, stale customer prose, agreements, and order confirmations. The source remains unchanged.
- Major Project item/customer labels follow each other unless the customer label is deliberately overridden. Existing custom wording is preserved.

## Verification

- Full automated suite: 491 passed, zero failures.
- Production build: completed successfully on retry. The first run completed compilation, TypeScript, and static generation but stopped with an existing Next.js security advisory. No dependency version was changed or security remediation claimed.
- Changed TypeScript/TSX files: lint completed with zero errors and 19 warnings, including existing image/unused-code warnings and a now-unused effect-rule suppression.
- `scripts/verify-workflow-safety.ts`: isolated browser fixtures verified autosave/reload, pricing preflight, label linking/overrides, older-tab conflict handling, explicit recovery, immediate navigation save, different-customer copy cleanup, and desktop/mobile layouts.
- `scripts/verify-pricing-output.ts`: actual proposal and pro forma API exports passed text checks for Allowance, Included, and optional TBD. Pro forma totals remained $2,692.25 for the regression fixture; no signature lines were restored. Generated pages were rendered and visually inspected.
- Test data lived only in disposable browser profiles. The user's Edge quotes, passwords, and customer files were not modified. No emails were sent.

## Local Evidence

- Unit tests: `tmp/workflow-tests-final.log`
- Build: `tmp/workflow-build-retry.log`
- Lint: `tmp/workflow-lint-final.log`
- Browser results/screenshots: `tmp/workflow-safety-qa/1794960586971`
- PDF results/renders: `tmp/pricing-output-qa/1794960556828`
- Local production preview: `http://localhost:3017`

## Remaining Considerations

- Browser data clearing, browser profile loss, or device loss can remove quotes and recovery history. Use the existing backup export for a separate copy.
- An older tab with a save conflict keeps its edits but cannot overwrite the current saved quote. Reopen the latest Workspace record to continue safely.
- Existing PDF pagination can leave an options heading/table header at the bottom of a page before the option rows continue. This batch did not redesign pagination.
- The existing Next.js advisory needs a separate, verified dependency update before treating the application as security-reviewed.
- The unrelated SARA reference document remains untouched. Production deployment still requires an explicit request and a scoped release review because local HEAD includes earlier unpublished work.

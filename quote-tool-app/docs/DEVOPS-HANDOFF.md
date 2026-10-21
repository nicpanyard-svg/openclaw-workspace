# RapidQuote DevOps handoff

Prepared October 21, 2026 for the DevOps and application engineering teams.

RapidQuote is being handed over as an interim quoting application with a defined path to managed production operation. Keep the existing quote workflow and records usable during the transition. This package contains source, configuration, templates, tests, and operating instructions. It does not extract live users' browser data or change the currently deployed site.

## Why the interim design uses browser records

The business needs a working quote tool before DevOps has provisioned the final environment. Browser persistence lets users create, edit, save, reopen, and export quotes without waiting for a database, company identity integration, or shared file storage. Nick explicitly requested retaining this behavior until DevOps stands up the managed service.

Quote records hold the commercial state, ownership, status, terms, and history together. Pricing and document generation live in reusable TypeScript modules. This preserves the quoting behavior and gives the migration a concrete data contract to carry forward.

The browser is the interim record location. Records belong to one browser profile and origin; another machine, profile, hostname, or port will not see them automatically. Clearing site data can remove them. This arrangement is appropriate for the explicitly retained interim workflow; it is not the final shared system of record. The browser sign-in and local role directory are prototype functionality, not server-enforced identity or authorization.

## What was prepared

- Corrected customer review so quotes without an included data service do not display overage-decision or overage-price warnings. Saved answers and prices remain unchanged. Final quote confirmation and applicable pricing warnings still apply.
- Preserved existing storage keys and record structure. No browser data was reset or migrated.
- Added quote backup and restore with saved quote records plus available attachment bytes. Restore preserves existing records and skips matching IDs. SHA-256 checks detect attachment corruption; company-environment checks prevent accidental cross-company restore. These checks do not establish the trustworthiness of a backup's author.
- Wait for IndexedDB transaction completion before reporting an attachment save as successful.
- Added a reproducible Node test command, declared canvas/test-runner dependencies, type checking, and release/configuration checks.
- Updated Next.js to 16.4.2, the matching lint configuration, and SheetJS to the official 0.20.3 distribution. Applied compatible transitive dependency fixes. Remaining advisories are listed below.
- Bound import/PDF request bodies to 4 MiB, reject malformed payloads, check PDF signatures, and reject browser cross-site requests. Structured errors include a correlation ID without returning internal exception details.
- Validate PDF cache tokens before filesystem access. PDF rendering uses a configured trusted app origin outside localhost, limits network loads to that origin, and requires a rendered proposal before returning a PDF.
- Added an optional restricted-pilot HTTP Basic access gate, checked by the application proxy and each document API. An enabled gate fails closed if credentials are missing or invalid. Existing local use remains the default.
- Added response hardening headers, a minimal health endpoint, Node.js 24 configuration, secret-file exclusions, and deterministic `npm ci` installs.

## Validation status

See `VALIDATION.txt` for the final checks performed for this package, including build status and known limits. Historical notes are retained in `handoff-history.txt`; they describe earlier deployments and must not be treated as verification of this package.

## Application map

| Area | Location |
| --- | --- |
| Quote editor and final review | `app/components/quote-preview.tsx`, `customer-output-settings.tsx` |
| Saved quote list | `app/components/quote-workspace.tsx` |
| Quote contract and pricing | `app/lib/quote-record.ts`, `commercial-model.ts`, `major-project.ts` |
| Browser persistence | `app/lib/proposal-store.ts`, `proposal-state.ts`, `proposal-saving.ts` |
| Backup format and restore | `app/lib/quote-backup.ts`, `app/components/quote-backup-controls.tsx` |
| Attachment persistence | `app/lib/major-project-spec-attachments.ts` |
| Customer output | `app/components/proposal-document.tsx` |
| Server PDF rendering | `app/api/proposal-pdf/route.tsx`, `app/lib/proposal-html-pdf.ts` |
| Workbook and vendor PDF imports | `app/api/major-project-bom-parse`, `app/api/vendor-quote-pdf-parse` |
| Prototype account directory | `app/lib/auth.ts`, `app/components/auth-shell.tsx` |
| Optional deployment gate | `proxy.ts`, `app/lib/server-access.ts` |

## Interim operation and recovery

1. Continue using the same browser profile and site address. Keep the current company environment (`inet` or `ilios`); changing it changes the storage namespace.
2. Save open drafts before backing up. Download a backup after material changes and before browser/device/domain changes. Store it in approved company storage; backups contain confidential quote data and are not encrypted by the app.
3. Review any missing-attachment notice. Missing local files cannot be recovered by the backup process. Reattach them and create another backup.
4. Test a restore in a separate browser profile. Confirm quote count, identifiers, owners, prices, terms, history, and sample attachment exports.
5. Restore adds missing IDs and retains existing ones regardless of timestamp. This deliberately avoids overwriting newer work. It is not cross-device synchronization or automatic conflict resolution.
6. A ZIP contains a versioned `manifest.json` and `attachments/*.bin`. Attachment hashes and metadata are in the manifest. Maximum backup file size is 100 MiB; individual attachments retain the 25 MiB app limit. Unsaved drafts, account credentials, standalone customer profiles, and catalog preferences are outside the backup scope.

There is no atomic transaction across browser tabs. Restore re-reads saved records after attachment I/O, but users should close other editing tabs during recovery. There is also no atomic transaction across localStorage and IndexedDB; restore writes files first with new keys, then commits records. Failed pre-commit restores clean up new files without replacing existing quotes.

## Hosted pilot setup

Use the existing Vercel project `quote-tool-app` or the infrastructure selected by DevOps. Confirm ownership and project settings directly; this handoff does not validate live hosting access. With the supplied package layout, the root directory is `quote-tool-app`.

| Setting | Value or purpose |
| --- | --- |
| Node runtime | 24.x |
| Install | `npm ci` |
| Build | `npm run build:vercel` |
| Self-host start | `npm run start` behind HTTPS |
| `NEXT_PUBLIC_RAPIDQUOTE_ENV` | `inet` or `ilios`; build-time, public branding/storage scope |
| `RAPIDQUOTE_ACCESS_MODE` | `restricted` for the gated pilot |
| `RAPIDQUOTE_ACCESS_USER` | Gate username; no colon |
| `RAPIDQUOTE_ACCESS_PASSWORD` | Unique random server-only secret, at least 20 characters |
| `RAPIDQUOTE_APP_ORIGIN` | Trusted HTTPS app origin, no path; required for non-local PDF export |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Only when deployment protection requires the PDF browser to authenticate |
| `PUPPETEER_EXECUTABLE_PATH` | Chrome/Edge path for non-serverless hosting |
| `OPENAI_API_KEY` | Leave unset for this handoff; see optional AI limitation below |

Run `npm run check:config` in the configured environment. Store secrets in the hosting secret manager, never in `NEXT_PUBLIC_*` variables or the ZIP. The pilot gate is shared deployment access, not per-user roles. Add rate limits at the hosting edge for document APIs and the gate. Use HTTPS and access restrictions on preview and production aliases alike.

The PDF renderer calls the trusted print-page origin. For previews, use that preview's own origin, not the production alias. Vercel uses bundled Chromium; other hosts need a compatible installed browser and OS dependencies. PDFs use a temporary token cache with browser-storage fallback because serverless requests may execute on different instances. Verify PDF export on the actual host. The health endpoint reports process availability only; it does not prove quote persistence or PDF generation works.

Vercel documents a 4.5 MB function request/response limit. The application's 4 MiB input limit leaves multipart overhead margin. Large final PDFs or attachments need object storage and a download flow in the managed design. See [Vercel function limits](https://vercel.com/docs/functions/limitations) and [protection bypass for automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## Production architecture and ownership

The correct managed implementation retains the quote contract and pricing behavior while replacing browser authority with server authority. The following work is required before company-wide production acceptance.

| Work | Owner | Acceptance evidence |
| --- | --- | --- |
| Company SSO and server sessions | DevOps + application engineering | Approved identity provider; secure sessions; server checks on every protected operation; disabled users rejected |
| Roles and record access | Application engineering + business owner | Permissions enforced against server-side identity, including owner/team/tenant boundaries; negative-access tests |
| Central quote persistence | Application engineering + DevOps | Managed database; stable IDs; transactional saves; revision/concurrency control; tested migration and reconciliation |
| Shared attachment storage | DevOps + application engineering | Private object storage; integrity checks; authorized upload/download; retention and size controls |
| Durable auditing | Application engineering | Server-owned change history with actor and revision; browser claims cannot forge attribution |
| Recovery | DevOps | Automated backups; agreed RPO/RTO; successful isolated restore drill; monitoring and ownership |
| Build and release controls | DevOps | Protected repository branch, CI checks, controlled staging promotion, dependency review, rollback runbook |
| Business acceptance | Sales operations | Quick Quote/Major Project, purchase/lease, recurring/annual pricing, payment terms, final review, PDF/XLSX sign-off |

Reuse the domain modules. Introduce a server-backed persistence boundary for list/get/save/version/delete/export, then update the UI to use it. Recalculate/validate commercial data on the server for authoritative writes and exports. Do not merely copy browser role values or passwords into the database. The existing client-side account seeds and reset flow must be replaced, and any reused prototype passwords must be rotated.

## Migration sequence that preserves existing records

1. Confirm the target identity, database, storage, hostname, company boundaries, retention, and operational owners.
2. Back up every active user's current browser on the existing site; users may hold different records. Keep an immutable copy of each backup and identify its originating user.
3. Inventory and validate backups. Preserve quote IDs, numbers, commercial values, terms, history, and source provenance. Review ID collisions and owner mappings explicitly.
4. Import into a staging database without recalculating or overwriting commercial snapshots. Keep the original source snapshot and migration version. Upload attachments with their checksums and link their keys.
5. Compare counts, required fields, totals, terms, and PDF/workbook outputs against the originals. Resolve missing attachments and collisions with the business owner.
6. Pause edits for a defined cutover window, collect final backups, import deltas, reconcile, and switch persistence. Keep the original browser records until acceptance and recovery verification are complete.
7. For rollback, preserve any post-cutover edits before reverting routing. A code rollback alone cannot restore database state or browser records.

## Remaining release risks and limitations

- **Identity and data authority:** browser accounts, seeded passwords, resets, roles, approvals, and audit state are client-controlled. The optional gate reduces exposure for an approved pilot but does not resolve this production requirement.
- **Shared records:** no server database, cross-device synchronization, durable central audit, or automated company backup exists yet. Browser backup is a transitional recovery and migration feature.
- **Dependency review:** the last completed compatible-fix audit reported 15 advisories (13 high, 2 moderate), with no critical advisories. These include PDF.js and Puppeteer/browser-helper dependencies, build-tool pattern matching, and ExcelJS's UUID dependency. See `dependency-audit.json` for the final captured report. Test supported patched PDF/browser versions; do not use `npm audit fix --force` blindly because it suggests unrelated major-version downgrades for some packages. Until resolved, restrict imports to trusted internal files and retain access controls. Public production release remains gated on this review.
- **Optional AI extraction:** left unconfigured. The existing raw Responses API integration assumes a top-level `output_text` and has strict-schema optional-field definitions that require review. Correct it and validate with a stubbed contract test plus an approved provider integration before enabling the key. Deterministic parsing works without the key.
- **Live deployment:** no site was deployed or modified during this handoff preparation. Validate actual host access controls, PDF browser launch, rate limits, request/response size behavior, logging, and the stable URL before promotion.
- **Local limits:** the application can reach browser quotas; backups require available memory/disk and cannot recover files that were already removed. Keep originals and perform recovery drills.

## Release and rollback procedure

Install from the lockfile, run the validation commands in README, review the remaining security findings, and configure the restricted preview. Exercise sign-in, quote creation/edit/save/reopen, backup/restore, duplicate/delete, Quick Quote/Major Project conversion, purchase/lease, annual renewals, required review, vendor PDF/BOM imports, customer PDF export with attachments, and approval workbooks. Verify that anonymous requests cannot reach document APIs when restricted mode is enabled.

Promote only the tested candidate after business and DevOps acceptance. Record its source commit, deployment ID, app origin, configuration version, approver, and rollback target. Watch API failure counts, latency, Chromium startup, memory, 413s, storage failures, and user-reported save issues. Roll back to a known compatible app version while preserving the same origin and all browser data. Never clear localStorage or IndexedDB as part of a deployment or rollback.

## References

- [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication): server authorization remains required beyond routing checks.
- [Official SheetJS distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/): lockfile uses the supported vendor tarball.
- `salesforce-cpq-readiness.md`: prior domain and CRM integration direction.
- `PRODUCT-DEFINITIONS.txt`: requested Hydra product-family wording, including expanded HydraGauge scope; catalog configuration still requires approved technical scope and pricing.
- `handoff-history.txt`: historical implementation/deployment notes only.

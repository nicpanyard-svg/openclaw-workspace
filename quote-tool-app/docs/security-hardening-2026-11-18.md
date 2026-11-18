# Security hardening - November 18, 2026

## Scope

This release improves browser, document-rendering, dependency, and backup safety.
It does not implement secure Microsoft sign-in or guest invitations. The current
browser sign-in is not a server-enforced access boundary. Do not onboard outside
users until the [secure access setup](SECURE-ACCESS-SETUP.md) is implemented and tested.

- Fresh script nonces and enforced Content Security Policy on rendered pages.
- No shared caching of nonce-bearing pages; browser capability and opener headers.
- PDF rendering restricted to the configured print origin and exact print page.
- Raw invoice HTML rendered offline, with JavaScript disabled.
- Browser storage seeded only into the intended top-level print document.
- Bounded backup decompression, canonical ZIP paths, stricter manifest validation,
  and restore checks for concurrent storage changes.
- Updated PDF.js, Puppeteer, canvas, and the ExcelJS UUID dependency.
- Browser-only quote storage and the existing application origin are preserved.

## Verification before release

- `RAPIDQUOTE_PDF_BROWSER_TEST=1 npm run check:release`: passed. 577 tests
  passed, none skipped, zero failed, including real Chromium isolation tests.
- Full lint: zero errors; 26 existing warnings. Changed-file lint: passed.
- TypeScript and production Next.js build: passed.
- Browser CSP: unique nonces, normal-page injected script blocked, login hydration.
- Workflow: autosave, reopening, tab conflict protection, recovery, reviewed copy.
- Bulk pricing: review, locks, pricing status, saved values, desktop/mobile layouts.
- Pro forma: purchase, lease, multi-page PDF, responsive preview, email preparation.
  No email was sent by these checks.
- Proposal: actual PDF download, PDF.js spec preview, appended specification page,
  and exclusion of the fixture's internal notes/vendor labels.
- All browser checks use fictional records in disposable profiles. Existing user
  browser data was not read, cleared, or changed.

The PDF API and invoice tests were performed against the local production build.
The same browser/export checks must be repeated after deployment.

## Remaining risks

- Microsoft Entra assignment, MFA, B2B invitations, server sessions, and API
  authorization still require IT setup and application integration.
- Prototype credentials and local role values are not suitable access controls.
- `npm audit --omit=dev`: zero known vulnerabilities at verification time.
- Full audit: 14 high-severity development-tool warnings, traced to the picomatch
  advisory GHSA-fc5q-39xc-vjpf. The latest available picomatch was still affected.
  Do not downgrade Next.js/ESLint to an old major just to suppress that report.
- No centralized error-log drain is configured. Post-deployment checks do not
  replace ongoing monitoring or an independent security assessment.
- Browser backups remain local and are not a synchronized, encrypted account store.

## Release target

Production project: `quote-tool-app`, team `nicpanyard-svgs-projects`.
Primary origin: `https://quote-tool-app.vercel.app`.

Previous production deployment for rollback:
`dpl_22mxwhuRHZG2fpmX7viRAn4N1YoR` (commit `dfb8bd4`).
The production PDF origin setting remains unchanged.

## Server browser compatibility

The initial hardening deployment passed proposal exports but failed the pro forma
export with a Chromium protocol error. Production was rolled back immediately.
Update serverless Chromium from 147 to the latest available package, 153.0.0.
Keep Puppeteer 25.18.1: the nominally matching 25.11.0 brought back a vulnerable
Zod dependency. Use the established CDP offline command instead of Puppeteer's
newer rule-based offline API. Offline isolation must succeed before parsing HTML;
failure aborts export. External requests and scripts remain independently blocked.

See the [Puppeteer browser compatibility table](https://pptr.dev/supported-browsers)
and [serverless Chromium package guidance](https://github.com/Sparticuz/chromium).
After a rollback, explicitly promote the tested production build to restore normal
production alias assignment.

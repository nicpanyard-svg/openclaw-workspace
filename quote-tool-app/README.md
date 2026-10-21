# RapidQuote

RapidQuote builds equipment, connectivity, service, and major-project quotes, customer proposals, PDF packages, and approval workbooks.

This is the October 21, 2026 DevOps handoff candidate. Read [the handoff](docs/DEVOPS-HANDOFF.md) before deployment. Existing browser-based quoting remains available; shared production storage and company identity are still deployment work. The source package does not contain users' browser-saved quote records.

## Run locally

Use Node.js 24 and npm. From this directory:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Local PDF export needs Chrome or Edge installed; set `PUPPETEER_EXECUTABLE_PATH` if automatic detection fails. Preserve the same hostname and port to keep using the same browser records. Do not use an incognito session for records you need to retain.

## Validate

```powershell
npm run lint
npm run typecheck
npm test
npm run build:vercel
npm run start
```

`npm run check:release` combines the code checks and build. `npm run check:config` separately checks hosted-pilot configuration without printing secret values. It intentionally fails until DevOps supplies access settings and an HTTPS app origin.

Development and production builds use webpack. The default Turbopack build stalled in this Windows review environment; the webpack production build completed successfully.

With the built app running at `http://127.0.0.1:3047`, `npm run test:smoke` checks backup/restore and document API basics in a fresh headless browser with synthetic data. Override `PROPOSAL_QA_BASE_URL` to use another localhost port. Chrome or Edge is required.

## Keep quote records

Save open drafts, then use **Quotes → Back up or restore quotes → Download backup**. Save the ZIP in approved company storage. It contains saved quote records and available attached files; missing files are reported. Sign-in accounts, passwords, unsaved drafts, and standalone customer/catalog settings are excluded.

Restore on the same company environment. Matching IDs are skipped, so an older backup cannot overwrite existing quotes. For disaster recovery of an older version, restore into a separate browser profile and review it before merging manually.

## Deployment

The existing Vercel project uses `quote-tool-app` as its project root. Install with `npm ci`, build with `npm run build:vercel`, and select Node.js 24. Configure `.env.example` values using the hosting secret manager. Do not upload `.env.local`, `.vercel`, `node_modules`, or `.next`.

Restricted pilot access is opt-in through `RAPIDQUOTE_ACCESS_MODE=restricted`. This gate is separate from the existing browser sign-in. Full production identity, permissions, shared storage, and recovery requirements are in the handoff.

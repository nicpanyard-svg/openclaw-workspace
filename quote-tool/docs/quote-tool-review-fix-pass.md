# Quote Tool Review Fix Pass

## What changed
- Fixed the purchase vs lease toggle so both states switch cleanly and the summary/lease rollup update live.
- Renamed **Human-labeled quote sections** to **Quote Sections**.
- Added support for adding/removing custom section fields from the quote setup area.
- Fixed the pool pricing vs per-kit pricing toggle so both views switch cleanly and keep their own rows.
- Added better Section A quick-add behavior:
  - 1 TB quick add
  - editable GB/TB quantity entry
  - custom data row generation for pool or per-kit mode
  - added 1 TB catalog baselines plus a pool overage catalog row
- Fixed Section A row action buttons by making move up/down wrap instead of disabling edge rows.
- Fixed Section B controls, including:
  - hardware row move/duplicate/remove buttons
  - article number apply flow
  - catalog add + custom add flow
- Added smart accessory suggestions based on selected Starlink device types in hardware rows.
- Fixed Hardware rows 1-4 action buttons the same way as other live rows.
- Expanded Section C to support:
  - site inspection pricing
  - installation pricing
  - budgetary pricing before site inspection
  - final pricing after site inspection
  - preset service buttons plus per-row pricing stage editing

## Files touched
- `quote-tool-app/app/components/quote-preview.tsx`
- `quote-tool-app/app/lib/catalog.ts`
- `quote-tool-app/app/lib/quote-record.ts`
- `quote-tool-app/app/lib/sample-quote-record.ts`

## Validation
- Ran `npm run build` in `quote-tool-app`
- Build passed successfully

## What remains
- Accessory suggestion logic is currently rules-based from selected terminal type, not source-workbook driven yet.
- Section fields are builder-facing metadata right now; they are not yet mapped into exported PDF/DOCX output.
- Final install pricing still depends on builder-entered scope numbers after site inspection, which is correct for this pass but not yet tied to a deeper estimation model.

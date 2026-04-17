# Quote Tool Catalog + Row Builder UX Progress

## What changed
- Reworked the real builder UI in `quote-tool-app` to stay builder-first and avoid fake PDF editing behavior.
- Replaced the simple Section B dropdown with a cleaner catalog picker that supports search, category filtering, source visibility, price visibility, and one-click add actions.
- Added a full custom hardware flow for manual rows with fields for item name, category, terminal type, article/part number, qty, price, and notes.
- Added a new article number creation flow with preview, reusable staged value for custom items, and the ability to apply the generated article number directly into an existing hardware row.
- Improved row-builder controls across sections with clearer row labels plus add/remove/duplicate/reorder actions where practical.
- Expanded hardware row editing so rows can now carry terminal type, article/part number, and editable source labels.
- Kept clear human section labels and left PDF formatting/output work for a later pass.

## Files touched
- `C:\Users\IkeFl\.openclaw\workspace\quote-tool-app\app\components\quote-preview.tsx`
- `C:\Users\IkeFl\.openclaw\workspace\quote-tool-app\app\globals.css`
- `C:\Users\IkeFl\.openclaw\workspace\quote-tool\docs\quote-tool-catalog-ux-progress.md`

## Validation
- `npm run lint` ✅
- `npm run build` ✅

## What remains
- Persist quote edits and catalog/article additions instead of keeping everything in local component state.
- Decide whether new article numbers should also create reusable catalog entries instead of only updating rows/forms.
- Add stronger guardrails for duplicate catalog items, row validation, and quantity/price defaults by item type.
- Add a cleaner Section A custom-row path if monthly service rows also need the same guided builder treatment.
- After builder behavior is stable, map this record into the actual PDF/DOCX output layer.

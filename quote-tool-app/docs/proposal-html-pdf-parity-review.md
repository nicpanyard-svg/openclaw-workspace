# RapidQuote HTML vs PDF Parity Review

Date: 2026-05-09

## Scope boundary

- `app/proposal/*` toolbar controls are app chrome only.
- `app/components/proposal-document.tsx` is the customer-facing proposal HTML source of truth.
- `/api/proposal-pdf` renders `/proposal/print` to PDF from that same HTML document.
- Only verified differences between browser preview chrome and exported output belong in parity review notes.

## Verified rendering path

1. HTML preview route loads `ProposalDocument`.
2. Print preview route loads `ProposalDocument`.
3. PDF export calls `renderHtmlPdf()` against `/proposal/print`, so PDF is derived from the same proposal HTML.

## Verified differences only

- Browser preview routes include app toolbar controls above the proposal document.
- Those toolbar controls use `.no-print`, so they are excluded from print/PDF output.
- The customer-facing proposal content itself is shared between HTML preview, print preview, and PDF export.

## Issue #10 changes

- Preview/export control wording now explicitly labels the toolbar as app controls.
- Preview and print surfaces now label the customer proposal content area separately from app chrome.
- Approval workbook export filename no longer includes the stale `-v4` suffix.
- `_pdf_review/qa-pdf-verify.mjs` now reports app chrome, proposal HTML, PDF generation, and verified differences as separate concerns.

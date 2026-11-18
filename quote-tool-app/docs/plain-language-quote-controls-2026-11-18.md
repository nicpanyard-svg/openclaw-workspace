# Plain-language quote controls

## Scope

- Pricing choices now read Price set, Estimated price, Needs pricing, and No extra charge.
- Each choice has a visible explanation associated with its field for screen readers.
- Invalid prices explain the correction without silently changing the amount.
- Bulk pricing names gross margin, includes a numeric example, and previews selling-price changes.
- Quote copying asks directly which customer, items, terms, and attachments to keep.
- Save conflicts and previous versions explain whether edits are saved and what action is needed.
- Cost-source and price-method labels distinguish recorded information from price calculations.

Stored status values, calculations, and customer-document price terminology remain unchanged.

## Verification

- 543 automated tests passed.
- TypeScript check and production build passed.
- Targeted ESLint passed with existing quote-preview warnings only.
- Browser workflow and bulk-pricing checks passed at desktop and mobile widths.
- Checked mobile copy and margin-review screenshots for wrapping and layout.

Browser artifacts: `tmp/bulk-pricing-qa/1795009479707` and
`tmp/workflow-safety-qa/1795009490669`.

Changes are local. No Vercel deployment was requested for this pass.

## Demonstration video

`scripts/record-rapidquote-demo.ts` records the real local app in an isolated browser.
It uses a fictional customer, contact details, vendor costs, and sample prices.
It downloads a real sample proposal PDF but does not send email or DocuSign requests.

Run against a local production preview on port 3018. Set `PROPOSAL_QA_BASE_URL`
for another local port and `FFMPEG_PATH` for a portable FFmpeg installation.
Use `--dry-run` to rehearse without recording. Outputs go to ignored
`tmp/rapidquote-showcase`, with a captioned H.264 MP4 in the `final` directory.

# RapidQuote field mapping checklist

## Builder -> saved proposal -> preview / print / Word export

### Proposal identity
- `metadata.proposalNumber` -> cover/header/summary/export filename
- `metadata.documentTitle` -> cover title / preview / Word title
- `metadata.documentSubtitle` -> cover subtitle / preview / Word title block
- `metadata.proposalDate` -> cover/date cards / documentation labels
- `metadata.revisionVersion` -> revision label
- `metadata.status` -> saved proposal state / send transitions

### Customer + contact
- `customer.*` -> prepared-for card / customer details / export
- `billTo.*` -> bill-to block
- `shipTo.*` + `shippingSameAsBillTo` -> ship-to block
- `inet.*` -> prepared-by block / sales contact

### Narrative
- `executiveSummary.heading` -> executive summary heading
- `executiveSummary.customerContext` + `executiveSummary.body` -> preview / print / Word summary paragraphs
- `customFields[visibility=customer]` -> additional proposal details in preview / print / Word export

### Commercial sections
- `sections.sectionA.*` -> recurring services table + recurring total
- `sections.sectionB.*` -> equipment table + one-time equipment total
- `sections.sectionC.*` -> field services table + optional services total
- derived commercial snapshot -> sourced from `buildProposalCommercialSummary(quote)` only

### Copy isolation rules
When `createProposalCopy()` runs, the copy must clear:
- customer identity/contact/address
- bill-to and ship-to values
- executive summary customer context/body/paragraphs
- custom field values
- CRM references and sync summaries tied to prior customer
- internal customer-specific notes that could surface later

### Verification pass used for this hardening
- Builder save/reload preserved edited proposal fields
- Preview and print read the same saved quote source
- Word export uses `buildProposalPdfViewModel(quote)`-backed content paths for matching document data
- Copied proposals open as draft and no prior-customer text should survive in customer-facing output

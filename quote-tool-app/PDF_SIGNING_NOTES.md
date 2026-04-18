# RapidQuote PDF signing - technical first pass

## What I found

The app already has a strong proposal document component:
- `app/components/proposal-document.tsx`
- a print/save preview route at `app/proposal/page.tsx`
- a clear approval block on the closing page

That means the cleanest implementation path is **not** to bolt a signing workflow onto the UI first.
Instead, reuse the existing proposal content and add a dedicated **server-side PDF export pipeline**.

## Recommended approach

### Best fit for this app

Use a **2-step pipeline**:

1. **Generate a static proposal PDF from the existing React proposal document**
   - preferred first implementation: render the proposal route/page with Playwright or Puppeteer and export to PDF
   - this preserves Jill's current design direction and avoids rebuilding the document in a second layout system

2. **Post-process that PDF to add only the final approval fields as AcroForm fields**
   - signature field
   - printed customer name field
   - date field
   - all other content remains flattened/static

This matches the requirement:
- no separate workflow system
- customer gets a signable/fillable PDF
- only customer signature area is editable

## Why this is the best path

### Pros
- reuses the existing proposal layout
- lowest product risk for Jill's backlog
- keeps the document visually consistent with on-screen preview
- avoids turning the quote builder itself into a document editor
- gives a normal PDF attachment that can be emailed or downloaded

### Tradeoffs
- browser-based PDF generation adds a server/runtime dependency
- exact placement of signature fields must be coordinated with the final approval block layout
- "digitally sign" can mean two different things:
  - **simple e-sign UX in viewer apps**: customer signs/fills field in Adobe/Preview/etc.
  - **certificate-based cryptographic digital signature**: stronger, but more complex

For first pass, support should target:
- **fillable signature field in the PDF**
- customer can sign in Adobe Acrobat / supported viewer

If later they want cryptographic signing with certificate validation, that is a second phase.

## Library strategy

### Recommended stack for phase 1

#### PDF generation
- **Playwright** or **Puppeteer**
- render the proposal route and print to PDF on the server

Why:
- preserves CSS and current layout
- fastest path from existing UI to production-looking PDF

#### PDF field injection
Candidate options:

1. **pdf-lib**
   - good for general PDF manipulation and form work
   - limitation: it does **not** provide a complete real digital-signature workflow by itself
   - still useful for text/date fields and general PDF modifications

2. **A signing-focused PDF library / pipeline**
   - examples in the ecosystem include `@signpdf/*`
   - these are more about certificate signing than pleasant field authoring
   - useful later if iNet wants actual PKCS#7-style cryptographic signatures

3. **Commercial SDK if needed later**
   - PSPDFKit/Nutrient, PDFTron, Apryse, etc.
   - strongest support for signature fields, flattening, validation, and viewer behavior
   - probably overkill for the first pass unless requirements tighten fast

### Practical recommendation

For now:
- **Playwright/Puppeteer for PDF creation**
- **PDF post-processing step for a signature/text/date field on the final page**
- keep the contract modular so the signing backend can be swapped later

## File/output constraints to plan around

### 1. Final page field coordinates
The approval block is currently rendered in HTML/CSS. PDF field placement will need:
- final page number
- x/y coordinates in PDF points
- width/height for each field

This is the main implementation detail Jill should know: if the approval block layout changes, field coordinates will need recalibration unless we add anchor-based measurement.

### 2. Viewer compatibility
Not all browsers handle PDF signature fields equally well.
Best customer experience is usually:
- Adobe Acrobat / Acrobat Reader
- some desktop PDF apps

Browser-native viewers may show mixed behavior for actual signing.
So product copy should likely say something like:
- "Open in Adobe Acrobat or a compatible PDF app to sign."

### 3. True digital signature vs signature image capture
If the requirement means:
- customer can type/draw a signature in a PDF viewer -> feasible now
- certificate-backed cryptographic signing generated fully inside RapidQuote without external tooling -> possible, but notably more work

### 4. Flattening/locking
After generation:
- proposal body should be static
- only approval fields should remain editable
- optional later enhancement: once returned, flatten signed result for archive

### 5. Server/runtime constraints
If using Playwright/Puppeteer in production, deployment must support:
- headless Chromium
- enough memory for PDF rendering
- server-side route or action for generating binary PDF output

## Lowest-risk implementation plan

### Phase 1 - support lane / proof of concept
- keep current preview page intact
- add a server utility that defines the signable output contract
- create a server PDF export route later that:
  - loads proposal data
  - renders PDF from the existing proposal page/component
  - adds final-page signature fields

### Phase 2 - first usable output
- button: `Download Signable PDF`
- generated PDF contains:
  - static proposal body
  - signature/name/date fields on final page
- no external workflow system

### Phase 3 - stronger signing/archive support
Optional if needed:
- certificate signing
- signed-PDF validation
- flatten returned signed PDFs
- archive signed result to CRM/storage

## What I added in code

Added a small non-invasive planning utility:
- `app/lib/pdf-signing-plan.ts`

It defines:
- the preferred strategy name
- output filename convention
- the intended editable fields:
  - `customer_signature`
  - `customer_name`
  - `signature_date`
- a temporary placement contract using `pageIndex: -1` to mean final approval page

This is not risky runtime behavior. It is a clean placeholder for the future PDF export route and helps separate Jill's UI work from the technical PDF pipeline.

## Best next step

Best next step:

1. **Approve a server PDF generation direction**
   - I recommend **Playwright-based PDF export** from the proposal document

2. **Freeze the closing approval block layout enough to measure field placement**
   - even a rough stable layout is enough for a proof of concept

3. **Build a narrow proof of concept route**
   - one route that takes a known proposal
   - generates PDF
   - adds only signature/name/date fields on the last page

That will answer the real feasibility question fast without destabilizing the rest of RapidQuote.

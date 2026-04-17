# Quote Engine V1 Spec

## Goal
Build a private internal quote engine for iNet that generates branded quote/proposal documents without manually editing Word for each deal.

## Hosting / Product Boundary
- This quote tool is **not part of Mission Control**
- Mission Control remains the SDR CRM / operations app
- The quote tool should be built as a **separate private internal app/tool**
- It should preserve the branded proposal look from the provided sample while making the quote portions functional

## Core Requirements
- Private/internal only
- Easy to access from Nick's work computer
- Keep iNet branding, layout, fixed images, and standard formatting locked
- Only change company name, company logo, Section A service pricing, and Section B hardware pricing
- Generate DOCX first (PDF later)

## Quote Structure
### Section A: Service Pricing
One of:
- Pool Pricing
- Per Kit Data Pricing

### Section B: Equipment Pricing
- Standard catalog items
- Custom hardware items

## Locked / Static Template Elements
- iNet branding
- proposal layout
- colors, fonts, spacing
- standard images (except customer logo)
- standard section headers
- standard explanatory wording blocks

## Fillable Fields
### Quote Metadata
- quoteId / proposal number
- date
- companyName
- companyLogo
- status (draft, sent, open, won, lost, closed)
- internalNotes

### Section A: Pool Pricing
- poolEnabled
- poolSizeGb
- pricePerGb
- terminalCount
- terminalAccessFeeDefault
- overagePerGb
- termMonths

### Section A: Per Kit Pricing
- perKitEnabled
- block50Qty
- block50PriceDefault
- block500Qty
- block500PriceDefault
- terminalCount
- terminalAccessFeeDefault
- termMonths

### Section B: Equipment
For each line item:
- itemId (nullable for custom)
- itemName
- itemCategory
- itemType
- terminalType (nullable)
- partNumber (nullable)
- isStandardCatalogItem
- quantity
- unitPrice
- totalPrice
- description

## System Defaults
- defaultCurrency = USD
- terminalAccessFee = 45.00
- block50Price = 30.00
- block500Price = 132.00

## Currency Support
- V1 default currency is USD
- quote records should store currency code explicitly
- pricing defaults should be currency-aware later
- design the data model so additional currencies can be added in the future without rewriting the quote engine

Defaults should be editable in admin/settings later, but prefill all new quotes.

## Pricing Logic
### Pool Pricing
- poolSubtotal = poolSizeGb * pricePerGb
- terminalFeeSubtotal = terminalCount * terminalAccessFeeDefault
- monthlyRecurringTotal = poolSubtotal + terminalFeeSubtotal

### Per Kit Pricing
- block50Subtotal = block50Qty * block50PriceDefault
- block500Subtotal = block500Qty * block500PriceDefault
- terminalFeeSubtotal = terminalCount * terminalAccessFeeDefault
- monthlyRecurringTotal = block50Subtotal + block500Subtotal + terminalFeeSubtotal

### Equipment Pricing
- lineTotal = quantity * unitPrice
- equipmentTotal = sum(lineTotal)

## Catalog Requirements
Support standard catalog items for:
- Starlink Mini
- Standard V4
- Gen 3 Performance
- accessories
- mounts
- cables
- adapters
- standard bundles

Also support custom hardware line items.

## Tracking / Reporting
Track standard quoted products across open quotes.

### Needed rollups
- total terminals in open quotes by terminal type
- total standard products/accessories in open quotes by item
- quote counts by status

## Screens
### 1. Quote List
- list quotes
- status
- company
- date
- recurring total
- equipment total
- duplicate quote

### 2. New/Edit Quote
#### Customer panel
- company name
- company logo
- proposal number
- date
- status

#### Section A panel
- service model selector: Pool or Per Kit
- relevant fields based on selected model
- auto calculations

#### Section B panel
- add from standard catalog
- add custom hardware line
- edit qty / unit price / description
- auto totals

### 3. Review / Preview
- preview rendered quote structure
- confirm Section A and Section B
- confirm totals
- generate DOCX

### 4. Dashboard / Summary
- open quote terminal counts by type
- open quote standard product counts

## Output Requirements
V1 output:
- DOCX generated from locked branded template
- customer logo swapped in
- company name swapped in
- Section A rendered based on selected service model
- Section B rendered from line items

## Data Sources Already Identified
- Sample PDF proposal for structure/output
- Excel catalog for accessories by terminal type
- DOCX equipment catalog for mounts, part numbers, and descriptions

## V1 Scope
### In scope
- separate internal/private quote app page(s)
- quote create/edit/store
- service pricing math
- equipment math
- standard + custom hardware
- open quote product tracking
- DOCX generation

### Out of scope for V1
- public access
- customer-facing portal
- advanced approval workflows
- PDF export
- ERP integration
- inventory depletion logic

## Recommended Build Order
1. Extract real template structure / field map from the sample proposal
2. Define data files / JSON model
3. Create locked quote template shell in the separate internal app
4. Create catalog data source
5. Implement calculations
6. Implement quote persistence
7. Add open-quote summary reporting
8. Implement DOCX generation
9. Test against real sample proposals

## Reference Deliverable
- Real template field map: `C:\Users\IkeFl\.openclaw\workspace\quote-tool\docs\quote-template-step-1-field-map.md`

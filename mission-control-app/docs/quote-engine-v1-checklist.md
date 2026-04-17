# Quote Engine V1 Checklist

## Phase 0 - Inputs locked in
- [x] Keep iNet branding/layout/images fixed
- [x] Company name changes per quote
- [x] Customer logo changes per quote
- [x] Section A is either Pool or Per Kit Data Pricing
- [x] Section B is Equipment Pricing
- [x] Support standard hardware + custom hardware
- [x] Track open quote counts for standard products and terminals
- [x] Terminal fee default = 45.00
- [x] 50 GB block default = 30.00
- [x] 500 GB block default = 132.00
- [x] DOCX first, PDF later

## Phase 1 - Data model
- [ ] Create quote schema
- [ ] Create catalog schema
- [ ] Create defaults/settings schema
- [ ] Create open-quote summary logic schema

## Phase 2 - Storage files
- [ ] Add quotes.json
- [ ] Add quote-catalog.json
- [ ] Add quote-status definitions
- [ ] Add sample seed data

## Phase 3 - UI
- [ ] Add Quote Engine page route
- [ ] Add quote list view
- [ ] Add quote editor form
- [ ] Add Section A pricing component
- [ ] Add Section B equipment component
- [ ] Add review/preview panel

## Phase 4 - Calculations
- [ ] Pool pricing math
- [ ] Per-kit pricing math
- [ ] Equipment totals math
- [ ] Grand totals / recurring totals

## Phase 5 - Tracking
- [ ] Open quote terminal counts by type
- [ ] Open quote standard product counts by item
- [ ] Quote status rollups

## Phase 6 - Output
- [ ] Choose DOCX templating approach
- [ ] Build branded template merge
- [ ] Support customer logo swap
- [ ] Generate downloadable DOCX

## Phase 7 - QA
- [ ] Compare output against Westward sample
- [ ] Validate Section A switching
- [ ] Validate custom hardware support
- [ ] Validate product tracking counts

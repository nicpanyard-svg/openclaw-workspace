# Quote Engine V1 Build Plan

## Phase 1 - Foundation
- Add data storage for quotes, defaults, and catalog
- Create initial quote schema
- Seed defaults:
  - terminal fee = 45
  - 50 GB block = 30
  - 500 GB block = 132

## Phase 2 - Catalog
- Import/normalize standard Starlink products and accessories
- Support terminal types:
  - Starlink Mini
  - Standard V4
  - Gen 3 Performance
- Support custom hardware lines

## Phase 3 - Quote UI
- Quote list page
- Quote editor page
- Customer info block
- Section A pricing block
- Section B hardware block
- auto-calculation summary

## Phase 4 - Reporting
- Open quote terminal counts by type
- Open quote standard product counts by item

## Phase 5 - Output
- DOCX template strategy
- merge quote data into branded template
- output downloadable DOCX

## Notes
- Keep branding/images locked
- Only customer logo should vary on the visual side
- Section A is either Pool or Per Kit
- Section B supports catalog + custom hardware

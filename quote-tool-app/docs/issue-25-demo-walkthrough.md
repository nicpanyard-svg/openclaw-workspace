# Issue #25 Demo Walkthrough

## Scenario

Use this demo when showing a new five-site field rollout that needs structured internal economics and clean customer-facing quote lines.

- Customer: Red Mesa Compression
- Opportunity: five remote compressor sites plus one field office support workflow
- Goal: build one Major Project quote that shows recurring service, bundled hardware, and field deployment services

## Recommended flow

1. Start a new quote from `Workspace -> New Major Project` or open `/new?mode=new&entry=major-project`.
2. In **Customer entry**, create a new customer:
   - Customer name: `Red Mesa Compression`
   - Contact: `Jordan Alvarez`
   - Primary/default address: use the main operations address
   - Bill To / Ship To: keep Bill To on the HQ address, set Ship To to the field yard if needed
   - Click `Use this customer`
3. In **Quote details**, keep the quote in **Major Project** mode:
   - Document title: `Red Mesa 5-Site Connectivity Rollout`
   - Customer provider: `Starlink`
   - Quote type: `Purchase`
4. In **Major Project workflow**, set the commercial context:
   - Project name: `Red Mesa West Texas rollout`
   - Project description: `Managed connectivity for five compressor sites with staged deployment and support`
   - Site count: `5`
   - Active sites: `5`
   - Monthly rate per site: enter the target sell rate for the managed service
   - Hardware / install / recurring cost inputs: enter rough live values so margin cards populate
5. In **Choose your workflow**, switch to **Mapped Builder**.

## Mapped Builder example

### Step 1: Components

Add components that represent the real internal commercial model.

1. `Starlink Performance kit`
   - Vendor: `Anixter Inc.`
   - Manufacturer / Service Provider: `SpaceX`
   - Line type: `hardware`
   - Schedule: `one_time`
   - Qty: `5`
2. `Mount and cable package`
   - Vendor: `Easy Up`
   - Manufacturer / Service Provider: `Custom` -> `Blue Ridge Fabrication`
   - Line type: `hardware`
   - Schedule: `one_time`
   - Qty: `5`
3. `Managed edge router service`
   - Vendor: `Ilios-Integrators`
   - Manufacturer / Service Provider: `RAD`
   - Line type: `managed_service`
   - Schedule: `recurring`
   - Qty: `5`
4. `Site activation and commissioning`
   - Vendor: `Custom` -> `Permian Field Ops`
   - Manufacturer / Service Provider: `Custom` -> `Field Services Crew`
   - Line type: `installation`
   - Schedule: `one_time`
   - Qty: `5`

This demonstrates:

- preset **Vendor** dropdown values
- preset **Manufacturer / Service Provider** dropdown values
- practical `Custom` usage in both dropdowns

### Step 2: Bundles

Create bundles so related internal rows roll up cleanly.

1. Use `Bundle with this` on `Starlink Performance kit` and include `Mount and cable package`.
2. Let RapidQuote create the paired bundle and customer quote line automatically.
3. Rename the bundle to `Remote site hardware package` if needed.
4. Create or keep separate bundles for:
   - `Managed edge router service`
   - `Site activation and commissioning`

Natural outcome:

- hardware items stay bundled together for Section B
- recurring service can stay as its own recurring bundle for Section A
- install labor can stay as its own services bundle for Section C

### Step 3: Customer quote lines

Review the auto-created quote line from the first bundle, then make the presentation layer clean:

1. Keep one recurring quote line for the managed service bundle.
2. Keep one hardware quote line for `Remote site hardware package`.
3. Keep one services quote line for `Site activation and commissioning`.
4. Only use `Advanced overrides` if you intentionally want the customer-facing rollup to differ from the normal bundle mapping.

## What the demo proves

This walkthrough shows:

- new opportunity / quote setup from a fresh customer
- **Major Project** workflow selection
- switching into **Mapped Builder**
- component-level pricing and cost entry
- **Vendor** dropdown use with preset values
- **Manufacturer / Service Provider** dropdown use with preset values
- practical `Custom` entries
- bundled items flowing from components to bundles to customer quote lines
- downstream intent for Section A recurring, Section B hardware, and Section C services

## Demo note

For the cleanest live demo, stay in one option and keep the customer-facing labels simple. The goal is to show that internal components drive economics while bundles and quote lines control how the proposal is presented.

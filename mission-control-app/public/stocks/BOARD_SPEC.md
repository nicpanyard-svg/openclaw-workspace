# Graham Stock Board — First-Pass Spec

## 1) What this is
A standalone board/app owned and continuously maintained by Graham.

Primary use:
- keep a visible list of emerging public companies with big upside potential
- make the current stance obvious at a glance
- track when to start, add, trim, or kill a thesis
- feed one clean daily email to Nick

## 2) Board layout
Use 5 columns:

1. **Pipeline**
   - names worth researching
   - no capital plan yet

2. **Watch / Setup**
   - thesis is interesting
   - waiting for price, earnings, or confirmation

3. **Starter Buy**
   - acceptable first-entry zone
   - starter size only

4. **Add on Proof**
   - company is executing and/or chart confirms
   - add only if thesis is improving, not just because price fell

5. **Trim / Exit**
   - near upside target, too extended, or thesis damaged

## 3) Card design
Each stock card should show:
- **Ticker**
- **Company**
- **Theme**
- **Stage**: Pipeline / Watch / Starter / Add / Trim
- **Status**: Bullish / Neutral / Cautious / Broken
- **Conviction**: 1-5
- **Starter Buy**: first zone or trigger
- **Add Zone**: second entry zone or proof trigger
- **Trim Zone**: profit-taking zone or overextension rule
- **Thesis Break**: what invalidates the idea
- **Upside**: 12-24 month rough bull case
- **Downside**: realistic bear case / drawdown risk
- **Why it matters**: one-line thesis
- **Catalysts**: next 1-3 events
- **Last updated**

## 4) Scoring + card rules
### Add a board score
Each card should also carry a **Graham Score (0-100)** built from:
- **Narrative / TAM** — 20
- **Revenue growth / execution** — 20
- **Margin path / business quality** — 15
- **Balance sheet / dilution risk** — 10
- **Price action / momentum** — 10
- **Valuation sanity** — 10
- **Catalyst quality** — 10
- **Street / sentiment setup** — 5

Score bands:
- **80-100** elite active setup
- **65-79** strong watch / starter range
- **50-64** bench or event-watch only
- **under 50** not active unless a very specific event setup exists

### Status meanings
- **Bullish** — setup and thesis are both healthy
- **Neutral** — interesting, but not yet actionable
- **Cautious** — thesis intact, timing/risk not great
- **Broken** — remove from active board unless re-underwritten

### Conviction meanings
- **1** speculative tracking only
- **2** interesting but early
- **3** starter-size acceptable
- **4** strong execution / trend confirmation
- **5** elite setup with repeated proof

## 5) Guidance philosophy
Nick asked for buy/sell guidance on cards. First pass should be simple:

- **Starter Buy** = a small first position only
- **Add Zone** = only when execution or trend confirms
- **Trim Zone** = reduce into strength, not all-or-nothing
- **Thesis Break** = non-negotiable exit condition

Guidance can be expressed one of 3 ways:
1. price range
2. market cap / valuation range
3. event-based trigger

Use whichever is most honest for the name.

## 6) Default card footer
Every card should include:
- **Position rule:** starter = 25-33% of intended full size
- **Time horizon:** 12-24 months unless noted
- **Risk tag:** Speculative / High Beta / Execution Risk / Dilution Risk / Regulatory Risk

## 7) Suggested filters for the board
Prefer companies that hit most of these:
- market cap roughly under $25B
- public-company story still early or controversial
- revenue growth still strong
- big TAM or category winner potential
- multiple future catalysts
- not purely story-stock with no path to durable economics

## 8) Data sources for Graham
Use the existing stock-analysis skill plus:
- Yahoo Finance for price, valuation, analyst view
- company IR decks for narrative and guidance
- earnings transcripts for proof vs hype
- Graham daily notes for why a name moved columns

## 9) Board sections above the columns
At the top of the app, show 4 summary tiles:
- **Top Pick Today**
- **Best Setup Not Yet Bought**
- **Most At Risk**
- **Board Changes Since Yesterday**

## 10) Minimal MVP interactions
For the first working app:
- sort by conviction
- filter by theme
- filter by stage
- click card to expand thesis
- highlight changed cards since last update
- copy today's email summary from a button

## 11) Themes to support
- AI infrastructure / compute
- defense / autonomy / space
- digital health / medtech platforms
- fintech / capital markets infrastructure
- industrial automation / robotics / advanced manufacturing
- energy transition / grid / power electronics
- next-gen software / data platforms

## 12) What not to do yet
- no auto-trading
- no pretending price targets are precise
- no giant watchlist with 100 weak names
- no mixing mature megacaps into this board unless used as comparison comps

# Mission Control Auto-Sync Plan

## Goal
Keep `mission-control/status.json` fresh enough to reflect real agent/task activity, without turning Mission Control into a noisy chat transcript.

## Recommended minimal architecture

### 1) Treat `status.json` as a derived view
Do **not** let multiple agents write raw dashboard state directly.

Instead:
- agents/subagents append small structured events to one local event file
- one tiny sync script reduces those events into the latest board state
- `mission-control/index.html` continues to read only `status.json`

### 2) Add one lightweight event file
Recommended new file:
- `mission-control/activity-log.jsonl`

Each line is one compact event, for example:
```json
{"ts":"2026-03-20T19:30:00-05:00","type":"task.started","agent":"Susan","task":"Plan Mission Control auto-sync","lane":"Planner","id":"task-123"}
{"ts":"2026-03-20T19:34:00-05:00","type":"task.blocked","agent":"Jill","task":"Live sync wiring","reason":"Need stable source of agent events","id":"task-124"}
{"ts":"2026-03-20T19:40:00-05:00","type":"task.completed","agent":"Susan","task":"Plan Mission Control auto-sync","id":"task-123"}
```

Why this is the cleanest first step:
- append-only is simple and safe
- easy to inspect by hand
- easy to rebuild `status.json` if needed
- avoids agents clobbering each other

### 3) Add one reducer script
Recommended new script:
- `scripts/mission-control-sync.ps1`

What it should do:
- read `mission-control/activity-log.jsonl`
- read health inputs already living in `monitoring/*.json` / `*.log` where useful
- compute a compact latest-state summary
- write `mission-control/status.json`

## Data flow

### Inputs
1. **Agent/task events**
   - from planner/builder/reliability/sales work starts
   - blocker raised/cleared
   - task completed
   - optional handoff between agents

2. **System health signals**
   - `monitoring/openclaw-watchdog-state.json`
   - `monitoring/slack-watcher-state.json`
   - other existing local health files later if needed

3. **Static/manual planning data**
   - markets, offers, target accounts, build calendar defaults can remain in `status.json` initially
   - later, split static data into a small separate config if it becomes annoying to maintain

### Output
- `mission-control/status.json`

The reducer should update these sections:
- `currentTask`
- `currentStep`
- `currentBlocker`
- `nextMove`
- `workNow`
- `blocked`
- `done`
- `health`
- optional per-agent summaries

## Update triggers
Only sync on **meaningful state changes**.

Recommended triggers:
- subagent/task started
- blocker added
- blocker cleared
- task completed
- handoff to another lane
- health state changed (good -> warn -> bad or back)
- manual refresh button in Mission Control

Avoid using these as triggers:
- every chat message
- every heartbeat
- every tool call
- every partial thought/update

## Anti-spam rules
To keep the board useful:
- keep only the **latest active item per agent** in the main view
- only show top **1 current blocker** and a short blocked list
- move completions into `done` only on actual completion, not progress chatter
- debounce writes to `status.json` to roughly **5-15 seconds** during bursts
- skip rewrite if the reduced state is unchanged
- cap recent done items to a small number like **5-8**

## Files to change

### Create
- `mission-control/AUTO_SYNC_PLAN.md`
- `mission-control/activity-log.jsonl`
- `scripts/mission-control-sync.ps1`

### Update
- `mission-control/index.html`
  - optional: add a small "last sync" or "sync source" chip
  - optional: add per-agent current task text if reducer supplies it
- `mission-control/status.json`
  - keep as generated output
- `MISSION_CONTROL_PLAN.md`
  - point future implementation at event-log + reducer model

## Minimal event schema
Recommended fields:
- `ts`
- `type`
- `agent`
- `lane`
- `id`
- `task`
- `reason` or `note`
- `status` when relevant

Supported event types for v1:
- `task.started`
- `task.updated`
- `task.blocked`
- `task.unblocked`
- `task.completed`
- `task.handoff`
- `health.changed`

## Cleanest first implementation

### Phase 1 — reducer foundation
- create `activity-log.jsonl`
- create `mission-control-sync.ps1`
- manually append a few test events
- generate `status.json` from those events

### Phase 2 — wire real updates
- whenever a named agent starts/completes/blocks a task, write one event
- pull watchdog/slack health into the reducer
- make Mission Control reflect real state with no UI rewrite

### Phase 3 — tighten the view
- add per-agent current task summaries
- add `lastSync` / `syncState`
- split static board data from runtime state only if maintenance becomes messy

## Opinionated recommendation
Do **not** build a live message stream, websocket layer, or database first.

Mission Control already has the right consumer shape: `index.html` reads `status.json`.
The smallest durable improvement is to make `status.json` a generated snapshot from compact events.
That gives Nick a clean operating board instead of noisy agent chatter.

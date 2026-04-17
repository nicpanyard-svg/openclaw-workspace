# Mission Control Plan

## Goal
Build a stable, visual, interactive mission control for Nick that supports real work first and automation second.

## Design Principles
- stability before cleverness
- visual over verbose
- fewer moving parts
- clear task ownership
- easy to trust
- automation added in layers

## Version to Build Now
### Core modules
1. **Dashboard**
   - current priorities
   - what Ike is doing now
   - blockers
   - next actions
   - system health

2. **Task Board**
   - statuses: backlog, now, blocked, done
   - simple assignees: Ike, Sales, Research, Ops
   - priority field
   - notes / next step

3. **Sales Board**
   - target accounts
   - market
   - offer fit
   - contact status
   - next touch

4. **System Health**
   - OpenClaw status
   - gateway status
   - watchdog status
   - last recovery event

## Agent Lanes
- **Ike** — orchestrator
- **Sales** — outreach, leads, account strategy
- **Research** — markets, products, bids, summaries
- **Ops** — stability, monitoring, integrations, tools

## What to keep from Josh's system
- mission control concept
- named work lanes
- task statuses
- blocker handling
- checkpoints / notes
- future dispatcher idea

## What to skip for now
- PostgreSQL requirement
- complex REST backend first
- too many agents
- GitHub PR automation
- multiple timers for everything
- done-file protocol
- deep auto-dispatch loops

## Reminder Rule
When the lean system is stable and genuinely limiting us, explicitly remind Nick that we are ready to consider the larger reference architectures.

## Build Order
### Phase 1
- local dashboard UI
- task board UI
- editable status blocks
- sales board section
- health section

### Phase 2
- local JSON data source
- buttons to update status
- refresh/load from local files
- browser-friendly layout

### Phase 3
- auto-read watchdog state
- auto-read current priorities/tasks
- lightweight dispatch rules

### Phase 4
- optional sub-agents
- optional API/backend
- optional full automation

## Current Working Model
- direct chat = command center
- mission control = visual operating board
- email = fallback and deliverables
- automation = only where it is proven stable

## First Deliverable
Turn mission control into a more interactive local app with:
- task cards
- lane columns
- sales target cards
- health tiles
- clearer current-status feed

## Auto-Sync Direction
Use an append-only local event log plus a small reducer that writes `mission-control/status.json`.

Reference plan:
- `mission-control/AUTO_SYNC_PLAN.md`

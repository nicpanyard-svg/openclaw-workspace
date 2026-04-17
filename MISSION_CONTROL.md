# Mission Control

## 1. Current Priorities
- [ ] Stabilize OpenClaw responsiveness
- [ ] Finish browser access
- [ ] Build lead hunting workflow
- [ ] Build LinkedIn/outreach workflow

## 2. What Ike Is Working On
- Browser integration / relay access
- Stability monitoring / watchdog
- Sales positioning for iNet stack

### Browser status
- Browser side is mostly complete
- Relay extension installed and ON
- Node Host installed and running
- Remaining blocker: OpenClaw gateway/browser handshake closes too early
- Current plan: one focused pass on logs, config match, and Node Host/gateway path

## 3. Active Blockers
- OpenClaw gateway/browser handshake still failing
- Telegram group access not confirmed yet
- Browser work can destabilize chat session

## 4. Sales Focus
### Core markets
- Renewables / solar EPCs
- Utilities
- Midstream
- SLED
- Flood warning systems
- Environmental monitoring

### Core offers
- Starlink
- Starlink Data Pool
- SecureLynk
- RAD SecFlow-1p
- Ilios Integrators
- HydraGauge
- Axis
- Alertus

## 5. Top Target Accounts
- SOLV Energy
- Blattner
- DEPCOM Power
- Rosendin
- Burns & McDonnell
- Primoris Renewable Energy

## 6. Communication Rules
- Nick gets top-priority replies
- Use shorter, more visual explanations
- Use only the sending mailbox's contact info in signatures
- Routine partner/internal emails can move faster

## 7. Stability / Monitoring
- Watchdog scheduled every 5 minutes
- Repeated failures -> run doctor -> email Nick's work email
- Manual fallback: email subject contains "down"
- Watchdog currently depends on Gmail auth staying valid after Google OAuth rotation

## 8. Next Decisions
- If browser access fails after 3 real attempts, switch approach
- Keep fixing roadblocks visible and explicit

## 9. Build Calendar
- See `BUILD_CALENDAR.md` for active work, tomorrow targets, and deferred items.

## 10. Notes
- Mission Control should become the simple control room for ops, sales, blockers, and next actions.
- Anything important discussed with Nick should be reflected into the project board so conversations become tracked work, not just chat history.

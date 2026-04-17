# Focused Build Block Rule

## Purpose
Prevent operational reminder noise, recurring checks, and low-value chatter from derailing product execution.

## Rule
When a real product deliverable is in progress, treat the session as a focused build block.

During a focused build block:
- recurring reminder traffic is silent by default
- operator/status chatter should not interrupt build work
- only true exceptions should surface to Nick

## Allowed Interruptions
Only interrupt for:
- direct user asks from Nick
- meeting requests
- availability replies
- real blockers requiring Nick
- real system failures that stop the build/workflow

## Not Worth Interrupting
Do not surface these during a build block unless Nick explicitly asks:
- recurring Mike inbox reminders
- generic status loops
- "good morning" / fluff / filler updates
- operator process narration
- low-value reminder restatements

## Work Split
- Builder mode: execute the current deliverable to completion
- Operator mode: handle recurring business/ops checks
- If possible, UI and implementation work should be delegated to Jill when she is idle and suited for it.

## Completion Standard
A build block ends only when the current small deliverable is complete or a true exception occurs.

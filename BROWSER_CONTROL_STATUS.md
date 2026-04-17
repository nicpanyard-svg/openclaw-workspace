# Browser Control Status

Date: 2026-03-20

## Outcome

Autonomous browser control is working through the supported OpenClaw path:
- local OpenClaw gateway
- `openclaw browser` CLI
- dedicated OpenClaw Chrome profile over CDP

This is the stable path to use now.

## What was wrong

The main confusion/blocker was treating browser control like the old relay/extension handshake path.

What I found:
- `openclaw browser status` and `openclaw browser start` work and bring up a dedicated Chrome profile on CDP (`http://127.0.0.1:18800`).
- The local browser itself is healthy and controllable.
- The old relay/handshake assumption is stale. The supported path here is direct OpenClaw browser/CDP control, not depending on a separate manual extension relay handshake for normal operation.
- Some browser RPCs can fail with:
  - `gateway closed (1000 normal closure): no close reason`
- I reproduced that most reliably when issuing multiple browser RPCs in parallel, and also on some screenshot/media-style operations.

## Verified working workflow

These worked successfully:
1. `openclaw browser start --json`
2. `openclaw browser open https://example.com --json`
3. `openclaw browser snapshot --json`
4. `openclaw browser navigate https://duckduckgo.com/?q=openclaw --json`
5. `openclaw browser wait --load networkidle --timeout-ms 20000`
6. `openclaw browser snapshot --json`
7. Browser navigation continued through to `https://github.com/openclaw/openclaw`

That confirms repeatable launch/open/navigate/interact/read behavior.

## Remaining rough edge

Not fully resolved:
- `openclaw browser screenshot --json` hit gateway normal-closure.
- Parallel browser commands appear unsafe and can provoke gateway closure.

## Practical rule

Use browser commands **serially**, not in parallel.

Good:
- start
- navigate/open
- wait
- snapshot
- click/type
- wait
- snapshot

Avoid:
- concurrent `openclaw browser ...` calls
- assuming extension/relay handshake is required for basic browser autonomy

## Next action

If full screenshot/media capture is required, inspect/fix the gateway path for screenshot handling specifically. But core autonomous browsing is already usable today through the supported CDP path.

# Slack Watcher Prototype

First-pass always-on Slack DM watcher for the Maton Slack connection.

## What it does
- Polls the DM channel with Nick's Slack user
- Logs new inbound messages to `monitoring/slack-watcher.log`
- Tracks state in `monitoring/slack-watcher-state.json`
- Optional `-PostAck` mode posts a thread reply acknowledging the message

## Current limitations
- This is **not** the full intelligent assistant bridge yet
- It does not route Slack messages back into OpenClaw automatically
- It is a polling prototype, not a production event-driven integration

## Run once test
```powershell
$env:MATON_API_KEY='YOUR_KEY'
powershell -ExecutionPolicy Bypass -File .\scripts\slack-watcher.ps1 -RunOnce -PostAck
```

## Run continuously
```powershell
$env:MATON_API_KEY='YOUR_KEY'
powershell -ExecutionPolicy Bypass -File .\scripts\slack-watcher.ps1 -PostAck
```

## Background control
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-slack-watcher.ps1 -MatonApiKey 'YOUR_KEY' -PostAck
powershell -ExecutionPolicy Bypass -File .\scripts\slack-watcher-status.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\stop-slack-watcher.ps1
```

## Current wiring
- Maton Slack connection id: `2923502d-646b-426f-b2da-952319f3d379`
- Nick Slack user id: `U0AMU2BEKJ4`
- Workspace: `Calumet Sales Development`

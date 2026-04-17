# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## Gateway Restart
If I go silent, WAIT up to 5 minutes before restarting — API timeouts self-recover.
If you must restart, use the clean script: `scripts/restart-gateway.ps1`
Do NOT use `openclaw gateway restart` directly — it spawns duplicates without killing the old instance.

## Vapi.ai (AI Calling)
- Private API Key: dccd423d-f06d-4a71-8f8b-19cb16d334a3
- Phone number: +18304579227
- Phone number ID: 3ff6d72c-fe24-4f49-ade1-d3ba8995acaa
- Assistant ID: 3f42402d-a376-4299-b07c-f081dfd44d5b (Mike - iNet Sales Agent)
- Purpose: Mike uses Vapi to make outbound cold calls to prospects
- To make a call: POST https://api.vapi.ai/call with assistantId + phoneNumberId + customer.number

## Open tasks / setup notes

- Build a monitor/watchdog for assistant downtime so if Telegram/OpenClaw chat goes down, Nick can be alerted via email at `nick.panyard@inetlte.com`.

Add whatever helps you do your job. This is your cheat sheet.

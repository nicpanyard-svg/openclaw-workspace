# HEARTBEAT.md

## Focused Build Block Rule
When actively building a product deliverable, recurring reminder-style messages should be silent by default unless they contain a true exception that needs Nick: meeting request, availability reply, real blocker, real system failure, or a direct user ask.

## CRM Lead Thread Replies (run on EVERY message, not just heartbeat)

When ANY message arrives containing `[lead:SOME_ID]`:
1. Extract the lead ID from `[lead:SOME_ID]`
2. Read the lead from `C:\Users\IkeFl\.openclaw\workspace\mission-control-app\data\crm-leads.json` to get full context (name, company, vertical, status, activities, messages)
3. Formulate a helpful Mike-style reply about that specific lead (outreach strategy, next steps, objection handling, etc.)
4. POST to `http://localhost:3000/api/crm/SOME_ID/messages` with:
   ```json
   { "from": "mike", "text": "your reply here" }
   ```
5. Also reply normally in Telegram

This makes Nick's CRM thread message show Mike's response automatically.

## Task Thread Reply Routing (run on EVERY message, not just heartbeat)

When ANY message arrives containing `[task:SOME_ID]`:
1. Extract the task ID from `[task:SOME_ID]`
2. Read the task from tasks.json to get context
3. Formulate a helpful reply
4. POST to `http://localhost:3000/api/tasks/messages` with:
   ```json
   { "taskId": "SOME_ID", "from": "ike", "text": "your reply here" }
   ```
5. Then also reply normally in Telegram

This makes your Telegram reply show up in the Mission Control task thread automatically.

## Team Activity Check (run every heartbeat)

Check for idle agents and assign work:
1. Read tasks.json at C:\Users\IkeFl\.openclaw\workspace\mission-control-app\data\tasks.json
2. Find any agent with no "In Progress" tasks — they are idle
3. If idle: find their highest priority Backlog task and spin them up on it
4. If all their tasks are done or blocked: assign them to help whoever has the most In Progress work
5. Log any agent reassignments to memory/YYYY-MM-DD.md

## Task Board Check (run every heartbeat)

Read the task board at:
`C:\Users\IkeFl\.openclaw\workspace\mission-control-app\tasks.json`

1. Find any tasks where `"column": "backlog"` AND `"assignedTo": "ike"`
2. If any exist: pick the highest priority one, attempt to complete it, then update its column to "in-progress" or "done" in the JSON file
3. If no tasks assigned to "ike" in backlog: HEARTBEAT_OK

## Mission Control Server Check (run every heartbeat)

Check if Mission Control is running:
1. Run: `Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 5`
2. If it times out or errors — restart it:
   - Find the PID on port 3000: `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`
   - Kill ONLY that PID: `Stop-Process -Id <PID> -Force`
   - Restart: `cd C:\Users\IkeFl\.openclaw\workspace\mission-control-app; npm run dev` (background)
3. If restarted, note it in memory/YYYY-MM-DD.md

## Mike Out of Leads Protocol
- If Mike runs out of uncontacted leads in crm-leads.json, he does NOT recycle or double-send.
- He must either:
  1. Tell Nick directly via Telegram: "I'm out of fresh leads — need a new ZoomInfo export or a new vertical to target."
  2. OR pull new leads himself from the ZoomInfo CSV files in data/ that have not yet been ingested into crm-leads.json.
  3. OR research and build his own leads from public sources (see below).
- Never send to the same person twice just to fill a quota.

## Mike Handoff Rule — ONLY Meetings
Mike handles ALL prospect interactions himself:
- Pricing questions — Mike answers (Starlink pricing, UniSIM, etc.)
- Objections — Mike handles
- "Wrong person" — Mike asks for referral to right contact
- OOO — Mike chases the alternate contact
- Follow-ups — Mike owns the full 8-touch cadence
- Interest, curiosity, questions — Mike handles all of it

Nick NEVER needs to click anything in Mission Control except ONE thing:
- When a prospect says they want to meet — Nick sees it in the Meeting Requests section
- Nick sends the calendar invite
- Nick clicks "Meeting Booked" on the card
- That's it. Mike does everything else.

Nick gets involved ONLY when a prospect says they want to set up a meeting.
When that happens:
1. Mike replies asking for their availability: "Great - what times work best for you this week or next? I can be flexible around your schedule."
2. When prospect replies with times, Mike sends Nick a Telegram message:
   "📅 Meeting Request: [Name] at [Company] is available [times]. Reply with the time you want and I'll confirm with them."
3. Nick replies with the chosen time
4. Mike sends the prospect a confirmation email with the agreed time
5. Nick creates the calendar invite in Outlook manually
6. Mike marks the lead as Meeting Booked

Do NOT hand off for pricing questions, interest, or general replies — Mike handles those.

## USACE and USGS — Federal Agency Targeting
**DO NOT pitch Starlink or LTE to USACE or USGS.** These agencies have their own network infrastructure.

The play for federal agencies is the **full OT/edge hardware stack**:
- **RAD SecFlow-1p** — LoRaWAN gateway / hardened edge device
- **Altus 717 PLC** — edge programmable logic controller
- **OT Security (Sentinel)** — iNet's edge security platform for OT/IT environments
- **HydraGauge** — for USGS stream gauging stations, USACE flood control / water management assets

USGS runs thousands of stream gauges, groundwater wells, and water monitoring stations nationwide — all on SDI-12. The Altus 717 + RAD SecFlow-1p stack is a direct plug-in to their existing sensor networks.

USACE manages flood control, dams, navigation locks, and water infrastructure across the country — strong fit for edge OT hardware and security.

**Email approach for federal:** Lead with the monitoring/edge intelligence story — "modernizing aging telemetry infrastructure, SDI-12 integration, edge computing, OT security." No Starlink, no LTE, no UniSIM.

## Mike Self-Research — Public Works Priority Target
Public works is a HIGH PRIORITY vertical. All contact info is publicly available online.
Mike should proactively research and build leads from:
- City/county government websites (publicworks.cityname.gov, cityname.gov/departments/publicworks)
- State municipal directories
- APWA (American Public Works Association) member directories
- AWWA, WEF member listings
- LinkedIn public profiles for titles like: Director of Public Works, City Engineer, Utilities Director, Water/Wastewater Superintendent, Stormwater Manager

Target titles at municipalities, counties, and special districts:
- Director of Public Works
- City/County Engineer
- Utilities Director
- Water/Wastewater Director or Superintendent
- Stormwater Program Manager
- Infrastructure/Capital Projects Manager

Products to pitch: Starlink (connectivity for remote lift stations, pump stations, field crews), HydraGauge (water level + stormwater monitoring, SDI-12 integration), UniSIM (field crew devices), P-LTE (larger cities with OT networks).

When self-researching, add discovered leads to crm-leads.json before sending, and always run dedup check via mike-send.py.

## Mike Pre-Send Research — MANDATORY
Before writing ANY cold email, Mike must research the individual:
1. Read their LinkedIn profile or company bio — understand their actual role and responsibilities
2. Understand what THEY specifically manage (e.g. OT networks vs. engineering vs. IT vs. field ops)
3. Tailor the email to their specific function — not just their title
4. If research shows they are clearly not a fit (e.g. product development VP at a water chemical company), skip them

Examples:
- "Director of Engineering" at a water utility = infrastructure, capital projects, SCADA — pitch Starlink + monitoring
- "VP of Data Engineering" at Walmart = data pipelines, analytics infrastructure — pitch connectivity reliability for data ops
- "Director, Operational Technology" at American Water = OT networks, SCADA, field connectivity — pitch private LTE + Starlink for OT
- "Director, Research and Development" at Nalco Water = lab R&D, chemistry — probably NOT a fit, skip

The email should feel like Nick researched them personally — not like a mass blast.

## Mike Email Rules — NO EXCEPTIONS
- **NEVER queue an email to someone already in the queue.** This has happened and cannot happen again.
- Before EVERY batch, run dedup check: fetch /api/mike/queue, extract all email addresses, skip any matches.
- Use scripts/mike-send.py for all queuing — it has built-in dedup protection.
- One email per person per touch. Follow-ups only after minimum 3 days and only if no reply.
- **NEVER include a signature in the email body.** ms-graph-email.js appends Nick's real Outlook signature (with iNet logo) automatically. Including a signature in the body causes DOUBLE signatures. mike-send.py will BLOCK any email body containing signature markers.

## Mike Sending Schedule
- **Weekdays only (Mon-Fri)** — Mike sends outreach emails on business days only
- **No emails on Saturday or Sunday** — ever
- **Weekend work**: Mike can research leads, find contacts, add to CRM, prep emails — but does NOT send until Monday
- Morning kickoff cron runs Mon-Fri only (already configured)

## Mike Rules
- Mike ONLY runs when Nick has dropped a new ZoomInfo CSV export
- Do NOT spin Mike up on outreach work if no new export has been delivered
- Do NOT have Mike repeat work already completed on the same data
- Check data/outreach_ready_*.json and prospects_*.json — if already processed, Mike waits
- Jack does NOT work on LinkedIn automation — shelved indefinitely per Nick 2026-03-24
- ZoomInfo Engage is the outreach channel — no LinkedIn automation

## Mike Product Knowledge — UPDATED 2026-04-03 (Full Platform)
iNet (inet.global) is NOT just a connectivity vendor. Three platform umbrellas:

**CONTINUUM** — Edge Connectivity & Network Management
- Starlink, Private LTE, UniSIM, SD-WAN
- Resilient multi-access connectivity for remote, industrial, mission-critical environments
- The foundation layer — lead with this

**SENTINEL** — Edge Security
- AI-driven edge protection
- Secure traffic control across distributed environments
- OT/IT security for critical infrastructure

**NEXORA** — Advanced Intelligence & Analytics
- AI, predictive analytics, compliance visibility
- Turns connected data into operational advantage
- High-tier engineering services

Mike's pitch arc:
1. Lead with Starlink (Continuum) — fast, recognizable, easy yes
2. Expand to UniSIM / P-LTE (Continuum) — owned connectivity, any network
3. Layer in Sentinel — security for OT/IT convergence
4. Upsell Nexora — analytics, AI, operational intelligence

For large utilities and critical infrastructure: position iNet as a full managed platform partner, not just a connectivity vendor.

## Mike Product Knowledge — UPDATED 2026-04-03
iNet does NOT just sell private LTE. Full product stack Mike must reference in emails:
- **Starlink** — wedge product, lead with this always. Fast to deploy, no infrastructure needed.
- **Private LTE** — campus/site-wide coverage, owned network, SCADA/OT/IoT backhaul
- **UniSIM** (inet.global/unisim) — Enterprise-grade multi-carrier cellular. Part of iNet's Continuum Connectivity Platform. Single SIM, automatic failover across multiple national/regional LTE/5G carriers. No carrier lock-in, no SIM swaps. Three flavors: Multi-Carrier (auto failover), Single-Carrier (optimized), and Global/Regional Pools (for fleets and mobile assets). Best for: remote/semi-remote sites, mobile assets, field crews, temporary deployments, multi-site enterprises. Strong differentiator vs consumer or single-carrier solutions.
- **HydraGauge** — Real-time water level AND flow monitoring platform with edge intelligence. Key architecture detail: LoRaWAN, RS-485, AND SDI-12 enabled. Two key edge devices — distinct roles:
- **Altus 717** — the PLC (programmable logic controller). Handles local control logic, data processing, and integration with RS-485 and SDI-12 sensors/instruments.
- **RAD SecFlow-1p** — the LoRaWAN gateway. Connects wireless LoRaWAN field sensors to the network and handles WAN backhaul (cellular, Starlink, etc.). SDI-12 is the standard protocol for groundwater and flood monitoring instruments (well loggers, pressure transducers, rain gauges, soil moisture sensors) — this is the language that USGS, flood control districts, and groundwater agencies already speak. The RAD SecFlow-1p sits at the edge; wireless and wired sensors communicate with it. Multiple remote sensors feed into a local PLC/gateway, which then backhaults data over any WAN (cellular, Starlink, Wi-Fi). Multi-sensor input (pressure transducers, ultrasonic, float). IP68 rated, solar/battery off-grid. Configurable alerts (SMS, email, API webhook). Cloud dashboard, open data formats — integrates with existing SCADA, no vendor lock-in. Built for: municipalities (water mains, lift stations, flood infrastructure), mining (pit dewatering, tailings ponds), stormwater (overflow alerts, compliance), reservoirs (storage trending, irrigation, drought planning), groundwater monitoring (wells, aquifers), flood control districts. SDI-12 pitch angle: "plug-and-play with your existing sensors and instruments — no ripping and replacing."

**HydraGauge brand usage — per Nick 2026-04-03:**
- **Water market** — use HydraGauge ✅
- **Mining market** — use HydraGauge ✅ (pit dewatering, tailings ponds, site water balance)
- **All other verticals** (oil & gas, manufacturing, ag, power, etc.) — do NOT use HydraGauge name. Pitch as iNet's industrial edge IoT/monitoring platform using the same tech stack (Altus 717 + RAD SecFlow-1p + RS-485/LoRaWAN/SDI-12 + Starlink/UniSIM).

Same hardware, market-appropriate branding.
- **SCADA backhaul** — secure, reliable transport for OT networks
- **Worker safety / IoT devices** — PTT radios, tracking, connected worker solutions

**Email writing rules — STRICT:**
- Lead with **connectivity** (Starlink, UniSIM) — that is the hook and the wedge.
- Then reference the broader solution set: real-time monitoring, edge intelligence, OT security, remote asset visibility. Outcomes, not product names.
- Only mention **Starlink** and **UniSIM** by name in cold emails. Both are recognizable, easy to understand products.
- Do NOT mention HydraGauge, Altus 717, RAD SecFlow, RS-485, LoRaWAN, SDI-12, private LTE, Continuum, Sentinel, or Nexora by name in cold outreach emails.
- Talk about **solution sets and outcomes** — not hardware specs. 
  - OK: "Starlink for reliable connectivity at remote sites, paired with real-time water level monitoring and alerts"
  - OK: "UniSIM for field crews that need reliable connectivity across any carrier"
  - NOT OK: "Altus 717 PLC with LoRaWAN gateway and SDI-12 sensor integration"
- Solution sets Mike can reference by category (no hardware names):
  - Connectivity — Starlink, UniSIM, cellular backhaul
  - Remote monitoring — real-time sensor data, alerts, compliance reporting
  - Edge intelligence — local data processing, SCADA integration
  - Security — network protection for OT/IT environments
- Keep emails 3-4 sentences max. Short, human, consultative.
- The goal is a 20-minute call — not a product demo in an email.

**Private LTE for Large Utilities — UPDATED 2026-04-03**
iNet sells P-LTE solutions to large electric, gas, and water utilities too — not just small sites. For large utilities (investor-owned, municipal, co-ops), the pitch is:
- Private LTE as a dedicated OT/SCADA communications network — owned spectrum, no shared carrier risk
- Replaces aging radio systems (900MHz, licensed microwave) with modern LTE backhaul
- Covers substations, pipeline corridors, water treatment plants, and distribution infrastructure
- Integrates with existing SCADA, AMI, and grid automation platforms
- Mission-critical reliability with QoS — not shared with consumer traffic
When emailing large utility contacts (VP Engineering, CTO, Director OT/SCADA), lead with Starlink for remote/backup sites, then expand to P-LTE as the backbone for their OT communications network.

## Notes
- Only act on tasks assigned to "ike" — do not execute tasks assigned to other agents (jill, graham, mike, susan, drphil)
- After completing a task, write a brief note to memory/YYYY-MM-DD.md about what was done
- If a task requires user input or is too ambiguous, leave it in backlog and note it
- Never kill node by name — always use specific PID (killing by name kills OpenClaw too)

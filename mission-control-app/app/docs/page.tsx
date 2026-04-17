"use client";

import { useState, useMemo } from "react";

/* ── Types ── */
interface Doc {
  slug: string;
  title: string;
  lastUpdated: string;
  content: string;
}

interface Category {
  name: string;
  docs: Doc[];
}

/* ── Documentation Data ── */
const CATEGORIES: Category[] = [
  {
    name: "Getting Started",
    docs: [
      {
        slug: "what-is-mission-control",
        title: "What is Mission Control",
        lastUpdated: "2026-03-21",
        content: `<h2>Overview</h2>
<p>Mission Control is the central dashboard for Nick's multi-agent workspace. It provides a unified interface to monitor, manage, and coordinate a team of five AI agents that work autonomously on tasks ranging from stock research to product development.</p>

<h3>Why Mission Control Exists</h3>
<p>Running multiple agents across different domains creates coordination challenges. Without a central hub, it's easy to lose track of what each agent is working on, what's blocked, and what shipped. Mission Control solves this by providing:</p>
<ul>
<li><b>Real-time agent status</b> — see who's active, idle, or blocked at a glance</li>
<li><b>Task management</b> — a Kanban board for tracking work across agents</li>
<li><b>Memory persistence</b> — long-term memory and daily notes that survive across sessions</li>
<li><b>Tool access</b> — launch stock analysis, lead research, and other tools from one place</li>
<li><b>Calendar scheduling</b> — view and manage agent schedules and recurring jobs</li>
</ul>

<h3>Architecture</h3>
<p>Mission Control is a Next.js application with a Linear-inspired dark design system. Data is stored locally via localStorage and a lightweight JSON file API. The app runs locally and is designed for single-user operation by Nick, coordinated through Ike (the orchestrator agent).</p>`,
      },
      {
        slug: "how-agents-work",
        title: "How Agents Work",
        lastUpdated: "2026-03-21",
        content: `<h2>The Agent Team</h2>
<p>The workspace runs five specialized agents, each with a distinct role. They operate autonomously but coordinate through Ike, the orchestrator. The core principle is simple: <b>agents must never stop and wait</b>. They continue to the next useful step unless there is a real permission or risk boundary.</p>

<h3>The Five Agents</h3>
<ul>
<li><b>Susan (Planner)</b> — Sets weekly priorities, manages scope, ensures the team focuses on what matters most. She runs a weekly cadence review and adjusts plans based on what shipped.</li>
<li><b>Jill (Builder)</b> — The product engineer. She builds features, ships UI, and handles the technical implementation of whatever the team decides to build next.</li>
<li><b>Dr. Phil (Reliability)</b> — The watchdog. He monitors system health, runs checks, surfaces issues before they become outages, and ensures nothing silently breaks.</li>
<li><b>Mike (Sales)</b> — Handles target account research, offer development, and lead outreach. He identifies prospects and crafts messaging that resonates.</li>
<li><b>Graham (Stocks)</b> — Manages the stock research board. He scores equities, tracks commodity positions, runs paper trades, and maintains the investment thesis for each position.</li>
</ul>

<h3>How They Collaborate</h3>
<p>Ike sits at the center as the orchestrator. When Nick gives a command, Ike determines which agent should handle it, delegates the work, and tracks completion. Agents communicate status updates back through Ike, who surfaces blockers and progress to Nick.</p>
<p>Major blockers are surfaced immediately. Agents don't wait for permission to continue productive work — they find the next useful step and keep moving. This bias toward action is a core operating principle.</p>`,
      },
      {
        slug: "talking-to-ike",
        title: "Talking to Ike",
        lastUpdated: "2026-03-21",
        content: `<h2>Communicating with the System</h2>
<p>Ike is the primary interface between Nick and the agent team. You interact with Ike through Slack or directly through Claude Code sessions. Ike interprets your intent, delegates to the right agent, and reports back.</p>

<h3>What Ike Can Handle</h3>
<ul>
<li><b>Task delegation</b> — "Have Graham analyze NVDA" or "Tell Jill to build a settings page"</li>
<li><b>Status checks</b> — "What's everyone working on?" or "Is anything blocked?"</li>
<li><b>Memory operations</b> — "Remember that we're freezing deploys after Thursday"</li>
<li><b>Multi-step workflows</b> — "Research 5 SaaS companies, score them, and add the best to the stock board"</li>
<li><b>System operations</b> — "Run the morning health check" or "Update the calendar"</li>
</ul>

<h3>Best Practices</h3>
<ul>
<li><b>Be specific about outcomes</b> — "Build a sortable table with columns for name, score, and price" is better than "make a table"</li>
<li><b>Name the agent if you have a preference</b> — otherwise Ike will choose the best fit</li>
<li><b>Flag urgency explicitly</b> — "This is P0" or "This can wait until next week"</li>
<li><b>Check Mission Control</b> — the dashboard shows real-time status, so check it before asking "what's happening?"</li>
</ul>

<p>Ike keeps a running log of blockers and issues, actively finding pathways and workarounds rather than letting them stall. If something is truly stuck, Ike will report it plainly rather than hiding behind vague status messages.</p>`,
      },
    ],
  },
  {
    name: "Agent Guides",
    docs: [
      {
        slug: "susan-planner",
        title: "Susan \u2014 Planner",
        lastUpdated: "2026-03-21",
        content: `<h2>Role</h2>
<p>Susan is the planning and prioritization agent. She ensures the team works on the right things in the right order, manages scope, and runs a weekly cadence to keep work aligned with goals.</p>

<h3>Weekly Cadence</h3>
<ul>
<li><b>Monday</b> — Reviews what shipped last week, identifies carryover items, sets the week's priorities</li>
<li><b>Wednesday</b> — Mid-week check: are we on track? Adjusts priorities if blockers have shifted the plan</li>
<li><b>Friday</b> — End-of-week review: what shipped, what slipped, what to carry forward</li>
</ul>

<h3>How She Sets Priorities</h3>
<p>Susan considers three factors: <b>impact</b> (does this move the needle?), <b>urgency</b> (is there a deadline or dependency?), and <b>effort</b> (can this be done quickly?). She biases toward shipping visible progress over planning perfection.</p>
<p>When conflicts arise between agents needing the same resources or attention, Susan arbitrates. Her decisions can be overridden by Nick, but she provides a default execution order so the team doesn't stall debating priorities.</p>`,
      },
      {
        slug: "jill-builder",
        title: "Jill \u2014 Builder",
        lastUpdated: "2026-03-21",
        content: `<h2>Role</h2>
<p>Jill is the product engineering agent. She builds features, ships UI, and handles technical implementation. Her primary project is iNet World, but she also builds internal tools, dashboards, and whatever the team needs next.</p>

<h3>How to Request Builds</h3>
<ul>
<li><b>Feature requests</b> — describe the desired outcome, not the implementation. "I want a sortable stock board with live prices" is better than "create a React component with useSortableData hook"</li>
<li><b>Bug fixes</b> — describe the expected vs. actual behavior, include reproduction steps if possible</li>
<li><b>Design specs</b> — reference existing screens for consistency. "Make it look like the Tasks page" is very helpful</li>
</ul>

<h3>Tech Stack</h3>
<p>Jill primarily works with Next.js, React, TypeScript, and Tailwind CSS. The Mission Control app follows the Linear design system with a dark theme. She uses localStorage for client-side persistence and JSON file APIs for server-side data.</p>
<p>When building new features, Jill follows the existing patterns: "use client" components, consistent spacing (p-8 max-w-[1100px] wrappers), and the established color palette (bg-[#0f0f10], border-[#2a2a2d], etc.).</p>`,
      },
      {
        slug: "dr-phil-reliability",
        title: "Dr Phil \u2014 Reliability",
        lastUpdated: "2026-03-21",
        content: `<h2>Role</h2>
<p>Dr. Phil is the reliability and watchdog agent. He monitors system health, runs automated checks, and surfaces issues before they become outages. He's the safety net that ensures nothing silently breaks.</p>

<h3>Watchdog Setup</h3>
<p>Dr. Phil runs periodic health checks across the workspace systems. This includes verifying that agents are responsive, checking that scheduled jobs ran successfully, and monitoring for stale data or broken integrations.</p>

<h3>Health Checks</h3>
<ul>
<li><b>Agent heartbeat</b> — verifies each agent has reported status within the expected window</li>
<li><b>Task staleness</b> — flags tasks that have been "In Progress" for too long without updates</li>
<li><b>Integration status</b> — checks external connections (browser gateway, APIs)</li>
<li><b>Data integrity</b> — ensures core files haven't been corrupted or accidentally overwritten</li>
</ul>

<h3>How Alerts Work</h3>
<p>When Dr. Phil detects an issue, he surfaces it as a blocker on the Mission Control dashboard. Critical issues are reported immediately to Ike, who escalates to Nick. Non-critical issues are logged and included in the next status update.</p>
<p>The Health Signals section on the Dashboard page shows real-time status dots for each monitored system. Green means healthy, amber means warning, red means action needed.</p>`,
      },
      {
        slug: "mike-sales",
        title: "Mike \u2014 Sales",
        lastUpdated: "2026-03-21",
        content: `<h2>Role</h2>
<p>Mike is the sales and outreach agent. He researches target accounts, develops offers, identifies market segments, and crafts outreach messaging. He works closely with the Sales screen in Mission Control.</p>

<h3>Target Accounts</h3>
<p>Mike maintains a pipeline of target accounts, tracking each company's vertical, offer fit, last touch date, and current status. He researches companies to understand their pain points and match them to relevant offers.</p>

<h3>Offers</h3>
<p>The offer catalog includes different service packages that can be positioned to prospects. Mike evaluates which offers fit which accounts based on company size, vertical, and stated needs. Offers are categorized and displayed on the Sales screen.</p>

<h3>How to Run Lead Research</h3>
<ul>
<li><b>Add a target</b> — tell Ike to "have Mike research [Company]" and he'll pull together a profile</li>
<li><b>Score fit</b> — Mike evaluates how well each offer matches the prospect's needs</li>
<li><b>Draft outreach</b> — Mike can compose personalized messages based on research findings</li>
<li><b>Track touches</b> — every interaction is logged with a timestamp on the Sales screen</li>
</ul>`,
      },
      {
        slug: "graham-stocks",
        title: "Graham \u2014 Stocks",
        lastUpdated: "2026-03-21",
        content: `<h2>Role</h2>
<p>Graham is the stock and commodities research agent. He manages the Graham Stock Board — a comprehensive equity analysis tool with scoring, paper trading, and live price tracking.</p>

<h3>Board Structure</h3>
<p>The stock board tracks 36+ equities and commodities. Each position has a thesis, a composite score, live pricing data, and paper trading records. Graham maintains and updates these positions based on market data and fundamental analysis.</p>

<h3>Scoring System</h3>
<p>Each stock receives a composite score (0-100) based on multiple factors including fundamentals, technicals, momentum, and thesis strength. Scores are banded into tiers:</p>
<ul>
<li><b>80-100 (Strong Buy)</b> — high conviction, thesis intact, strong fundamentals</li>
<li><b>60-79 (Buy)</b> — positive outlook with some caveats</li>
<li><b>40-59 (Hold)</b> — neutral, watching for catalyst or deterioration</li>
<li><b>20-39 (Sell)</b> — thesis weakening, consider reducing position</li>
<li><b>0-19 (Strong Sell)</b> — thesis broken, exit recommended</li>
</ul>

<h3>Paper Trading</h3>
<p>Graham runs paper trades to test strategies without real capital. Each trade is logged with entry price, thesis, target, and stop loss. This provides a track record for evaluating Graham's analysis accuracy over time.</p>

<h3>How to Read the Board</h3>
<p>Open the Graham Stock Board from the Tools screen. Columns show ticker, company name, sector, score, current price, and daily change. Click any row to see the full thesis, paper trade history, and score breakdown. Use the filters to narrow by sector or score band.</p>`,
      },
    ],
  },
  {
    name: "Tools",
    docs: [
      {
        slug: "graham-stock-board",
        title: "Graham Stock Board",
        lastUpdated: "2026-03-21",
        content: `<h2>Using the Stock Board</h2>
<p>The Graham Stock Board is accessible from the Tools screen. It's a comprehensive equity and commodities analysis dashboard that Graham maintains with live data, scoring, and paper trading capabilities.</p>

<h3>Columns</h3>
<ul>
<li><b>Ticker</b> — the stock or commodity symbol (e.g., AAPL, NVDA, GLD)</li>
<li><b>Name</b> — full company or commodity name</li>
<li><b>Sector</b> — industry classification (Tech, Energy, Healthcare, etc.)</li>
<li><b>Score</b> — Graham's composite score (0-100), color-coded by band</li>
<li><b>Price</b> — current market price, updated periodically</li>
<li><b>Change</b> — daily price change, green for up, red for down</li>
<li><b>Thesis</b> — one-line summary of the investment rationale</li>
</ul>

<h3>Score Bands</h3>
<p>Scores are color-coded for quick scanning: green (80+), blue (60-79), gray (40-59), amber (20-39), red (0-19). Higher scores indicate stronger conviction. Scores are updated as new data comes in or when Graham reassesses a position.</p>

<h3>Thesis Break Rules</h3>
<p>Every position has a defined thesis. When the thesis breaks — meaning the original rationale no longer holds — the position should be reviewed for exit. Common thesis breaks include: earnings miss on the core metric, management change affecting strategy, sector rotation undermining the macro case, or regulatory action changing the competitive landscape.</p>`,
      },
      {
        slug: "task-board",
        title: "Task Board",
        lastUpdated: "2026-03-21",
        content: `<h2>How Tasks Flow</h2>
<p>The Task Board is a Kanban-style board with four columns: <b>Backlog</b>, <b>In Progress</b>, <b>Blocked</b>, and <b>Done</b>. Tasks move left to right as they progress through the workflow.</p>

<h3>Creating Tasks</h3>
<p>Click "New Task" to create a task. Each task requires a title and can optionally include a description, assignee (agent name), and priority level (P0, P1, or P2). Tasks are persisted via the /api/tasks endpoint.</p>

<h3>Priority Levels</h3>
<ul>
<li><b>P0 (Critical)</b> — drop everything, this needs to be done now. Shown in red.</li>
<li><b>P1 (High)</b> — important, should be done this cycle. Shown in amber.</li>
<li><b>P2 (Normal)</b> — do when higher priorities are handled. Shown in gray.</li>
</ul>

<h3>Assignee Conventions</h3>
<p>Tasks are assigned to specific agents by name: Susan, Jill, Dr Phil, Mike, or Graham. Ike can also be assigned coordination tasks. Unassigned tasks sit in Backlog until Ike or Susan assigns them based on current priorities and agent availability.</p>

<h3>Heartbeat Task Checking</h3>
<p>Dr. Phil periodically checks for stale tasks — items that have been "In Progress" for an extended period without status updates. Stale tasks are flagged as potential blockers and surfaced on the Dashboard.</p>`,
      },
      {
        slug: "calendar",
        title: "Calendar",
        lastUpdated: "2026-03-21",
        content: `<h2>Agent Schedule Overview</h2>
<p>The Calendar screen shows two views: <b>Agent Schedule</b> and <b>Scheduled Jobs</b>. The schedule view is a weekly grid showing when each agent is active, while the jobs view lists recurring automated tasks.</p>

<h3>Agent Schedule</h3>
<p>The weekly grid displays a 7-day view (Monday through Sunday) across working hours. Color-coded blocks show which agent is handling what during each time slot. Click any block for details including the task description and expected duration.</p>

<h3>Scheduled Jobs</h3>
<p>Scheduled jobs are recurring tasks that run automatically. Each job has a name, schedule (cron-like), assigned agent, and enabled/disabled toggle. Examples include daily health checks, weekly priority reviews, and periodic stock board updates.</p>

<h3>How to Add Scheduled Jobs</h3>
<p>From the Scheduled Jobs tab, click "Add Job" to create a new recurring task. Specify the job name, schedule frequency, responsible agent, and description. Jobs can be enabled/disabled without deleting them, and you can manually trigger any job with the "Run Now" button.</p>
<p>Job configurations are saved to localStorage and persist across sessions. For critical jobs, ensure they're also documented in HEARTBEAT.md so the team has a reference outside the app.</p>`,
      },
    ],
  },
  {
    name: "Reference",
    docs: [
      {
        slug: "workspace-files",
        title: "Workspace Files",
        lastUpdated: "2026-03-21",
        content: `<h2>Key Files</h2>
<p>The workspace contains several important files that agents reference for context, identity, and coordination. These files live in the workspace root and are read by agents at the start of sessions.</p>

<h3>Core Files</h3>
<ul>
<li><b>SOUL.md</b> — Defines who Ike is: the orchestrator agent, central coordinator, responsible for task delegation, memory continuity, and inter-agent communication</li>
<li><b>USER.md</b> — Profile of Nick (the human operator): values visible progress, real output over planning polish, direct communication, wants agents to keep moving autonomously</li>
<li><b>AGENTS.md</b> — Workspace-wide rules and conventions. Operating principles, communication protocols, and the core rule that agents continue to the next best useful step</li>
<li><b>IDENTITY.md</b> — Ike's persona definition: voice, decision-making style, relationship to the broader agent roster</li>
<li><b>MEMORY.md</b> — Index of persistent memories. Points to individual memory files with brief descriptions. Loaded into conversation context automatically</li>
</ul>

<h3>Operational Files</h3>
<ul>
<li><b>TOOLS.md</b> — Documents available tools, APIs, and local environment configuration. Includes Claude Code auth, browser gateway status, and integration points</li>
<li><b>HEARTBEAT.md</b> — Tracks active heartbeat tasks: recurring responsibilities agents must maintain, including daily summaries, watchlist updates, and health checks</li>
<li><b>MISSION_CONTROL.md</b> — Current priorities and active workstreams. What's being built, what's blocked, what ships next</li>
<li><b>BUILD_CALENDAR.md</b> — Build schedule and milestones for ongoing projects</li>
</ul>

<h3>Project Files</h3>
<ul>
<li><b>CLAUDE.md</b> — Per-project instructions for Claude Code sessions. Override default behavior, set project-specific conventions</li>
<li><b>BOOTSTRAP.md</b> — Setup instructions for initializing the workspace from scratch</li>
</ul>`,
      },
      {
        slug: "keyboard-shortcuts",
        title: "Keyboard Shortcuts",
        lastUpdated: "2026-03-21",
        content: `<h2>Mission Control Shortcuts</h2>
<p>The Mission Control app supports keyboard navigation for common actions. These shortcuts work globally across all screens.</p>

<h3>Navigation</h3>
<ul>
<li><b>1-7</b> — Jump to nav items (1 = Dashboard, 2 = Calendar, etc.) when not focused on an input</li>
<li><b>/ (slash)</b> — Focus the search bar (on screens that have one)</li>
<li><b>Esc</b> — Close any open modal or overlay</li>
</ul>

<h3>Task Board</h3>
<ul>
<li><b>N</b> — Open "New Task" form</li>
<li><b>Esc</b> — Cancel and close the task form</li>
<li><b>Enter</b> — Submit the form (when focused on the last field)</li>
</ul>

<h3>General</h3>
<ul>
<li><b>Cmd/Ctrl + K</b> — Quick command palette (planned)</li>
<li><b>Esc</b> — Close modals, cancel edits, dismiss overlays</li>
</ul>

<p>Note: Keyboard shortcuts are disabled when text inputs, textareas, or select elements are focused to prevent conflicts with typing.</p>`,
      },
      {
        slug: "changelog",
        title: "Changelog",
        lastUpdated: "2026-03-21",
        content: `<h2>What Was Built</h2>
<p>A running log of major features and changes shipped in Mission Control and the broader agent workspace.</p>

<h3>2026-03-21</h3>
<ul>
<li><b>Graham Stock Board</b> — Full equity analysis dashboard with 36 stocks, commodities, live prices, scoring, charts, and paper trading</li>
<li><b>Mission Control App</b> — Next.js dashboard with Linear design system. Includes Dashboard, Calendar, Tools, Sales, Tasks, Projects, and Memory screens</li>
<li><b>iNet World</b> — Completed the iNet World product build</li>
<li><b>Agent Calendar</b> — Weekly schedule view with color-coded agent blocks and scheduled jobs management</li>
<li><b>Task Board</b> — Kanban board with API persistence, priority levels, assignee tracking, and status movement</li>
<li><b>Projects Screen</b> — Project list with status filters, progress bars, sorting, and expandable details</li>
<li><b>Memory Screen</b> — Long-term memory editor, daily notes, and core file viewer</li>
<li><b>Sales Screen</b> — Target accounts table, offer catalog, and market segments display</li>
<li><b>Tools Screen</b> — Tool launcher grid with built-in and custom tool support</li>
<li><b>Docs Screen</b> — Internal documentation hub with search, categories, and full content</li>
</ul>

<h3>Planned</h3>
<ul>
<li>Command palette (Cmd+K) for quick navigation</li>
<li>Real-time agent status via WebSocket</li>
<li>Slack integration for notifications</li>
<li>Auto-sync memory to workspace files</li>
</ul>`,
      },
    ],
  },
];

/* ── Flatten for search ── */
const ALL_DOCS = CATEGORIES.flatMap((cat) =>
  cat.docs.map((doc) => ({ ...doc, category: cat.name }))
);

export default function DocsPage() {
  const [selectedSlug, setSelectedSlug] = useState(CATEGORIES[0].docs[0].slug);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Search filtering ── */
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return CATEGORIES;
    const q = search.toLowerCase();
    return CATEGORIES.map((cat) => ({
      ...cat,
      docs: cat.docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q) ||
          cat.name.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.docs.length > 0);
  }, [search]);

  /* ── Current doc ── */
  const current = ALL_DOCS.find((d) => d.slug === selectedSlug);
  const currentCategory = current
    ? CATEGORIES.find((c) => c.docs.some((d) => d.slug === current.slug))?.name
    : null;

  return (
    <div className="p-8 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold text-[#e8e8ea]">Docs</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden px-2.5 py-1 rounded-[5px] border border-[#2a2a2d] text-[11px] text-[#8b8b91] hover:text-[#e8e8ea] transition-colors"
        >
          {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        </button>
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search docs..."
          className="w-full max-w-[400px] bg-[#1c1c1f] border border-[#2a2a2d] rounded-[5px] px-3 py-[7px] text-[13px] text-[#e8e8ea] placeholder-[#55555c] focus:outline-none focus:border-[#5e6ad2] transition-colors"
        />
      </div>

      {/* Breadcrumb */}
      {current && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#55555c] mb-4">
          <span className="text-[#8b8b91]">Docs</span>
          <span>/</span>
          <span className="text-[#8b8b91]">{currentCategory}</span>
          <span>/</span>
          <span className="text-[#e8e8ea]">{current.title}</span>
        </div>
      )}

      {/* Layout: Sidebar + Content */}
      <div className="flex gap-5">
        {/* Sidebar */}
        <aside
          className={`shrink-0 w-[220px] ${
            sidebarOpen ? "block" : "hidden"
          } md:block`}
        >
          <div className="rounded-md border border-[#2a2a2d] bg-[#1c1c1f] p-3">
            {filteredCategories.map((cat) => (
              <div key={cat.name} className="mb-3 last:mb-0">
                <div className="text-[11px] uppercase tracking-wider text-[#55555c] font-medium px-2 mb-1">
                  {cat.name}
                </div>
                <div className="space-y-0.5">
                  {cat.docs.map((doc) => {
                    const active = doc.slug === selectedSlug;
                    return (
                      <button
                        key={doc.slug}
                        onClick={() => {
                          setSelectedSlug(doc.slug);
                          setSidebarOpen(false);
                        }}
                        className={`w-full text-left px-2 py-[5px] rounded-[4px] text-[12px] transition-colors ${
                          active
                            ? "text-[#e8e8ea] bg-[rgba(255,255,255,0.08)]"
                            : "text-[#8b8b91] hover:text-[#e8e8ea] hover:bg-[rgba(255,255,255,0.04)]"
                        }`}
                      >
                        {doc.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <div className="text-[12px] text-[#55555c] italic px-2 py-2">
                No docs match your search.
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {current ? (
            <div className="rounded-md border border-[#2a2a2d] bg-[#1c1c1f] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] font-semibold text-[#e8e8ea]">
                  {current.title}
                </h2>
                <span className="text-[10px] text-[#55555c] bg-[#0f0f10] px-1.5 py-0.5 rounded shrink-0">
                  Updated {current.lastUpdated}
                </span>
              </div>
              <div
                className="doc-content text-[13px] text-[#8b8b91] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: current.content }}
              />
            </div>
          ) : (
            <div className="rounded-md border border-[#2a2a2d] bg-[#1c1c1f] p-5">
              <div className="text-[13px] text-[#55555c] italic">
                Select a doc from the sidebar.
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

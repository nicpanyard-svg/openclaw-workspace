"use client";

import React, { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LiveAgent {
  name: string;
  status: "ACTIVE" | "WARN" | "DOWN";
  currentTask: string;
  lastActive: string;
  blocker: string | null;
  nextStep: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
  deskIcons: string[];
  status: "working" | "idle" | "warn" | "away";
  currentTask: string;
  lastActive: string;
  zone: string;
  x: number;
  y: number;
  blocker: string | null;
  nextStep: string;
}

// ── Static config ──────────────────────────────────────────────────────────────

const AGENT_CONFIG: Record<string, {
  id: string; role: string; color: string; emoji: string;
  deskIcons: string[]; zone: string; x: number; y: number;
}> = {
  Ike:        { id: "ike",    role: "Chief of Staff",       color: "#5e6ad2", emoji: "👔", deskIcons: ["📊", "🗂️"], zone: "Executive Suite",      x: 50,  y: 11 },
  Mike:       { id: "mike",   role: "SDR",                  color: "#f59e0b", emoji: "📞", deskIcons: ["📧", "🔍"], zone: "Sales Floor",          x: 15,  y: 42 },
  Jill:       { id: "jill",   role: "Lead Engineer",        color: "#a855f7", emoji: "💻", deskIcons: ["💻", "⚙️"], zone: "Engineering Bay",      x: 76,  y: 33 },
  Jack:       { id: "jack",   role: "Systems Engineer",     color: "#3b82f6", emoji: "🌐", deskIcons: ["🌐", "🔧"], zone: "Engineering Bay",      x: 82,  y: 49 },
  Graham:     { id: "graham", role: "Market Analyst",       color: "#eab308", emoji: "📈", deskIcons: ["📈", "💰"], zone: "Finance Corner",       x: 84,  y: 76 },
  Susan:      { id: "susan",  role: "Project Manager",      color: "#06b6d4", emoji: "📋", deskIcons: ["📋", "📅"], zone: "Operations Hub",       x: 15,  y: 76 },
  "Dr. Phil": { id: "drphil", role: "Reliability Engineer", color: "#22c55e", emoji: "🖥️", deskIcons: ["🖥️", "🔌"], zone: "Infrastructure Room",  x: 50,  y: 71 },
};

// Rooms — absolute % positions within the floor plan container
const ROOMS = [
  { id: "exec",     label: "Executive Suite",     icon: "🏢", x: 20, y: 1,  w: 60, h: 18, color: "#5e6ad2" },
  { id: "sales",    label: "Sales Floor",         icon: "📞", x: 1,  y: 22, w: 28, h: 34, color: "#f59e0b" },
  { id: "eng",      label: "Engineering Bay",     icon: "⚙️",  x: 67, y: 22, w: 32, h: 34, color: "#a855f7" },
  { id: "ops",      label: "Operations Hub",      icon: "📋", x: 1,  y: 58, w: 28, h: 34, color: "#06b6d4" },
  { id: "infra",    label: "Infrastructure Room", icon: "🖥️", x: 31, y: 22, w: 34, h: 70, color: "#22c55e" },
  { id: "finance",  label: "Finance Corner",      icon: "📈", x: 67, y: 58, w: 32, h: 34, color: "#eab308" },
  { id: "coderoom", label: "Code Room",           icon: "⚡", x: 1,  y: 94, w: 98, h: 5,  color: "#5e6ad2" },
];

const STATUS_COLOR = { working: "#26a86a", idle: "#8b8b91", warn: "#e8a045", away: "#3a3a3d" };
const STATUS_LABEL = { working: "Working",  idle: "Idle",   warn: "Warn",    away: "Away"    };

// ── Helpers ────────────────────────────────────────────────────────────────────

function liveToDisplay(s: string): "working" | "idle" | "warn" | "away" {
  if (s === "ACTIVE") return "working";
  if (s === "IDLE")   return "idle";
  if (s === "WARN")   return "warn";
  return "away";
}

function buildAgents(live: LiveAgent[]): Agent[] {
  return live.map((la) => {
    const c = AGENT_CONFIG[la.name];
    if (!c) {
      return {
        id: la.name.toLowerCase().replace(/[^a-z]/g, ""),
        name: la.name, role: "Agent", color: "#8b8b91", emoji: "👤",
        deskIcons: [], zone: "Lounge", x: 50, y: 50,
        status: liveToDisplay(la.status),
        currentTask: la.currentTask || "Idle",
        lastActive: la.lastActive ? new Date(la.lastActive).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Unknown",
        blocker: la.blocker ?? null, nextStep: la.nextStep ?? "",
      };
    }
    return {
      id: c.id, name: la.name, role: c.role, color: c.color,
      emoji: c.emoji, deskIcons: c.deskIcons, zone: c.zone,
      x: c.x, y: c.y,
      status: liveToDisplay(la.status),
      currentTask: la.currentTask || "Idle",
      lastActive: la.lastActive ? new Date(la.lastActive).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Unknown",
      blocker: la.blocker ?? null, nextStep: la.nextStep ?? "",
    };
  });
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function OfficePage() {
  const [agents, setAgents]         = useState<Agent[]>([]);
  const [selected, setSelected]     = useState<Agent | null>(null);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [liveSessions, setLiveSessions] = useState<{id:string;agent:string;task:string;status:string;startedAt:string;output?:string}[]>([]);
  const [showCodeRoom, setShowCodeRoom] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch("/api/agent-status")
      .then((r) => r.json())
      .then((data) => {
        const built = buildAgents(data.agents ?? []);
        setAgents(built);
        setLastUpdated(data.lastUpdated ?? null);
        setSelected((prev) => prev ? built.find((a) => a.id === prev.id) ?? null : null);
      })
      .catch(() => {});
    fetch("/api/coding-sessions")
      .then((r) => r.json())
      .then((data) => setLiveSessions(data.sessions ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleSelect = (agent: Agent) => {
    if (selected?.id === agent.id) { setSelected(null); setPanelOpen(false); }
    else { setSelected(agent); setPanelOpen(true); }
  };
  const handleClose = () => { setSelected(null); setPanelOpen(false); };

  const working = agents.filter((a) => a.status === "working").length;
  const idle    = agents.filter((a) => a.status === "idle").length;
  const away    = agents.filter((a) => a.status === "away").length;

  const tickerText = agents
    .filter((a) => a.currentTask && a.currentTask !== "Idle")
    .map((a) => `${a.emoji} ${a.name} — ${a.currentTask}`)
    .join("   •   ");

  return (
    <>
      <style>{`
        @keyframes ocl-pulse-ring {
          0%   { transform: scale(1);    opacity: 0.9; }
          70%  { transform: scale(1.55); opacity: 0;   }
          100% { transform: scale(1.55); opacity: 0;   }
        }
        @keyframes ocl-desk-breathe {
          0%, 100% { opacity: 0.12; }
          50%      { opacity: 0.32; }
        }
        @keyframes ocl-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes ocl-dot-blink {
          0%, 100% { opacity: 1;   }
          50%      { opacity: 0.3; }
        }
        .ocl-pulse-ring  { animation: ocl-pulse-ring  2.2s cubic-bezier(0.215,0.61,0.355,1) infinite; }
        .ocl-desk-breathe{ animation: ocl-desk-breathe 3s ease-in-out infinite; }
        .ocl-ticker      { animation: ocl-ticker linear infinite; }
        .ocl-dot-blink   { animation: ocl-dot-blink 2s ease-in-out infinite; }
        .ocl-agent-btn:hover .ocl-tooltip { opacity: 1 !important; pointer-events: auto !important; }
        .ocl-agent-btn { outline: none; }
        .ocl-agent-btn:focus-visible .ocl-avatar-ring { outline: 2px solid #fff; outline-offset: 2px; }
      `}</style>

      <div style={{ background: "#0a0a0c", color: "#e8e8ea", minHeight: "100%" }}>

        {/* ── Status Bar ──────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20,
          padding: "11px 24px",
          borderBottom: "1px solid #16161a",
          background: "#0d0d10",
        }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", color: "#e8e8ea" }}>
            OPENCLAW OFFICE
          </span>
          <div style={{ width: 1, height: 14, background: "#2a2a2d", flexShrink: 0 }} />

          {/* Working */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className={working > 0 ? "ocl-dot-blink" : ""}
              style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#26a86a" }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: working > 0 ? "#26a86a" : "#3a3a3d" }}>{working}</span>
            <span style={{ fontSize: 11, color: "#55555c" }}>Working</span>
          </div>
          {/* Idle */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", opacity: idle > 0 ? 1 : 0.3 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: idle > 0 ? "#f59e0b" : "#3a3a3d" }}>{idle}</span>
            <span style={{ fontSize: 11, color: "#55555c" }}>Idle</span>
          </div>
          {/* Away */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#3a3a3d" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#3a3a3d" }}>{away}</span>
            <span style={{ fontSize: 11, color: "#3a3a3d" }}>Away</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {/* Code Room button */}
            <button
              onClick={() => setShowCodeRoom(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: liveSessions.filter(s => s.status === "running").length > 0 ? "#0d3320" : "#1a1a1d",
                border: `1px solid ${liveSessions.filter(s => s.status === "running").length > 0 ? "#166534" : "#2a2a2d"}`,
                borderRadius: 6, padding: "5px 12px", cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: liveSessions.filter(s => s.status === "running").length > 0 ? "#26a86a" : "#55555c" }}>
                {liveSessions.filter(s => s.status === "running").length > 0 ? `⚡ ${liveSessions.filter(s => s.status === "running").length} coding` : "⚡ Code Room"}
              </span>
            </button>
            {lastUpdated && (
              <span style={{ fontSize: 10, color: "#3a3a3d" }}>
                Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <span style={{ fontSize: 10, color: "#3a3a3d" }}>↺ 30s</span>
          </div>
        </div>

        {/* ── Floor Plan Container ─────────────────────────────────────────── */}
        <div style={{ padding: "20px 24px 0" }}>
          <div
            style={{
              position: "relative",
              paddingBottom: "90%",
              borderRadius: 10,
              border: "1px solid #16161a",
              overflow: "hidden",
              background: "#0c0c0e",
              // Floor grid texture
              backgroundImage: [
                "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
              ].join(","),
              backgroundSize: "36px 36px",
            }}
          >
            <div style={{ position: "absolute", inset: 0 }}>

              {/* ── Rooms (walls) ───────────────────────────────────────────── */}
              {ROOMS.map((room) => {
                const isCodeRoom = room.id === "coderoom";
                const codingAgentNames = liveSessions.filter(s => s.status === "running").map(s => s.agent);
                const codingAgentsInRoom = agents.filter(a => codingAgentNames.some(n => a.name.toLowerCase() === n.toLowerCase()));
                const liveCount = liveSessions.filter(s => s.status === "running").length;

                return (
                <div
                  key={room.id}
                  onClick={isCodeRoom ? () => setShowCodeRoom((v) => !v) : undefined}
                  style={{
                    position: "absolute",
                    left: `${room.x}%`, top: `${room.y}%`,
                    width: `${room.w}%`, height: `${room.h}%`,
                    border: `2px solid ${isCodeRoom && liveCount > 0 ? room.color + "88" : room.color + "38"}`,
                    borderRadius: 6,
                    background: isCodeRoom && liveCount > 0 ? `${room.color}12` : `${room.color}07`,
                    boxShadow: isCodeRoom && liveCount > 0
                      ? `inset 0 0 40px ${room.color}14, 0 0 12px ${room.color}20`
                      : `inset 0 0 40px ${room.color}06, inset 0 0 0 1px ${room.color}08`,
                    cursor: isCodeRoom ? "pointer" : "default",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {/* Room nameplate sign */}
                  <div style={{
                    position: "absolute", top: isCodeRoom ? "50%" : 7, left: 8,
                    transform: isCodeRoom ? "translateY(-50%)" : "none",
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px 3px 6px",
                    background: `${room.color}14`,
                    border: `1px solid ${room.color}28`,
                    borderRadius: 4,
                  }}>
                    <span style={{ fontSize: 9 }}>{room.icon}</span>
                    <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: `${room.color}95` }}>
                      {room.label}
                    </span>
                    {isCodeRoom && liveCount > 0 && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#26a86a", marginLeft: 4 }}>● {liveCount} LIVE</span>
                    )}
                  </div>

                  {/* Code Room: show agent avatars inline */}
                  {isCodeRoom && (
                    <div style={{ display: "flex", gap: 12, paddingLeft: 140, alignItems: "center", overflow: "hidden" }}>
                      {liveCount === 0 ? (
                        <span style={{ fontSize: 11, color: "#3a3a42" }}>No active sessions</span>
                      ) : (
                        liveSessions.filter(s => s.status === "running").map((s) => {
                          const agent = agents.find(a => a.name.toLowerCase() === s.agent.toLowerCase());
                          const color = agent?.color ?? "#5e6ad2";
                          const emoji = agent?.emoji ?? "🤖";
                          return (
                            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{
                                width: 22, height: 22, borderRadius: "50%",
                                background: `${color}22`, border: `1.5px solid ${color}80`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 12,
                              }}>{emoji}</div>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: color }}>{s.agent}</div>
                                <div style={{ fontSize: 9, color: "#55555c", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.task}</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Wall decoration per room (not on code room) */}
                  {!isCodeRoom && <RoomWallDecor roomId={room.id} color={room.color} />}
                </div>
                );
              })}

              {/* ── Agent Desks ──────────────────────────────────────────────── */}
              {agents.map((agent) => (
                <AgentDesk
                  key={agent.id}
                  agent={agent}
                  isSelected={selected?.id === agent.id}
                  onClick={() => handleSelect(agent)}
                />
              ))}

              {/* ── Sliding Detail Panel ─────────────────────────────────────── */}
              <div style={{
                position: "absolute", top: 0, right: 0, bottom: 0,
                width: 290,
                background: "linear-gradient(to right, #0e0e12ee, #0e0e12)",
                borderLeft: "1px solid #1e1e24",
                backdropFilter: "blur(12px)",
                transform: panelOpen ? "translateX(0)" : "translateX(100%)",
                transition: "transform 0.32s cubic-bezier(0.16,1,0.3,1)",
                zIndex: 40,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}>
                {selected && <AgentDetailPanel agent={selected} onClose={handleClose} />}
              </div>
            </div>
          </div>
        </div>

        {/* ── Activity Ticker ──────────────────────────────────────────────── */}
        <div style={{
          margin: "14px 24px 20px",
          borderRadius: 7,
          border: "1px solid #16161a",
          background: "#0d0d10",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          height: 36,
        }}>
          {/* LIVE badge */}
          <div style={{
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 14px",
            borderRight: "1px solid #1a1a1e",
            height: "100%",
          }}>
            <span
              className="ocl-dot-blink"
              style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#26a86a" }}
            />
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#26a86a" }}>LIVE</span>
          </div>

          {/* Scrolling text */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {tickerText ? (
              <div
                className="ocl-ticker"
                style={{
                  display: "flex",
                  whiteSpace: "nowrap",
                  animationDuration: `${Math.max(20, tickerText.length * 0.12)}s`,
                  willChange: "transform",
                }}
              >
                {/* Duplicate for seamless loop */}
                {[0, 1].map((n) => (
                  <span key={n} style={{ fontSize: 12, color: "#8b8b91", paddingRight: 60 }}>
                    {tickerText.split("   •   ").map((item, i, arr) => (
                      <React.Fragment key={i}>
                        <span>
                          {item.split(" — ")[0]}{" "}
                          <span style={{ color: "#55555c" }}>—</span>{" "}
                          <span style={{ color: "#c8c8cc" }}>{item.split(" — ").slice(1).join(" — ")}</span>
                        </span>
                        {i < arr.length - 1 && (
                          <span style={{ color: "#2a2a2d", padding: "0 20px" }}>◆</span>
                        )}
                      </React.Fragment>
                    ))}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "#3a3a3d", padding: "0 16px" }}>
                No active tasks
              </span>
            )}
          </div>
        </div>

      </div>

      {/* ── Code Room Modal ──────────────────────────────────────────────── */}
      {showCodeRoom && (
        <div
          onClick={(e) => e.target === e.currentTarget && setShowCodeRoom(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div style={{
            background: "#0f0f10", border: "1px solid #2a2a2d", borderRadius: 14,
            width: "100%", maxWidth: 820, height: "80vh", display: "flex", flexDirection: "column",
            boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          }}>
            {/* Modal header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #2a2a2d", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#e8e8ea" }}>Code Room</span>
                {liveSessions.filter(s => s.status === "running").length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, background: "#0d3320", color: "#26a86a", border: "1px solid #166534", borderRadius: 999, padding: "2px 10px" }}>
                    ● {liveSessions.filter(s => s.status === "running").length} LIVE
                  </span>
                )}
              </div>
              <button onClick={() => setShowCodeRoom(false)} style={{ background: "none", border: "none", color: "#55555c", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            {/* Sessions list + terminal */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {liveSessions.length === 0 ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#55555c", gap: 8 }}>
                  <span style={{ fontSize: 40 }}>💤</span>
                  <p style={{ fontSize: 14 }}>No coding sessions yet.</p>
                  <p style={{ fontSize: 12, textAlign: "center", maxWidth: 280 }}>Sessions appear here when Ike or another agent starts working on code.</p>
                </div>
              ) : (
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {/* Session cards */}
                  <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: "40%" }}>
                    {liveSessions.map((s) => (
                      <div key={s.id} style={{
                        background: "#161618", border: "1px solid #2a2a2d", borderRadius: 8, padding: "12px 16px",
                        display: "flex", alignItems: "center", gap: 12,
                      }}>
                        <span style={{ fontSize: 20 }}>{s.agent.toLowerCase().includes("graham") ? "📈" : s.agent.toLowerCase().includes("mike") ? "🎯" : "🤖"}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#e8e8ea", margin: 0 }}>{s.agent}</p>
                          <p style={{ fontSize: 12, color: "#8b8b91", margin: 0 }}>{s.task}</p>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
                          background: s.status === "running" ? "#0d3320" : "#1c1c1f",
                          color: s.status === "running" ? "#26a86a" : "#55555c",
                          border: `1px solid ${s.status === "running" ? "#166534" : "#2a2a2d"}`,
                        }}>
                          {s.status === "running" ? "● LIVE" : s.status === "done" ? "Done" : "Error"}
                        </span>
                        <span style={{ fontSize: 11, color: "#55555c" }}>
                          {new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Output area */}
                  <pre style={{
                    flex: 1, margin: "0 24px 16px", background: "#0a0a0b", border: "1px solid #1a1a1d",
                    borderRadius: 8, padding: 16, fontSize: 12, fontFamily: "monospace", color: "#c5caff",
                    overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {liveSessions[0]?.output || "No output yet. Output appears here when an agent is coding."}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Room Wall Decorations ──────────────────────────────────────────────────────

function RoomWallDecor({ roomId, color }: { roomId: string; color: string }) {
  if (roomId === "exec") {
    // Awards / certificates on back wall
    return (
      <div style={{ position: "absolute", bottom: 8, right: 10, display: "flex", gap: 5 }}>
        {[14, 18, 14].map((h, i) => (
          <div key={i} style={{ width: 12, height: h, borderRadius: 2, background: `${color}${i === 1 ? "22" : "14"}`, border: `1px solid ${color}25` }} />
        ))}
      </div>
    );
  }
  if (roomId === "sales") {
    // Leaderboard/scoreboard on wall
    return (
      <div style={{ position: "absolute", bottom: 8, right: 8, width: 28, height: 22, borderRadius: 3, background: `${color}10`, border: `1px solid ${color}20`, padding: 4 }}>
        {[100, 65, 80].map((w, i) => (
          <div key={i} style={{ width: `${w}%`, height: 3, borderRadius: 1, marginBottom: 2, background: `${color}${i === 0 ? "50" : "28"}` }} />
        ))}
      </div>
    );
  }
  if (roomId === "eng") {
    // Code/commit graph on wall
    return (
      <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 2, alignItems: "flex-end" }}>
        {[4,7,3,6,8,5,7,4,6,5].map((h, i) => (
          <div key={i} style={{ width: 3, height: h, borderRadius: "1px 1px 0 0", background: `${color}${i % 3 === 0 ? "40" : "20"}` }} />
        ))}
      </div>
    );
  }
  if (roomId === "infra") {
    // Server rack on right wall
    return (
      <div style={{ position: "absolute", right: 8, top: "38%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 3 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ width: 16, height: 7, borderRadius: 1, background: `${color}18`, border: `1px solid ${color}22`, display: "flex", alignItems: "center", gap: 2, padding: "0 3px" }}>
            <div style={{ width: 2, height: 3, borderRadius: 1, background: `${color}${i < 3 ? "70" : "30"}` }} />
            <div style={{ flex: 1, height: 1, background: `${color}20`, borderRadius: 1 }} />
          </div>
        ))}
      </div>
    );
  }
  if (roomId === "finance") {
    // Bar chart on wall
    return (
      <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 2, alignItems: "flex-end" }}>
        {[6, 11, 7, 13, 9, 15].map((h, i) => (
          <div key={i} style={{ width: 4, height: h, borderRadius: "1px 1px 0 0", background: `${color}${i === 5 ? "55" : "28"}` }} />
        ))}
      </div>
    );
  }
  if (roomId === "ops") {
    // Whiteboard / kanban columns on wall
    return (
      <div style={{ position: "absolute", bottom: 8, right: 8, width: 26, height: 22, borderRadius: 2, background: `${color}10`, border: `1px solid ${color}20`, padding: "3px 4px", display: "flex", gap: 2 }}>
        {[3, 2, 4].map((lines, col) => (
          <div key={col} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {[...Array(lines)].map((_, i) => (
              <div key={i} style={{ height: 3, borderRadius: 1, background: `${color}35` }} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// ── Agent Desk ─────────────────────────────────────────────────────────────────

function AgentDesk({ agent, isSelected, onClick }: {
  agent: Agent; isSelected: boolean; onClick: () => void;
}) {
  const isWorking = agent.status === "working";
  const isIdle    = agent.status === "idle";
  const isAway    = agent.status === "away";

  return (
    <button
      className="ocl-agent-btn"
      onClick={onClick}
      style={{
        position: "absolute",
        left: `${agent.x}%`, top: `${agent.y}%`,
        transform: "translate(-50%, -50%)",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 3, padding: 8,
        background: "none", border: "none", cursor: "pointer", zIndex: 10,
      }}
    >
      {/* Ambient desk glow */}
      {isWorking && (
        <div
          className="ocl-desk-breathe"
          style={{
            position: "absolute", inset: -16, borderRadius: 20, zIndex: -1,
            background: `radial-gradient(ellipse at center, ${agent.color}28 0%, transparent 72%)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Desk surface with tool icons */}
      <div style={{
        width: 62, height: 26, borderRadius: 3,
        background: isAway ? `${agent.color}07` : `${agent.color}16`,
        border: `1px solid ${isAway ? "#1e1e22" : `${agent.color}28`}`,
        transform: "perspective(36px) rotateX(16deg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 5, marginBottom: -4,
        transition: "all 0.2s",
      }}>
        {agent.deskIcons.map((icon, i) => (
          <span key={i} style={{ fontSize: 9, opacity: isAway ? 0.25 : 0.9 }}>{icon}</span>
        ))}
      </div>

      {/* Avatar with pulse ring */}
      <div style={{ position: "relative" }}>
        {isWorking && (
          <div
            className="ocl-pulse-ring"
            style={{
              position: "absolute", inset: -5, borderRadius: "50%",
              border: `2px solid ${agent.color}`,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Avatar circle */}
        <div
          className="ocl-avatar-ring"
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: isAway ? "#131316" : `${agent.color}1c`,
            border: `2.5px solid ${
              isSelected ? agent.color
              : isWorking ? `${agent.color}95`
              : isIdle    ? `${agent.color}50`
              : "#252528"
            }`,
            boxShadow: isSelected
              ? `0 0 0 3px ${agent.color}35, 0 0 22px ${agent.color}45`
              : isWorking
              ? `0 0 0 1px ${agent.color}22, 0 0 16px ${agent.color}35`
              : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
            opacity: isAway ? 0.4 : 1,
            transition: "all 0.25s",
          }}
        >
          {agent.emoji}
        </div>

        {/* Status dot */}
        <div style={{
          position: "absolute", bottom: 0, right: 0,
          width: 11, height: 11, borderRadius: "50%",
          background: STATUS_COLOR[agent.status],
          border: "2px solid #0c0c0e",
        }} />
      </div>

      {/* Name tag */}
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.04em",
        color: isAway ? "#2e2e32" : agent.color,
        background: isAway ? "#131316" : `${agent.color}12`,
        border: `1px solid ${isAway ? "#1e1e22" : `${agent.color}22`}`,
        borderRadius: 3, padding: "2px 6px", whiteSpace: "nowrap",
        transition: "all 0.2s",
      }}>
        {agent.name}
      </div>

      {/* Hover tooltip */}
      <div
        className="ocl-tooltip"
        style={{
          position: "absolute", bottom: "calc(100% + 10px)", left: "50%",
          transform: "translateX(-50%)",
          background: "#141418", border: "1px solid #242428",
          borderRadius: 7, padding: "10px 12px", width: 188, textAlign: "left",
          boxShadow: "0 10px 32px rgba(0,0,0,0.6)",
          zIndex: 60, pointerEvents: "none",
          opacity: 0, transition: "opacity 0.15s",
        }}
      >
        <p style={{ margin: 0, marginBottom: 4, fontSize: 10, fontWeight: 700, color: agent.color }}>{agent.role}</p>
        <p style={{ margin: 0, fontSize: 11, color: "#8b8b91", lineHeight: 1.5 }}>{agent.currentTask}</p>
        {agent.blocker && (
          <p style={{ margin: "6px 0 0", fontSize: 10, color: "#e05252" }}>⚠ {agent.blocker}</p>
        )}
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1e1e22", display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[agent.status] }} />
          <span style={{ fontSize: 9, color: "#55555c" }}>{STATUS_LABEL[agent.status]} · {agent.lastActive}</span>
        </div>
      </div>
    </button>
  );
}

// ── Agent Detail Panel ─────────────────────────────────────────────────────────

function AgentDetailPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const sc = STATUS_COLOR[agent.status];
  const sl = STATUS_LABEL[agent.status];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Panel header */}
      <div style={{
        padding: "20px 20px 16px",
        borderBottom: "1px solid #1a1a1e",
        background: `${agent.color}08`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Large avatar */}
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `${agent.color}20`,
              border: `2.5px solid ${agent.color}`,
              boxShadow: `0 0 24px ${agent.color}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26,
            }}>
              {agent.emoji}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e8e8ea" }}>{agent.name}</p>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: agent.color }}>{agent.role}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#55555c", fontSize: 17, padding: 2, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Status + last seen */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: sc }}>{sl}</span>
          <span style={{ fontSize: 11, color: "#2a2a2d" }}>·</span>
          <span style={{ fontSize: 11, color: "#55555c" }}>Last active {agent.lastActive}</span>
        </div>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>

        {/* Zone badge */}
        <div style={{ marginBottom: 18 }}>
          <Label>Zone</Label>
          <span style={{
            display: "inline-block", marginTop: 5,
            fontSize: 11, padding: "3px 9px", borderRadius: 4,
            background: `${agent.color}14`, color: agent.color,
            border: `1px solid ${agent.color}28`,
          }}>
            {agent.zone}
          </span>
        </div>

        {/* Current Task */}
        <div style={{ marginBottom: 18 }}>
          <Label>Current Task</Label>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#c8c8cc", lineHeight: 1.65 }}>
            {agent.currentTask}
          </p>
        </div>

        {/* Blocker */}
        {agent.blocker && (
          <div style={{ marginBottom: 18, padding: "10px 12px", borderRadius: 6, background: "#e0525210", border: "1px solid #e0525228" }}>
            <Label style={{ color: "#e05252" }}>⚠ Blocker</Label>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#e0525270", lineHeight: 1.55 }}>{agent.blocker}</p>
          </div>
        )}

        {/* Next Step */}
        {agent.nextStep && (
          <div style={{ marginBottom: 18 }}>
            <Label>Next Step</Label>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8b8b91", lineHeight: 1.55 }}>{agent.nextStep}</p>
          </div>
        )}

        {/* Tools */}
        {agent.deskIcons.length > 0 && (
          <div>
            <Label>Desk Tools</Label>
            <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
              {agent.deskIcons.map((icon, i) => (
                <div key={i} style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: `${agent.color}12`, border: `1px solid ${agent.color}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>
                  {icon}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 20px", borderTop: "1px solid #1a1a1e", flexShrink: 0,
        display: "flex", justifyContent: "flex-end",
      }}>
        <button
          disabled
          title="Coming soon"
          style={{
            fontSize: 12, padding: "7px 16px", borderRadius: 6, cursor: "not-allowed",
            background: `${agent.color}14`, color: agent.color,
            border: `1px solid ${agent.color}30`, opacity: 0.45,
          }}
        >
          Message
        </button>
      </div>
    </div>
  );
}

// ── Label helper ───────────────────────────────────────────────────────────────

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{
      margin: 0,
      fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "#55555c",
      ...style,
    }}>
      {children}
    </p>
  );
}

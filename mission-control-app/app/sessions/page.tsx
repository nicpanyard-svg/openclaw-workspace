"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CodingSession } from "../api/coding-sessions/route";

const AGENT_COLOR: Record<string, string> = {
  "Claude Code": "#5e6ad2",
  "Codex": "#26a86a",
  "Graham": "#e8a045",
  "Mike": "#818cf8",
  "Jill": "#e05252",
  "Susan": "#26c4c4",
  "Dr Phil": "#e8a045",
  "Ike": "#5e6ad2",
};

function agentColor(name: string) {
  for (const [k, v] of Object.entries(AGENT_COLOR)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "#8b8b91";
}

function agentEmoji(name: string) {
  const n = name.toLowerCase();
  if (n.includes("graham")) return "📈";
  if (n.includes("mike")) return "🎯";
  if (n.includes("jill")) return "✍️";
  if (n.includes("susan")) return "📋";
  if (n.includes("claude") || n.includes("ike")) return "🤖";
  if (n.includes("codex")) return "⚡";
  return "💻";
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<CodingSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [logOutput, setLogOutput] = useState<string>("");
  const [logLoading, setLogLoading] = useState(false);
  const termRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/coding-sessions");
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }, []);

  useEffect(() => {
    fetchSessions();
    const iv = setInterval(fetchSessions, 10_000);
    return () => clearInterval(iv);
  }, [fetchSessions]);

  const openSession = useCallback((session: CodingSession) => {
    setActiveId(session.id);
    setLogOutput(session.output ?? "");
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      setLogLoading(true);
      // Use output field directly if no logFile
      if (!session.logFile) {
        const res = await fetch("/api/coding-sessions");
        const data = await res.json();
        const s = (data.sessions ?? []).find((s: CodingSession) => s.id === session.id);
        if (s) setLogOutput(s.output ?? "No output yet.");
        setLogLoading(false);
        return;
      }
      const res = await fetch(`/api/coding-sessions/log?sessionId=${session.id}&logFile=${encodeURIComponent(session.logFile)}`);
      const data = await res.json();
      setLogOutput(data.output ?? "");
      setLogLoading(false);
    };

    poll();
    if (session.status === "running") {
      pollRef.current = setInterval(poll, 3000);
    }
  }, []);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [logOutput]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const activeSession = sessions.find((s) => s.id === activeId);
  const running = sessions.filter((s) => s.status === "running");
  const finished = sessions.filter((s) => s.status !== "running");

  return (
    <div className="min-h-screen bg-[#0f0f10] flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-5 border-b border-[#2a2a2d] flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#e8e8ea] tracking-tight">Code Room</h1>
          <p className="text-[13px] text-[#55555c] mt-0.5">
            {running.length} active · {sessions.length} total
          </p>
        </div>
        {running.length > 0 && (
          <span className="flex items-center gap-2 text-[13px] font-semibold text-[#26a86a] bg-[#0d3320] border border-[#166534] px-4 py-2 rounded-full animate-pulse">
            ● {running.length} coding now
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Session list */}
        <div className="w-[340px] min-w-[280px] border-r border-[#2a2a2d] flex flex-col overflow-y-auto">
          {sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-[#55555c] text-[14px] gap-2 p-8">
              <span className="text-[48px]">💤</span>
              <p>No coding sessions yet.</p>
              <p className="text-[12px] text-center">Sessions appear here when Ike or another agent starts coding work.</p>
            </div>
          )}

          {running.length > 0 && (
            <div className="px-4 pt-4 pb-1">
              <p className="text-[10px] uppercase tracking-widest text-[#55555c] font-bold mb-2">Active</p>
              {running.map((s) => (
                <SessionCard key={s.id} session={s} active={activeId === s.id} onClick={() => openSession(s)} />
              ))}
            </div>
          )}

          {finished.length > 0 && (
            <div className="px-4 pt-4 pb-4">
              <p className="text-[10px] uppercase tracking-widest text-[#55555c] font-bold mb-2">Finished</p>
              {finished.map((s) => (
                <SessionCard key={s.id} session={s} active={activeId === s.id} onClick={() => openSession(s)} />
              ))}
            </div>
          )}
        </div>

        {/* Terminal panel */}
        <div className="flex-1 flex flex-col bg-[#0a0a0b]">
          {!activeSession ? (
            <div className="flex flex-col items-center justify-center h-full text-[#55555c] gap-3">
              <span className="text-[48px]">🖥️</span>
              <p className="text-[14px]">Select a session to view its output</p>
            </div>
          ) : (
            <>
              {/* Terminal header */}
              <div className="px-6 py-4 border-b border-[#1a1a1d] flex items-center gap-3">
                <span className="text-[20px]">{agentEmoji(activeSession.agent)}</span>
                <div>
                  <p className="text-[14px] font-bold text-[#e8e8ea]">{activeSession.agent}</p>
                  <p className="text-[12px] text-[#55555c]">{activeSession.task}</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {activeSession.status === "running" && (
                    <span className="text-[12px] font-bold text-[#26a86a] animate-pulse">● LIVE</span>
                  )}
                  {activeSession.status === "done" && (
                    <span className="text-[12px] font-bold text-[#8b8b91]">✓ DONE</span>
                  )}
                  {activeSession.status === "error" && (
                    <span className="text-[12px] font-bold text-[#e05252]">✕ ERROR</span>
                  )}
                  <span className="text-[11px] text-[#55555c]">
                    Started {new Date(activeSession.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>

              {/* Terminal output */}
              <pre
                ref={termRef}
                className="flex-1 overflow-y-auto p-6 text-[13px] leading-relaxed font-mono text-[#c5caff] whitespace-pre-wrap break-words"
                style={{ background: "#0a0a0b" }}
              >
                {logLoading && !logOutput ? "Loading output…" : (logOutput || "No output yet.")}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  active,
  onClick,
}: {
  session: CodingSession;
  active: boolean;
  onClick: () => void;
}) {
  const color = agentColor(session.agent);
  const elapsed = session.finishedAt
    ? Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
    : Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  const elapsedStr = elapsed > 3600
    ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
    : elapsed > 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  return (
    <div
      onClick={onClick}
      className="mb-2 rounded-[8px] p-3 cursor-pointer transition-all border"
      style={{
        background: active ? "#1a1a1d" : "#161618",
        borderColor: active ? color : "#2a2a2d",
        boxShadow: active ? `0 0 0 1px ${color}30` : "none",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[16px]">{agentEmoji(session.agent)}</span>
        <span className="text-[13px] font-bold" style={{ color }}>{session.agent}</span>
        <span
          className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={
            session.status === "running"
              ? { background: "#0d3320", color: "#26a86a" }
              : session.status === "done"
              ? { background: "#1c1c1f", color: "#55555c" }
              : { background: "#3d0a0a", color: "#e05252" }
          }
        >
          {session.status === "running" ? "● LIVE" : session.status === "done" ? "Done" : "Error"}
        </span>
      </div>
      <p className="text-[12px] text-[#8b8b91] leading-snug line-clamp-2">{session.task}</p>
      <p className="text-[11px] text-[#55555c] mt-1.5">{elapsedStr}</p>
    </div>
  );
}

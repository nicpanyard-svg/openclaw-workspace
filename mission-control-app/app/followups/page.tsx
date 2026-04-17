"use client";

import { useState, useEffect, useCallback } from "react";

interface FollowUp {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  vertical: string;
  status: string;
  followUpDate: string;
  priority: "overdue" | "today" | "upcoming";
  daysUntil: number;
  touchCount: number;
  lastContactedAt: string | null;
  lastActivity: { type: string; note: string; date: string; by: string } | null;
  fitNotes: string;
}

interface FollowUpData {
  summary: { handedOff: number; overdue: number; today: number; upcoming: number; total: number };
  handedOff: FollowUp[];
}

const EMPTY: FollowUpData = {
  summary: { handedOff: 0, overdue: 0, today: 0, upcoming: 0, total: 0 },
  handedOff: [],
};

export default function MeetingRequestsPage() {
  const [data, setData] = useState<FollowUpData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mike/followups");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLastUpdated(new Date());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  async function markMeetingBooked(leadId: string) {
    await fetch("/api/mike/followups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, status: "Meeting Booked", followUpDate: "", notes: "Meeting booked by Nick" }),
    });
    await load();
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0d0d0d]">
      <span className="text-[13px] text-[#55555c]">Loading…</span>
    </div>
  );

  const { handedOff, summary } = data;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">

      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#e8e8ea] tracking-tight">📅 Meeting Requests</h1>
          <p className="text-[12px] text-[#3a3a3f] mt-0.5">
            Prospects who want to meet — send the invite, then click Done.
            {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <button onClick={load} className="text-[12px] text-[#5e6ad2] hover:text-[#7b8cde] px-3 py-1.5 rounded-lg bg-[#1e2142] transition-colors">↻ Refresh</button>
      </div>

      <div className="px-6">
        {handedOff.length === 0 ? (
          <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-16 text-center mt-4">
            <p className="text-[40px] mb-4">✅</p>
            <p className="text-[16px] font-semibold text-[#e8e8ea] mb-2">No meeting requests right now</p>
            <p className="text-[13px] text-[#55555c]">Mike will alert you here when a prospect asks to meet.</p>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-[#55555c] mb-4">{summary.handedOff} prospect{summary.handedOff !== 1 ? "s" : ""} want{summary.handedOff === 1 ? "s" : ""} to meet</p>
            <div className="grid grid-cols-2 gap-4">
              {handedOff.map(f => {
                const reply = (f.lastActivity?.note ?? "").replace("Prospect wants to meet - collecting availability for Nick. Reply: ", "");
                return (
                  <div key={f.id} className="rounded-xl p-5 border" style={{ backgroundColor: "#1e1a2e", borderColor: "#7c3aed40" }}>

                    {/* Who */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-[16px] font-semibold text-[#e8e8ea]">{f.name}</p>
                        <p className="text-[12px] mt-0.5" style={{ color: "#7c3aed" }}>{f.company}</p>
                        {f.title && <p className="text-[11px] text-[#3a3a3f] mt-0.5">{f.title}</p>}
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3" style={{ color: "#7c3aed", backgroundColor: "#7c3aed20" }}>
                        Wants to Meet
                      </span>
                    </div>

                    {/* What they said */}
                    {reply && (
                      <div className="rounded-lg px-4 py-3 mb-4" style={{ backgroundColor: "#16122a" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#7c3aed" }}>What they said</p>
                        <p className="text-[13px] text-[#c8c8ca] leading-snug">{reply.slice(0, 300)}</p>
                      </div>
                    )}

                    {/* Contact info */}
                    {f.email && (
                      <p className="text-[11px] text-[#3a3a3f] mb-4">📧 {f.email}</p>
                    )}

                    {/* Action */}
                    <button
                      onClick={() => markMeetingBooked(f.id)}
                      className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-colors border"
                      style={{ backgroundColor: "#7c3aed20", color: "#7c3aed", borderColor: "#7c3aed40" }}
                    >
                      ✓ Meeting Booked
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

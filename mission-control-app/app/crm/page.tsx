"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Lead, Activity, LeadMessage } from "../api/crm/route";

// ── Tool Status ───────────────────────────────────────────────────────────────

interface ToolStatus {
  name: string;
  status: "active" | "expired";
  lastRefreshed: string | null;
  expiresAt: string | null;
}

// ── Offers / Markets (static reference data) ──────────────────────────────────

const OFFERS = [
  { name: "Starlink",           category: "Connectivity", description: "High-speed satellite internet for remote job sites and field operations." },
  { name: "Starlink Data Pool", category: "Connectivity", description: "Shared data plans across multiple Starlink terminals for fleet management." },
  { name: "SecureLynk",         category: "Security",     description: "Encrypted communications platform for secure field-to-office coordination." },
  { name: "RAD SecFlow-1p",     category: "Security",     description: "Industrial-grade secure gateway for OT/IT network segmentation." },
  { name: "Ilios Integrators",  category: "Integration",  description: "Full-service technology integration for renewable energy projects." },
  { name: "HydraGauge",         category: "Monitoring",   description: "Real-time environmental and structural monitoring sensor network." },
  { name: "Axis",               category: "Surveillance", description: "AI-powered camera systems for job site security and safety monitoring." },
  { name: "Alertus",            category: "Safety",       description: "Mass notification system for emergency alerts across large sites." },
];

const MARKETS = [
  "Solar EPC", "Renewable EPC", "Electrical Contractors", "Engineering & Construction",
  "Utility-Scale Solar", "Wind Energy", "Energy Storage", "Data Centers",
];

type Status = Lead["status"];
type Vertical = Lead["vertical"];
type Confidence = NonNullable<Lead["confidence"]>;
type ViewMode = "kanban" | "table";
type SortKey = "name" | "company" | "followUpDate" | "touchCount";

// SDR pipeline — Mike's job ends at Meeting Booked; Nick closes from Handed Off
const STATUSES: Status[] = ["New", "Contacted", "Engaged", "Meeting Booked", "Handed Off", "Needs Info"];
const ALL_STATUSES: Status[] = STATUSES;
const VERTICALS: Vertical[] = ["iNet", "HydraGauge"];
const SOURCES = ["LinkedIn", "Web Scrape", "ZoomInfo", "Referral", "Other"];
const CONFIDENCE_LEVELS: Confidence[] = ["high", "medium", "low"];

const STATUS_STYLE: Record<Status, { bg: string; text: string; border: string; dot: string }> = {
  "New":            { bg: "#222224", text: "#9b9ba1", border: "#3a3a3d", dot: "#55555c" },
  "Contacted":      { bg: "#1b2042", text: "#8b95e8", border: "#3a4080", dot: "#5e6ad2" },
  "Engaged":        { bg: "#1b2e2b", text: "#4ecba0", border: "#2a5448", dot: "#26a86a" },
  "Meeting Booked": { bg: "#172b1e", text: "#2ec97a", border: "#1e5a38", dot: "#26a86a" },
  "Handed Off":     { bg: "#1e1e1f", text: "#55555c", border: "#2a2a2d", dot: "#3a3a3d" },
  "Needs Info":     { bg: "#241a06", text: "#f59e0b", border: "#4a3206", dot: "#d97706" },
};

const VERTICAL_STYLE: Record<Vertical, { bg: string; text: string; border: string }> = {
  "iNet":       { bg: "#1b2042", text: "#8b95e8", border: "#3a4080" },
  "HydraGauge": { bg: "#2b2010", text: "#e8a045", border: "#5a4010" },
};

const CONFIDENCE_STYLE: Record<Confidence, { dot: string; label: string; bg: string; text: string; border: string }> = {
  high:   { dot: "#26a86a", label: "High",   bg: "#172b1e", text: "#2ec97a", border: "#1e5a38" },
  medium: { dot: "#e8a045", label: "Medium", bg: "#2b2010", text: "#e8a045", border: "#5a4010" },
  low:    { dot: "#e05252", label: "Low",    bg: "#2e1919", text: "#e05252", border: "#702828" },
};

const ACTIVITY_ICONS: Record<NonNullable<Activity["type"]>, string> = {
  note:             "📝",
  email_sent:       "✉️",
  call:             "📞",
  meeting:          "🤝",
  linkedin_message: "💼",
};

const EMPTY_FORM: Omit<Lead, "id" | "createdAt" | "updatedAt" | "activities" | "touchCount"> = {
  name: "", title: "", company: "", vertical: "iNet", status: "New",
  linkedin: "", email: "", phone: "", notes: "",
  source: "", confidence: "medium", followUpDate: "",
  companySize: "", triggerEvent: "", sequence: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverdue(lead: Lead): boolean {
  if (!lead.followUpDate) return false;
  return new Date(lead.followUpDate) < new Date(new Date().toDateString());
}

function isDueToday(lead: Lead): boolean {
  if (!lead.followUpDate) return false;
  return lead.followUpDate.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function hasUnread(lead: Lead): boolean {
  return (lead.messages ?? []).some((m) => m.from === "mike" && !m.read);
}

function parseName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim() || !text) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(94,106,210,0.35)", color: "#c5caff", borderRadius: "2px", padding: "0 1px" }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// ── Context Menu ──────────────────────────────────────────────────────────────

interface CtxMenuState { x: number; y: number; lead: Lead }

function ContextMenu({ menu, onAction, onClose }: {
  menu: CtxMenuState;
  onAction: (action: string, lead: Lead) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    setTimeout(() => {
      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const safeX = Math.min(menu.x, window.innerWidth - 200);
  const safeY = Math.min(menu.y, window.innerHeight - 220);

  const items: Array<{ label: string; action: string; icon: string; danger?: boolean } | { divider: true }> = [
    { label: "Open Details", action: "open", icon: "↗" },
    { label: "Log Activity", action: "log", icon: "📝" },
    { label: "Mark Follow-up Today", action: "followup", icon: "📅" },
    { divider: true },
    { label: "Move to Contacted", action: "status:Contacted", icon: "●" },
    { label: "Move to Engaged", action: "status:Engaged", icon: "●" },
    { label: "Move to Meeting Booked", action: "status:Meeting Booked", icon: "●" },
    { divider: true },
    { label: menu.lead.status === "Needs Info" ? "Clear: Needs Info" : "Flag: Needs Info", action: "archive", icon: "📁" },
    { label: "Delete Lead", action: "delete", icon: "🗑", danger: true },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[200] rounded-[8px] border border-[#2a2a2d] bg-[#1c1c1f] shadow-2xl py-1 min-w-[190px]"
      style={{ left: safeX, top: safeY }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        "divider" in item ? (
          <div key={i} className="h-px bg-[#2a2a2d] my-1" />
        ) : (
          <button
            key={item.action}
            onClick={() => { onAction(item.action, menu.lead); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left transition-colors hover:bg-[rgba(255,255,255,0.05)]"
            style={{ color: item.danger ? "#e05252" : "#e8e8ea" }}
          >
            <span className="text-[13px] shrink-0">{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── Status Dropdown ───────────────────────────────────────────────────────────

function StatusDropdown({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_STYLE[value];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-[4px] text-[11px] font-medium border cursor-pointer whitespace-nowrap transition-all hover:opacity-90"
        style={{ background: s.bg, color: s.text, borderColor: s.border }}
      >
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.dot }} />
        {value}
        <span className="ml-0.5 text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-[150px] rounded-[6px] border border-[#2a2a2d] bg-[#1c1c1f] shadow-xl overflow-hidden">
            {ALL_STATUSES.map((st) => {
              const ss = STATUS_STYLE[st];
              return (
                <button key={st} onClick={() => { onChange(st); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                  style={{ color: ss.text }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ss.dot }} />
                  {st}
                  {st === value && <span className="ml-auto text-[10px] opacity-40">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Confidence Badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ value, size = "sm", onClick }: {
  value?: Confidence;
  size?: "sm" | "xs";
  onClick?: () => void;
}) {
  if (!value) return null;
  const cs = CONFIDENCE_STYLE[value];
  const cls = onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : "";
  return size === "xs" ? (
    <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${cls}`}
      style={{ background: cs.dot }} title={cs.label} onClick={onClick} />
  ) : (
    <span
      className={`flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11px] font-medium border ${cls}`}
      style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
      onClick={onClick}
      title={onClick ? "Click to cycle confidence" : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cs.dot }} />
      {cs.label}
    </span>
  );
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

function KanbanCard({
  lead,
  onDragStart,
  onDragEnd,
  onClick,
  onContextMenu,
  selected,
  onSelect,
  showCheckbox,
  searchQuery,
}: {
  lead: Lead;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onClick: (lead: Lead) => void;
  onContextMenu: (e: React.MouseEvent, lead: Lead) => void;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  showCheckbox: boolean;
  searchQuery: string;
}) {
  const vs = VERTICAL_STYLE[lead.vertical];
  const overdue = isOverdue(lead);
  const today = isDueToday(lead);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(lead)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, lead); }}
      className="rounded-[8px] border p-3 cursor-pointer select-none transition-all duration-150 group"
      style={{
        background: selected ? "#1e2040" : lead.status === "Meeting Booked" ? "#172b1e" : "#1c1c1f",
        borderColor: selected ? "#5e6ad2" : overdue ? "#702828" : lead.status === "Meeting Booked" ? "#1e5a38" : "#2a2a2d",
        transform: "translateY(0)",
        boxShadow: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
        (e.currentTarget as HTMLDivElement).style.borderColor = selected ? "#5e6ad2" : overdue ? "#a83a3a" : lead.status === "Meeting Booked" ? "#2a7a4a" : "#3a3a3d";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        (e.currentTarget as HTMLDivElement).style.borderColor = selected ? "#5e6ad2" : overdue ? "#702828" : lead.status === "Meeting Booked" ? "#1e5a38" : "#2a2a2d";
      }}
    >
      {/* Checkbox + Name row */}
      <div className="flex items-start gap-2 mb-1">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => { e.stopPropagation(); onSelect(lead.id, e.target.checked); }}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 shrink-0 cursor-pointer accent-[#5e6ad2]"
          />
        )}
        <span className="text-[13px] font-semibold text-[#e8e8ea] leading-snug flex-1">
          {highlight(lead.name, searchQuery)}
        </span>
        <ConfidenceBadge value={lead.confidence} size="xs" />
      </div>

      {/* Title / Company */}
      {lead.company && (
        <p className="text-[11px] text-[#8b8b91] mb-2">
          {lead.title
            ? <>{highlight(lead.title, searchQuery)} · {highlight(lead.company, searchQuery)}</>
            : highlight(lead.company, searchQuery)
          }
        </p>
      )}

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium border"
          style={{ background: vs.bg, color: vs.text, borderColor: vs.border }}>
          {lead.vertical}
        </span>

        {lead.followUpDate && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] border font-medium"
            style={
              overdue
                ? { background: "#2e1919", color: "#e05252", borderColor: "#702828" }
                : today
                ? { background: "#2b2010", color: "#e8a045", borderColor: "#5a4010" }
                : { background: "#1c1c1f", color: "#55555c", borderColor: "#2a2a2d" }
            }>
            {overdue ? "⚠ " : today ? "● " : ""}
            {lead.followUpDate.slice(0, 10)}
          </span>
        )}

        {(lead.touchCount ?? 0) > 0 && (
          <span className="text-[10px] text-[#55555c]">·{lead.touchCount}x</span>
        )}
        {hasUnread(lead) && (
          <span className="w-2 h-2 rounded-full bg-[#e05252] inline-block shrink-0" title="Unread message from Mike" />
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  status, leads, onDragStart, onDragEnd, onDrop, onDragOver, onCardClick,
  onCardContextMenu, selected, onSelect, showCheckbox, searchQuery,
}: {
  status: Status;
  leads: Lead[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, status: Status) => void;
  onDragOver: (e: React.DragEvent) => void;
  onCardClick: (lead: Lead) => void;
  onCardContextMenu: (e: React.MouseEvent, lead: Lead) => void;
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  showCheckbox: boolean;
  searchQuery: string;
}) {
  const ss = STATUS_STYLE[status];
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className="flex flex-col min-w-[220px] flex-1"
      style={{ opacity: status === "Handed Off" ? 0.65 : 1 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); onDragOver(e); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); onDrop(e, status); }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 mb-2 rounded-[6px] border"
        style={{ background: ss.bg, borderColor: ss.border }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: ss.dot }} />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: ss.text }}>{status}</span>
            {status === "Needs Info" && (
              <div className="text-[10px] mt-0.5" style={{ color: ss.text, opacity: 0.65 }}>Missing contact details</div>
            )}
          </div>
        </div>
        <span className="text-[12px] font-bold px-2 py-0.5 rounded-full transition-all"
          style={{ background: ss.border, color: ss.text }}>
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        className="flex flex-col gap-2 flex-1 rounded-[6px] p-1 min-h-[80px] transition-all duration-150"
        style={{
          background: dragOver ? "rgba(94,106,210,0.06)" : "transparent",
          border: dragOver ? "1px dashed #5e6ad2" : "1px solid transparent",
        }}
      >
        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onCardClick}
            onContextMenu={onCardContextMenu}
            selected={selected.has(lead.id)}
            onSelect={onSelect}
            showCheckbox={showCheckbox}
            searchQuery={searchQuery}
          />
        ))}
        {leads.length === 0 && !dragOver && (
          <div className="flex items-center justify-center h-16 text-[11px] text-[#3a3a3d]">Drop here</div>
        )}
      </div>
    </div>
  );
}

// ── Inline Editable Field ─────────────────────────────────────────────────────

function InlineField({
  label, value, onSave, type = "text", multiline = false,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setDraft(value); setEditing(false); }
  }

  if (editing) {
    const sharedProps = {
      ref: inputRef,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: handleKeyDown,
      autoFocus: true,
      className: "w-full bg-[#0f0f10] border border-[#5e6ad2] rounded-[4px] px-2 py-1.5 text-[13px] text-[#e8e8ea] focus:outline-none resize-none",
    };
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#55555c] mb-1">{label}</p>
        {multiline
          ? <textarea {...sharedProps} rows={3} />
          : <input type={type} {...sharedProps} />
        }
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="group cursor-text rounded-[4px] px-2 py-1.5 -mx-2 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#55555c] mb-0.5">{label}</p>
      <p className="text-[13px] text-[#e8e8ea] leading-snug">
        {value || <span className="text-[#3a3a3d] italic">Click to edit</span>}
      </p>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  lead, onClose, onUpdate,
}: {
  lead: Lead;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Lead>) => Promise<void>;
}) {
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteType, setNoteType] = useState<Activity["type"]>("note");
  const [logVisible, setLogVisible] = useState(false);
  const [detailTab, setDetailTab] = useState<"activity" | "thread">("activity");
  const [threadInput, setThreadInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const vs = VERTICAL_STYLE[lead.vertical];
  const activities = [...(lead.activities ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Escape key to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Auto-scroll thread to bottom when messages change
  useEffect(() => {
    if (detailTab === "thread") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lead.messages, detailTab]);

  function cycleConfidence() {
    const next: Record<Confidence, Confidence> = { high: "medium", medium: "low", low: "high" };
    const cur = lead.confidence ?? "medium";
    onUpdate(lead.id, { confidence: next[cur] });
  }

  async function addActivity() {
    if (!noteText.trim()) return;
    const newAct: Activity = {
      id: crypto.randomUUID(),
      type: noteType,
      note: noteText.trim(),
      date: new Date().toISOString(),
      by: "Jill",
    };
    const updated = [newAct, ...(lead.activities ?? [])];
    await onUpdate(lead.id, { activities: updated, touchCount: (lead.touchCount ?? 0) + 1 });
    setNoteText("");
    setAddingNote(false);
  }

  async function markRead() {
    if (!(lead.messages ?? []).some((m) => m.from === "mike" && !m.read)) return;
    await fetch(`/api/crm/${lead.id}/messages`, { method: "PATCH" });
    await onUpdate(lead.id, {
      messages: (lead.messages ?? []).map((m) => ({ ...m, read: true })),
    });
  }

  async function sendMessage() {
    if (!threadInput.trim() || sendingMessage) return;
    setSendingMessage(true);
    const res = await fetch(`/api/crm/${lead.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "nick", text: threadInput.trim() }),
    });
    if (res.ok) {
      const { message } = await res.json() as { message: LeadMessage };
      await onUpdate(lead.id, {
        messages: [...(lead.messages ?? []), message],
      });
      setThreadInput("");
    }
    setSendingMessage(false);
  }

  function field(key: keyof Lead, label: string, type = "text", multiline = false) {
    return (
      <InlineField
        label={label}
        value={(lead[key] as string) ?? ""}
        onSave={(v) => onUpdate(lead.id, { [key]: v })}
        type={type}
        multiline={multiline}
      />
    );
  }

  return (
    <>
      {/* Slide-in animation via style tag */}
      <style>{`
        @keyframes slideInPanel {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .detail-panel { animation: slideInPanel 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
      <div className="fixed inset-0 z-40 flex">
        {/* Backdrop */}
        <div className="flex-1 bg-black/40" onClick={onClose} />

        {/* Panel */}
        <div className="detail-panel w-[440px] bg-[#161618] border-l border-[#2a2a2d] h-full overflow-y-auto flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-[#2a2a2d] sticky top-0 bg-[#161618] z-10">
            <div className="flex-1 min-w-0 pr-3">
              <div className="mb-1">
                <InlineField
                  label=""
                  value={lead.name}
                  onSave={(v) => onUpdate(lead.id, { name: v })}
                />
              </div>
              {/* Status + vertical + confidence in header */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusDropdown
                  value={lead.status}
                  onChange={(s) => onUpdate(lead.id, { status: s })}
                />
                <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-medium border"
                  style={{ background: vs.bg, color: vs.text, borderColor: vs.border }}>
                  {lead.vertical}
                </span>
                <ConfidenceBadge value={lead.confidence} onClick={cycleConfidence} />
                {lead.confidence && (
                  <span className="text-[10px] text-[#55555c]" title="Click confidence to cycle">↻</span>
                )}
                <button
                  onClick={() => { onUpdate(lead.id, { status: lead.status === "Needs Info" ? "New" : "Needs Info" }); }}
                  className="ml-1 px-2 py-0.5 rounded-[4px] text-[11px] border transition-colors"
                  style={lead.status === "Needs Info"
                    ? { color: "#f59e0b", borderColor: "#4a3206", background: "#241a06" }
                    : { color: "#55555c", borderColor: "#2a2a2d", background: "transparent" }}
                  title={lead.status === "Needs Info" ? "Clear flag, restore to New" : "Flag as Needs Info"}
                >
                  {lead.status === "Needs Info" ? "↩ Clear Flag" : "Flag: Needs Info"}
                </button>
              </div>
            </div>
            <button onClick={onClose} className="text-[#55555c] hover:text-[#e8e8ea] text-[20px] leading-none transition-colors mt-0.5 shrink-0">×</button>
          </div>

          <div className="flex-1 px-5 py-4 space-y-4">
            {/* Editable contact fields */}
            <section className="grid grid-cols-2 gap-x-4 gap-y-1">
              {field("title", "Title")}
              {field("company", "Company")}
              {field("companySize", "Company Size")}
              {field("email", "Email", "email")}
              {field("phone", "Phone", "tel")}
            </section>

            {/* Follow-up date */}
            <section>
              <InlineField
                label="Follow-up Date"
                value={lead.followUpDate ?? ""}
                onSave={(v) => onUpdate(lead.id, { followUpDate: v })}
                type="date"
              />
              {lead.followUpDate && isOverdue(lead) && (
                <p className="text-[11px] text-[#e05252] mt-0.5">⚠ Overdue</p>
              )}
            </section>

            {/* LinkedIn */}
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#55555c] mb-1">LinkedIn</p>
              <div className="flex items-center gap-2">
                <InlineField
                  label=""
                  value={lead.linkedin ?? ""}
                  onSave={(v) => onUpdate(lead.id, { linkedin: v })}
                />
                {lead.linkedin && (
                  <a href={lead.linkedin} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-[#5e6ad2] hover:text-[#8b95e8] shrink-0 transition-colors">
                    ↗ Open
                  </a>
                )}
              </div>
            </section>

            {/* Notes */}
            <section>
              {field("notes", "Notes / Fit Notes", "text", true)}
            </section>

            {/* Details */}
            <section className="space-y-1.5 text-[12px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#55555c]">Details</p>
              {lead.source && <div className="flex justify-between"><span className="text-[#55555c]">Source</span><span className="text-[#8b8b91]">{lead.source}</span></div>}
              {lead.sequence && <div className="flex justify-between"><span className="text-[#55555c]">Sequence</span><span className="text-[#8b8b91]">{lead.sequence}</span></div>}
              {lead.triggerEvent && <div className="flex justify-between"><span className="text-[#55555c]">Trigger</span><span className="text-[#8b8b91] text-right max-w-[200px]">{lead.triggerEvent}</span></div>}
              {(lead.touchCount ?? 0) > 0 && (
                <div className="flex justify-between"><span className="text-[#55555c]">Touches</span><span className="text-[#8b8b91]">{lead.touchCount}</span></div>
              )}
            </section>

            {/* Tabs — Activity / Thread */}
            <div className="flex gap-4 border-b border-[#2a2a2d] pb-0 -mx-5 px-5">
              <button
                onClick={() => setDetailTab("activity")}
                className={`text-[12px] font-medium pb-2 border-b-2 transition-colors ${
                  detailTab === "activity"
                    ? "border-[#5e6ad2] text-[#e8e8ea]"
                    : "border-transparent text-[#55555c] hover:text-[#8b8b91]"
                }`}
              >
                Activity
              </button>
              <button
                onClick={() => { setDetailTab("thread"); markRead(); }}
                className={`relative text-[12px] font-medium pb-2 border-b-2 transition-colors ${
                  detailTab === "thread"
                    ? "border-[#5e6ad2] text-[#e8e8ea]"
                    : "border-transparent text-[#55555c] hover:text-[#8b8b91]"
                }`}
              >
                Thread
                {hasUnread(lead) && (
                  <span className="absolute -top-0.5 -right-2.5 w-2 h-2 bg-[#e05252] rounded-full" />
                )}
              </button>
            </div>

            {/* Activity Tab */}
            {detailTab === "activity" && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#55555c]">Activity</p>
                <button
                  onClick={() => setAddingNote(!addingNote)}
                  className="text-[11px] px-2.5 py-1 rounded-[4px] bg-[#5e6ad2] text-white hover:bg-[#4f5bc4] transition-colors font-medium"
                >
                  + Log Activity
                </button>
              </div>

              {addingNote && (
                <div className="mb-3 p-3 rounded-[8px] border border-[#3a3a3d] bg-[#1c1c1f] space-y-2">
                  <select
                    value={noteType}
                    onChange={(e) => setNoteType(e.target.value as Activity["type"])}
                    className="w-full bg-[#161618] border border-[#2a2a2d] rounded-[5px] px-2 py-1.5 text-[12px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2]"
                  >
                    <option value="note">📝 Note</option>
                    <option value="email_sent">✉️ Email Sent</option>
                    <option value="call">📞 Call</option>
                    <option value="meeting">🤝 Meeting</option>
                    <option value="linkedin_message">💼 LinkedIn Message</option>
                  </select>
                  <textarea
                    autoFocus
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addActivity(); }}
                    placeholder="Write a note… (Ctrl+Enter to save)"
                    rows={3}
                    className="w-full bg-[#161618] border border-[#2a2a2d] rounded-[5px] px-3 py-2 text-[12px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2] resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={addActivity} disabled={!noteText.trim()}
                      className="px-3 py-1.5 rounded-[4px] text-[12px] font-medium bg-[#5e6ad2] text-white hover:bg-[#4f5bc4] disabled:opacity-40 transition-colors">
                      Save
                    </button>
                    <button onClick={() => { setAddingNote(false); setNoteText(""); }}
                      className="px-3 py-1.5 rounded-[4px] text-[12px] text-[#8b8b91] border border-[#2a2a2d] hover:text-[#e8e8ea] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {activities.length === 0 ? (
                <p className="text-[12px] text-[#55555c]">No activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((act) => (
                    <div key={act.id} className="flex gap-2.5">
                      <span className="text-[14px] mt-0.5 shrink-0">{ACTIVITY_ICONS[act.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[#e8e8ea] leading-snug">{act.note}</p>
                        <p className="text-[10px] text-[#55555c] mt-0.5">
                          {act.by} · {new Date(act.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            )}

            {/* Thread Tab */}
            {detailTab === "thread" && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 min-h-[160px] max-h-[360px] overflow-y-auto pr-1">
                {(lead.messages ?? []).length === 0 ? (
                  <p className="text-[12px] text-[#55555c]">No messages yet. Say something.</p>
                ) : (
                  (lead.messages ?? []).map((msg) => (
                    <div key={msg.id} className={`flex ${msg.from === "nick" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-3 py-2 text-[12px] leading-snug ${
                        msg.from === "nick"
                          ? "bg-[#5e6ad2] text-white rounded-[10px] rounded-br-[2px]"
                          : "bg-[#2a2a2d] text-[#e8e8ea] rounded-[10px] rounded-bl-[2px]"
                      }`}>
                        <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.text}</p>
                        <p className="text-[10px] opacity-60 mt-0.5">
                          {msg.from === "nick" ? "Nick" : "Mike"} · {new Date(msg.sentAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="flex gap-2">
                <input
                  value={threadInput}
                  onChange={(e) => setThreadInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Message Mike…"
                  className="flex-1 bg-[#1c1c1f] border border-[#2a2a2d] rounded-[6px] px-3 py-1.5 text-[12px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2] placeholder:text-[#55555c]"
                />
                <button
                  onClick={sendMessage}
                  disabled={!threadInput.trim() || sendingMessage}
                  className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-[#5e6ad2] text-white hover:bg-[#4f5bc4] disabled:opacity-40 transition-colors"
                >
                  Send
                </button>
              </div>
            </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Lead Modal ────────────────────────────────────────────────────────────────

function LeadModal({ initial, onSave, onClose }: {
  initial: typeof EMPTY_FORM | Lead;
  onSave: (data: typeof EMPTY_FORM) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function inp(key: keyof typeof form, label: string, type = "text") {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-[#8b8b91] font-medium uppercase tracking-wider">{label}</label>
        <input type={type} value={(form[key] as string) ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="bg-[#1c1c1f] border border-[#2a2a2d] rounded-[5px] px-3 py-2 text-[13px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2]" />
      </div>
    );
  }

  function sel(key: keyof typeof form, label: string, opts: string[]) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-[#8b8b91] font-medium uppercase tracking-wider">{label}</label>
        <select value={(form[key] as string) ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="bg-[#1c1c1f] border border-[#2a2a2d] rounded-[5px] px-3 py-2 text-[13px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2]">
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#161618] border border-[#2a2a2d] rounded-[10px] w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2d]">
          <span className="text-[14px] font-semibold text-[#e8e8ea]">{"id" in initial ? "Edit Lead" : "Add Lead"}</span>
          <button onClick={onClose} className="text-[#55555c] hover:text-[#e8e8ea] text-[18px] transition-colors">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {inp("name", "Name")}
            {inp("title", "Title")}
            {inp("company", "Company")}
            {inp("companySize", "Company Size")}
            {sel("vertical", "Vertical", VERTICALS)}
            {sel("status", "Status", STATUSES)}
            {sel("confidence", "Confidence", CONFIDENCE_LEVELS)}
            {sel("source", "Source", ["", ...SOURCES])}
            {inp("email", "Email", "email")}
            {inp("phone", "Phone", "tel")}
            {inp("linkedin", "LinkedIn URL")}
            {inp("followUpDate", "Follow-up Date", "date")}
            {inp("sequence", "Sequence")}
            {inp("triggerEvent", "Trigger Event")}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#8b8b91] font-medium uppercase tracking-wider">Notes / Fit Notes</label>
            <textarea value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="bg-[#1c1c1f] border border-[#2a2a2d] rounded-[5px] px-3 py-2 text-[13px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2] resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#2a2a2d]">
          <button onClick={onClose}
            className="px-4 py-2 rounded-[5px] text-[13px] text-[#8b8b91] border border-[#2a2a2d] hover:text-[#e8e8ea] transition-colors">
            Cancel
          </button>
          <button disabled={saving || !form.name.trim()}
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
            className="px-4 py-2 rounded-[5px] text-[13px] font-medium bg-[#5e6ad2] text-white hover:bg-[#4f5bc4] disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [verticalFilter, setVerticalFilter] = useState<"All" | Vertical>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | Status>("All");
  const [confidenceFilter, setConfidenceFilter] = useState<"All" | Confidence>("All");
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [focusedRowIdx, setFocusedRowIdx] = useState<number>(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const dragId = useRef<string | null>(null);

  const fetchLeads = useCallback(async () => {
    const res = await fetch("/api/crm");
    const data = await res.json();
    const loadedLeads: Lead[] = data.leads ?? [];
    // Auto-flag leads with no email as Needs Info
    const toFlag = loadedLeads.filter((l) => !l.email && l.status !== "Needs Info");
    const now = new Date().toISOString();
    const finalLeads = loadedLeads.map((l) =>
      !l.email && l.status !== "Needs Info" ? { ...l, status: "Needs Info" as Status, updatedAt: now } : l
    );
    setLeads(finalLeads);
    setLoading(false);
    if (toFlag.length > 0) {
      await Promise.all(
        toFlag.map((l) =>
          fetch(`/api/crm/${l.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Needs Info" }),
          })
        )
      );
    }
  }, []);

  const fetchToolStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/tool-status");
      const data = await res.json();
      setToolStatuses(data.tools ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchLeads();
    fetchToolStatus();
    const iv = setInterval(fetchToolStatus, 60_000);
    return () => clearInterval(iv);
  }, [fetchLeads, fetchToolStatus]);

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        if (detailLead) { setDetailLead(null); return; }
        if (showModal || editingLead) { setShowModal(false); setEditingLead(null); return; }
        if (selected.size > 0) { setSelected(new Set()); return; }
      }

      if (!isInput) {
        if (e.key === "n" || e.key === "N") { e.preventDefault(); setShowModal(true); }
        if (e.key === "f" || e.key === "F") { e.preventDefault(); searchRef.current?.focus(); }
      }
    }
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [detailLead, showModal, editingLead, selected.size]);

  // ── Derived / filtered / sorted ─────────────────────────────────────────
  const overdueCt = leads.filter((l) => isOverdue(l)).length;
  const todayCt = leads.filter((l) => isDueToday(l)).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter((l) => {
      if (verticalFilter !== "All" && l.vertical !== verticalFilter) return false;
      if (statusFilter !== "All" && l.status !== statusFilter) return false;
      if (confidenceFilter !== "All" && l.confidence !== confidenceFilter) return false;
      if (q) {
        const hay = `${l.name} ${l.company} ${l.title ?? ""} ${l.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, verticalFilter, statusFilter, confidenceFilter, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortKey === "company") { av = (a.company ?? "").toLowerCase(); bv = (b.company ?? "").toLowerCase(); }
      else if (sortKey === "followUpDate") { av = a.followUpDate ?? ""; bv = b.followUpDate ?? ""; }
      else if (sortKey === "touchCount") { av = a.touchCount ?? 0; bv = b.touchCount ?? 0; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-[10px] opacity-20 ml-1">↕</span>;
    return <span className="text-[10px] text-[#5e6ad2] ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async function createLead(data: typeof EMPTY_FORM) {
    await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowModal(false);
    fetchLeads();
  }

  async function updateLead(id: string, data: Partial<Lead>) {
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...data, updatedAt: new Date().toISOString() } : l)));
    setDetailLead((prev) => (prev?.id === id ? { ...prev, ...data } : prev));
    setEditingLead(null);
    // Background save
    await fetch(`/api/crm/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function deleteLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setConfirmDelete(null);
    setDetailLead(null);
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
    await fetch(`/api/crm/${id}`, { method: "DELETE" });
  }

  async function patchStatus(id: string, status: Status) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    setDetailLead((prev) => (prev?.id === id ? { ...prev, status } : prev));
    await fetch(`/api/crm/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  function handleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (checked) s.add(id);
      else s.delete(id);
      return s;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  }

  async function bulkSetStatus(status: Status) {
    const ids = Array.from(selected);
    setLeads((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, status } : l)));
    setSelected(new Set());
    await Promise.all(ids.map((id) =>
      fetch(`/api/crm/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    ));
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
    setSelected(new Set());
    await Promise.all(ids.map((id) => fetch(`/api/crm/${id}`, { method: "DELETE" })));
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, id: string) {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() { dragId.current = null; }

  function handleDrop(e: React.DragEvent, status: Status) {
    e.preventDefault();
    if (!dragId.current) return;
    const id = dragId.current;
    dragId.current = null;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    patchStatus(id, status);
  }

  // ── Context menu actions ──────────────────────────────────────────────────

  function handleContextAction(action: string, lead: Lead) {
    if (action === "open") { setDetailLead(lead); return; }
    if (action === "delete") { setConfirmDelete(lead.id); return; }
    if (action === "log") { setDetailLead(lead); return; }
    if (action === "followup") {
      const today = new Date().toISOString().slice(0, 10);
      updateLead(lead.id, { followUpDate: today });
      return;
    }
    if (action === "archive") {
      updateLead(lead.id, { status: lead.status === "Needs Info" ? "New" : "Needs Info" });
      return;
    }
    if (action.startsWith("status:")) {
      patchStatus(lead.id, action.slice(7) as Status);
      return;
    }
  }

  // ── Table keyboard nav ────────────────────────────────────────────────────

  function handleTableKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedRowIdx((i) => Math.min(i + 1, sorted.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedRowIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedRowIdx >= 0) {
      setDetailLead(sorted[focusedRowIdx]);
    }
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  function exportSalesforce() {
    const sfLeads = filtered.filter((l) => l.status === "Meeting Booked" || l.status === "Handed Off");
    const header = ["First Name", "Last Name", "Title", "Company", "Phone", "Email", "Lead Source", "Description", "Website"];
    const rows = sfLeads.map((l) => {
      const { first, last } = parseName(l.name);
      return [first, last, l.title, l.company, l.phone ?? "", l.email ?? "", l.vertical, l.notes ?? "", l.linkedin ?? ""];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `salesforce-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const cols: (keyof Lead)[] = ["name", "title", "company", "vertical", "status", "email", "phone", "linkedin", "notes", "source", "confidence", "followUpDate", "createdAt"];
    const header = cols.join(",");
    const rows = filtered.map((l) => cols.map((c) => `"${String(l[c] ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-6 min-h-screen bg-[#0f0f10]">
      <style>{`
        .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #55555c; margin-bottom: 8px; display: block; }
        .col-header-btn { cursor: pointer; user-select: none; white-space: nowrap; }
        .col-header-btn:hover { color: #e8e8ea; }
      `}</style>

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold text-[#e8e8ea] tracking-tight">CRM</h1>
          <p className="text-[13px] text-[#55555c] mt-0.5">
            {leads.length} leads · {VERTICALS.join(" & ")}
            {selected.size > 0 && <span className="ml-2 text-[#5e6ad2]">· {selected.size} selected</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-[#1c1c1f] border border-[#2a2a2d] rounded-[6px] p-0.5">
            {(["kanban", "table"] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-[4px] text-[12px] font-medium transition-all"
                style={view === v ? { background: "#2a2a2d", color: "#e8e8ea" } : { color: "#55555c" }}>
                {v === "kanban" ? "⬛ Board" : "≡ Table"}
              </button>
            ))}
          </div>
          <button onClick={exportSalesforce}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[5px] text-[12px] font-medium text-[#8b8b91] border border-[#2a2a2d] hover:text-[#e8e8ea] hover:border-[#3a3a3d] transition-colors">
            ↓ Salesforce
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[5px] text-[12px] font-medium text-[#8b8b91] border border-[#2a2a2d] hover:text-[#e8e8ea] hover:border-[#3a3a3d] transition-colors">
            ↓ CSV
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[5px] text-[13px] font-medium bg-[#5e6ad2] text-white hover:bg-[#4f5bc4] transition-colors"
            title="Add Lead (N)">
            + Add Lead
          </button>
        </div>
      </div>

      {/* Overdue / today alert */}
      {(overdueCt > 0 || todayCt > 0) && (
        <div className="flex gap-2 mb-4">
          {overdueCt > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[#2e1919] border border-[#702828] text-[#e05252] text-[12px] font-semibold">
              ⚠ {overdueCt} overdue follow-up{overdueCt > 1 ? "s" : ""}
            </div>
          )}
          {todayCt > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[#2b2010] border border-[#5a4010] text-[#e8a045] text-[12px] font-semibold">
              ● {todayCt} follow-up{todayCt > 1 ? "s" : ""} due today
            </div>
          )}
        </div>
      )}

      {/* Tool status strip */}
      {toolStatuses.length > 0 && (
        <div className="flex items-center gap-4 mb-4 px-3 py-2 rounded-[6px] bg-[#1c1c1f] border border-[#2a2a2d]">
          {toolStatuses.map((tool) => {
            const isActive = tool.status === "active";
            const icon = tool.name.toLowerCase().includes("linkedin") ? "🔗" : tool.name.toLowerCase().includes("zoom") ? "🔎" : "⚙️";
            return (
              <div key={tool.name} className="flex items-center gap-2">
                <span className="text-[13px]">{icon}</span>
                <span className="text-[12px] text-[#8b8b91]">{tool.name}</span>
                <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`} />
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isActive ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
                  {tool.status}
                </span>
                {tool.expiresAt && (
                  <span className="text-[10px] text-[#55555c]">exp {new Date(tool.expiresAt).toLocaleDateString()}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-[8px] border border-[#2a2a2d] bg-[#161618] mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#55555c] uppercase tracking-wider font-medium">Total</span>
          <span className="text-[14px] font-semibold text-[#e8e8ea]">{leads.length}</span>
        </div>
        <div className="w-px h-4 bg-[#2a2a2d]" />
        {VERTICALS.map((v) => {
          const vs = VERTICAL_STYLE[v];
          return (
            <div key={v} className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-medium border"
                style={{ background: vs.bg, color: vs.text, borderColor: vs.border }}>
                {v}
              </span>
              <span className="text-[13px] font-medium text-[#e8e8ea]">
                {leads.filter((l) => l.vertical === v).length}
              </span>
            </div>
          );
        })}
        <div className="w-px h-4 bg-[#2a2a2d]" />
        {STATUSES.map((s) => {
          const ss = STATUS_STYLE[s];
          const c = leads.filter((l) => l.status === s).length;
          return (
            <div key={s} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ss.dot }} />
              <span className="text-[11px] text-[#55555c]">{s.split(" ")[0]}</span>
              <span className="text-[12px] font-medium text-[#8b8b91]">{c}</span>
            </div>
          );
        })}
        <div className="ml-auto text-[11px] text-[#55555c]">Showing {filtered.length}</div>
      </div>

      {/* ── Search + Filter bar ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Live search */}
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#55555c] text-[13px]">⌕</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads… (F)"
            className="pl-8 pr-3 py-2 w-[220px] bg-[#1c1c1f] border border-[#2a2a2d] rounded-[6px] text-[13px] text-[#e8e8ea] placeholder-[#55555c] focus:outline-none focus:border-[#5e6ad2] transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#55555c] hover:text-[#e8e8ea] text-[14px] transition-colors">
              ×
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-[#2a2a2d]" />

        {/* Vertical filter */}
        <div className="flex items-center gap-1">
          {(["All", ...VERTICALS] as ("All" | Vertical)[]).map((v) => {
            const active = verticalFilter === v;
            const vs = v !== "All" ? VERTICAL_STYLE[v] : null;
            return (
              <button key={v} onClick={() => setVerticalFilter(v)}
                className="px-2.5 py-1 rounded-[4px] text-[12px] font-medium border transition-colors"
                style={active && vs ? { background: vs.bg, color: vs.text, borderColor: vs.border }
                  : active ? { background: "rgba(255,255,255,0.08)", color: "#e8e8ea", borderColor: "#3a3a3d" }
                  : { background: "transparent", color: "#8b8b91", borderColor: "#2a2a2d" }}>
                {v}
              </button>
            );
          })}
        </div>

        <div className="w-px h-4 bg-[#2a2a2d]" />

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {(["All", ...STATUSES] as ("All" | Status)[]).map((s) => {
            const active = statusFilter === s;
            const ss = s !== "All" ? STATUS_STYLE[s] : null;
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-2.5 py-1 rounded-[4px] text-[12px] font-medium border transition-colors"
                style={active && ss ? { background: ss.bg, color: ss.text, borderColor: ss.border }
                  : active ? { background: "rgba(255,255,255,0.08)", color: "#e8e8ea", borderColor: "#3a3a3d" }
                  : { background: "transparent", color: "#8b8b91", borderColor: "#2a2a2d" }}>
                {s}
              </button>
            );
          })}
        </div>

        <div className="w-px h-4 bg-[#2a2a2d]" />

        {/* Confidence filter */}
        <div className="flex items-center gap-1">
          {(["All", ...CONFIDENCE_LEVELS] as ("All" | Confidence)[]).map((c) => {
            const active = confidenceFilter === c;
            const cs = c !== "All" ? CONFIDENCE_STYLE[c] : null;
            return (
              <button key={c} onClick={() => setConfidenceFilter(c)}
                className="px-2.5 py-1 rounded-[4px] text-[12px] font-medium border transition-colors flex items-center gap-1"
                style={active && cs ? { background: cs.bg, color: cs.text, borderColor: cs.border }
                  : active ? { background: "rgba(255,255,255,0.08)", color: "#e8e8ea", borderColor: "#3a3a3d" }
                  : { background: "transparent", color: "#8b8b91", borderColor: "#2a2a2d" }}>
                {c !== "All" && cs && <span className="w-1.5 h-1.5 rounded-full" style={{ background: cs.dot }} />}
                {c === "All" ? "All Fit" : cs!.label}
              </button>
            );
          })}
        </div>

        {/* Keyboard hint */}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-[#3a3a3d]">
          <kbd className="px-1.5 py-0.5 rounded bg-[#1c1c1f] border border-[#2a2a2d] font-mono">N</kbd> new
          <kbd className="px-1.5 py-0.5 rounded bg-[#1c1c1f] border border-[#2a2a2d] font-mono">F</kbd> search
          <kbd className="px-1.5 py-0.5 rounded bg-[#1c1c1f] border border-[#2a2a2d] font-mono">Esc</kbd> close
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-[8px] border border-[#3a4080] bg-[#1b2042]">
          <span className="text-[13px] font-semibold text-[#8b95e8]">{selected.size} selected</span>
          <div className="w-px h-4 bg-[#3a4080]" />
          <span className="text-[12px] text-[#8b8b91]">Move to:</span>
          {STATUSES.map((s) => {
            const ss = STATUS_STYLE[s];
            return (
              <button key={s} onClick={() => bulkSetStatus(s)}
                className="px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-all hover:opacity-90"
                style={{ background: ss.bg, color: ss.text, borderColor: ss.border }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: ss.dot }} />
                {s}
              </button>
            );
          })}
          <div className="w-px h-4 bg-[#3a4080]" />
          <button onClick={bulkDelete}
            className="px-3 py-1 rounded-[4px] text-[12px] font-medium text-[#e05252] border border-[#e05252]/30 hover:bg-[#e05252]/10 transition-colors">
            Delete {selected.size}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="ml-auto text-[11px] text-[#55555c] hover:text-[#e8e8ea] transition-colors">
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Kanban View ── */}
      {view === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUSES.map((status) => {
            const colLeads = filtered.filter((l) => l.status === status);
            return (
              <KanbanColumn
                key={status}
                status={status}
                leads={colLeads}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onCardClick={(lead) => setDetailLead(lead)}
                onCardContextMenu={(e, lead) => setCtxMenu({ x: e.clientX, y: e.clientY, lead })}
                selected={selected}
                onSelect={handleSelect}
                showCheckbox={selected.size > 0}
                searchQuery={search}
              />
            );
          })}
        </div>
      )}

      {/* ── Table View ── */}
      {view === "table" && (<>
        <div className="rounded-[8px] border border-[#2a2a2d] bg-[#161618] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[13px] text-[#55555c]">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <span className="text-[28px] opacity-20">📋</span>
              <span className="text-[13px] text-[#55555c]">No leads match the current filters</span>
            </div>
          ) : (
            <table
              ref={tableRef}
              className="w-full text-[13px] outline-none"
              tabIndex={0}
              onKeyDown={handleTableKeyDown}
              onFocus={() => { if (focusedRowIdx < 0 && sorted.length > 0) setFocusedRowIdx(0); }}
              onBlur={() => setFocusedRowIdx(-1)}
            >
              <thead>
                <tr className="border-b border-[#2a2a2d]">
                  <th className="px-3 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer accent-[#5e6ad2]"
                    />
                  </th>
                  {([
                    { key: "name", label: "Name" },
                    { key: null, label: "Title" },
                    { key: "company", label: "Company" },
                    { key: null, label: "Vertical" },
                    { key: null, label: "Fit" },
                    { key: null, label: "Status" },
                    { key: "followUpDate", label: "Follow-up" },
                    { key: "touchCount", label: "Touches" },
                    { key: null, label: "Email" },
                    { key: null, label: "" },
                  ] as { key: SortKey | null; label: string }[]).map(({ key, label }) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-left text-[11px] font-medium text-[#55555c] uppercase tracking-wider whitespace-nowrap ${key ? "col-header-btn hover:text-[#e8e8ea] transition-colors" : ""}`}
                      onClick={key ? () => toggleSort(key) : undefined}
                    >
                      {label}{key && sortIcon(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((lead, idx) => {
                  const vs = VERTICAL_STYLE[lead.vertical];
                  const overdue = isOverdue(lead);
                  const today = isDueToday(lead);
                  const isFocused = focusedRowIdx === idx;
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-[#2a2a2d] last:border-0 transition-colors cursor-pointer"
                      style={{
                        background: isFocused ? "rgba(94,106,210,0.08)" : selected.has(lead.id) ? "rgba(94,106,210,0.05)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isFocused) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isFocused) (e.currentTarget as HTMLTableRowElement).style.background = selected.has(lead.id) ? "rgba(94,106,210,0.05)" : "transparent";
                      }}
                      onClick={() => setDetailLead(lead)}
                      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, lead }); }}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={(e) => handleSelect(lead.id, e.target.checked)}
                          className="cursor-pointer accent-[#5e6ad2]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {overdue && <span className="w-2 h-2 rounded-full bg-[#e05252] flex-shrink-0" title="Overdue" />}
                          <span className="font-medium text-[#e8e8ea]">{highlight(lead.name, search)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#8b8b91]">
                        {lead.title ? highlight(lead.title, search) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#8b8b91]">
                        {lead.company ? highlight(lead.company, search) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-medium border"
                          style={{ background: vs.bg, color: vs.text, borderColor: vs.border }}>
                          {lead.vertical}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBadge value={lead.confidence} onClick={() => {
                          const next: Record<Confidence, Confidence> = { high: "medium", medium: "low", low: "high" };
                          updateLead(lead.id, { confidence: next[lead.confidence ?? "medium"] });
                        }} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <StatusDropdown value={lead.status} onChange={(s) => patchStatus(lead.id, s)} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[12px]"
                        style={overdue ? { color: "#e05252" } : today ? { color: "#e8a045" } : { color: "#55555c" }}>
                        {lead.followUpDate ? lead.followUpDate.slice(0, 10) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#55555c] text-center text-[12px]">
                        {(lead.touchCount ?? 0) > 0 ? lead.touchCount : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()}
                            className="text-[#8b8b91] hover:text-[#e8e8ea] transition-colors truncate max-w-[140px] block text-[12px]">
                            {lead.email}
                          </a>
                        ) : <span className="text-[#3a3a3d]">—</span>}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingLead(lead)}
                            className="px-2 py-1 rounded-[4px] text-[11px] text-[#8b8b91] border border-[#2a2a2d] hover:text-[#e8e8ea] hover:border-[#3a3a3d] transition-colors">
                            Edit
                          </button>
                          <button onClick={() => setConfirmDelete(lead.id)}
                            className="px-2 py-1 rounded-[4px] text-[11px] text-[#e05252] border border-[#e05252]/30 hover:bg-[#e05252]/10 transition-colors">
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </>)}

      {/* ── Detail Panel ── */}
      {detailLead && (
        <DetailPanel
          lead={leads.find((l) => l.id === detailLead.id) ?? detailLead}
          onClose={() => setDetailLead(null)}
          onUpdate={updateLead}
        />
      )}

      {/* ── Context Menu ── */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onAction={handleContextAction}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Modals ── */}
      {showModal && (
        <LeadModal initial={EMPTY_FORM} onSave={createLead} onClose={() => setShowModal(false)} />
      )}
      {editingLead && (
        <LeadModal
          initial={editingLead}
          onSave={(data) => updateLead(editingLead.id, data)}
          onClose={() => setEditingLead(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#161618] border border-[#2a2a2d] rounded-[10px] w-[360px] p-6 shadow-2xl">
            <h3 className="text-[14px] font-semibold text-[#e8e8ea] mb-2">Delete Lead?</h3>
            <p className="text-[13px] text-[#8b8b91] mb-5">This will permanently remove the lead and cannot be undone.</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-[5px] text-[13px] text-[#8b8b91] border border-[#2a2a2d] hover:text-[#e8e8ea] transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteLead(confirmDelete)}
                className="px-4 py-2 rounded-[5px] text-[13px] font-medium bg-[#e05252] text-white hover:bg-[#c84444] transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Offers ── */}
      <section className="mt-10 mb-6">
        <h2 className="text-[11px] font-bold text-[#55555c] uppercase tracking-wider mb-3">Offers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {OFFERS.map((offer) => (
            <div key={offer.name} className="rounded-[8px] border border-[#2a2a2d] bg-[#1c1c1f] p-4 hover:border-[#3a3a3d] transition-colors">
              <h3 className="text-[13px] font-medium text-[#e8e8ea] mb-1">{offer.name}</h3>
              <span className="inline-block px-1.5 py-0.5 rounded-[3px] text-[10px] bg-[#2a2a2d] text-[#8b8b91] mb-2">
                {offer.category.toLowerCase()}
              </span>
              <p className="text-[11px] text-[#55555c] leading-relaxed">{offer.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Markets ── */}
      <section className="mb-8">
        <h2 className="text-[11px] font-bold text-[#55555c] uppercase tracking-wider mb-3">Markets</h2>
        <div className="flex flex-wrap gap-2">
          {MARKETS.map((market) => (
            <span key={market} className="px-2.5 py-1 rounded-[4px] text-[12px] bg-[#1c1c1f] border border-[#2a2a2d] text-[#8b8b91]">
              {market}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

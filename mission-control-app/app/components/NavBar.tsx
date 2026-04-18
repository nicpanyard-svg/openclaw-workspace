"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// Inline lucide-style SVG icons
function IconTarget() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

type NavLink = { href: string; label: string; icon?: string; svgIcon?: React.ReactNode };

const links: NavLink[] = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/tasks", label: "Tasks", icon: "✅" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/tools", label: "Tools", icon: "🔧" },
  { href: "/crm", label: "CRM", icon: "📋" },
  { href: "/outreach", label: "Outreach", svgIcon: <IconTarget /> },

  { href: "/projects", label: "Projects", icon: "🗂️" },
  { href: "/rapidquote", label: "RapidQuote", icon: "⚡" },
  { href: "/stocks", label: "Graham", icon: "📈" },
  { href: "/portfolio", label: "Portfolio", icon: "📊" },
  { href: "/backtest", label: "Backtest", icon: "🔬" },
  { href: "/scores", label: "Scores", icon: "🧠" },
  { href: "/options-flow", label: "Flow", icon: "🌊" },
  { href: "/position-sizing", label: "Sizing", icon: "📐" },
  { href: "/office", label: "Office", icon: "🏢" },
  { href: "/team", label: "Team", icon: "👥" },
  { href: "/memory", label: "Memory", icon: "🧠" },
  { href: "/docs", label: "Docs", icon: "📄" },
  { href: "/errors", label: "Errors", icon: "🚨" },
  { href: "/inet-world", label: "iNet World", icon: "🌍" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [liveSessions, setLiveSessions] = useState(0);
  const [pendingOutreach, setPendingOutreach] = useState(0);
  const [overdueFollowUps, setOverdueFollowUps] = useState(0);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/coding-sessions");
        const data = await res.json();
        setLiveSessions((data.sessions ?? []).filter((s: { status: string }) => s.status === "running").length);
      } catch { /* silent */ }
    };
    check();
    const iv = setInterval(check, 10_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const checkOutreach = async () => {
      try {
        const res = await fetch("/api/mike/queue?status=pending");
        const data = await res.json();
        setPendingOutreach((data.queue ?? []).length);
      } catch { /* silent */ }
    };
    checkOutreach();
    const iv = setInterval(checkOutreach, 15_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const checkFollowUps = async () => {
      try {
        const res = await fetch("/api/mike/followups");
        const data = await res.json();
        setOverdueFollowUps(data.summary?.handedOff ?? 0);
      } catch { /* silent */ }
    };
    checkFollowUps();
    const iv = setInterval(checkFollowUps, 60_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <nav className="fixed top-0 left-0 h-full w-[220px] bg-[#161618] border-r border-[#2a2a2d] flex flex-col z-50">
      {/* Brand */}
      <div className="px-5 py-4 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded bg-[#5e6ad2] flex items-center justify-center text-white text-xs font-semibold">
          M
        </div>
        <span className="text-[13px] font-semibold text-[#e8e8ea] tracking-tight">
          Mission Control
        </span>
      </div>

      {/* Nav Items */}
      <div className="flex-1 px-2 py-1 space-y-0.5">
        {links.map((link) => {
          const active = pathname === link.href;
          const badge = link.href === "/outreach" && pendingOutreach > 0 ? pendingOutreach
            : link.href === "/followups" && overdueFollowUps > 0 ? overdueFollowUps
            : null;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2.5 px-3 py-[7px] rounded-[5px] text-[13px] font-medium transition-colors ${
                active
                  ? "text-[#e8e8ea] bg-[rgba(255,255,255,0.08)]"
                  : "text-[#8b8b91] hover:text-[#e8e8ea] hover:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              {link.svgIcon ? (
                <span className="w-5 h-5 flex items-center justify-center opacity-70 shrink-0">
                  {link.svgIcon}
                </span>
              ) : (
                <span className="text-[14px] w-5 text-center opacity-70">{link.icon}</span>
              )}
              <span className="flex-1">{link.label}</span>
              {badge && (
                <span className="bg-[#5e6ad2] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#2a2a2d]">
        <Link href="/sessions" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className={`w-2 h-2 rounded-full ${liveSessions > 0 ? "bg-[#26a86a] animate-pulse" : "bg-[#3a3a3d]"}`} />
          <span className="text-[11px] text-[#55555c]">
            {liveSessions > 0 ? `${liveSessions} coding live` : "No active sessions"}
          </span>
        </Link>
      </div>
    </nav>
  );
}

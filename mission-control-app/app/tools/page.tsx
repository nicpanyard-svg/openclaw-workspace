"use client";

import { useState, useEffect } from "react";
import type { Tool } from "../types";
import ToolCard from "../components/ToolCard";

const builtinTools: Tool[] = [
  {
    id: "graham-board",
    name: "Graham Stock Board",
    icon: "📊",
    description: "Interactive stock tracking board with Graham's picks and analysis.",
    status: "online",
    url: "/graham-stock-board/index.html",
    type: "builtin",
  },
  {
    id: "mc-status",
    name: "Mission Control Status",
    icon: "📡",
    description: "View current system status JSON with agent health and sync state.",
    status: "online",
    type: "builtin",
  },
  {
    id: "stock-analyzer",
    name: "Stock Analyzer",
    icon: "📈",
    description: "Run stock analysis by ticker. Get price, sentiment, and momentum data.",
    status: "beta",
    type: "builtin",
  },
  {
    id: "lead-research",
    name: "Lead Research",
    icon: "🔍",
    description: "Research a target company for sales outreach — industry, contacts, fit score.",
    status: "online",
    type: "builtin",
  },
  {
    id: "email-composer",
    name: "Email Composer",
    icon: "✉️",
    description: "Compose outreach emails with pre-built templates for different offer types.",
    status: "online",
    type: "builtin",
  },
];

const statusJson = {
  agents: {
    susan: { status: "active", lastPing: "2026-03-21T08:00:00Z" },
    jill: { status: "active", lastPing: "2026-03-21T08:01:00Z" },
    drPhil: { status: "active", lastPing: "2026-03-21T08:00:30Z" },
    mike: { status: "warn", lastPing: "2026-03-21T07:45:00Z" },
    graham: { status: "active", lastPing: "2026-03-21T07:30:00Z" },
  },
  system: { gitSync: "ok", fileSystem: "ok", calendarSync: "down" },
};

const emailTemplates = ["Cold Outreach", "Follow-Up", "Product Demo Invite", "Partnership Proposal"];

export default function ToolsPage() {
  const [customTools, setCustomTools] = useState<Tool[]>([]);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState("");
  const [emailTemplate, setEmailTemplate] = useState(emailTemplates[0]);
  const [emailBody, setEmailBody] = useState("");
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [newTool, setNewTool] = useState({ name: "", description: "", url: "" });

  useEffect(() => {
    const saved = localStorage.getItem("customTools");
    if (saved) setCustomTools(JSON.parse(saved));
  }, []);

  const saveCustomTool = () => {
    if (!newTool.name) return;
    const tool: Tool = {
      id: `custom-${Date.now()}`,
      name: newTool.name,
      icon: "🔧",
      description: newTool.description || "Custom tool",
      status: "online",
      url: newTool.url || undefined,
      type: "custom",
    };
    const updated = [...customTools, tool];
    setCustomTools(updated);
    localStorage.setItem("customTools", JSON.stringify(updated));
    setNewTool({ name: "", description: "", url: "" });
    setActiveModal(null);
  };

  const handleLaunch = (tool: Tool) => {
    setActiveModal(tool.id);
    setAnalysisResult(null);
    setTicker("");
    setCompany("");
    setEmailBody("");
  };

  const runAnalysis = () => {
    setAnalysisResult(
      `Ticker: ${ticker.toUpperCase()}\nPrice: $${(Math.random() * 500 + 10).toFixed(2)}\nSentiment: ${["Bullish", "Neutral", "Bearish"][Math.floor(Math.random() * 3)]}\nMomentum: ${["Strong", "Moderate", "Weak"][Math.floor(Math.random() * 3)]}\n52w Range: $${(Math.random() * 100 + 10).toFixed(2)} - $${(Math.random() * 500 + 100).toFixed(2)}\nVolume: ${(Math.random() * 10 + 1).toFixed(1)}M`
    );
  };

  const allTools = [...builtinTools, ...customTools];

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold text-[#e8e8ea]">Tools</h1>
        <button
          onClick={() => setActiveModal("add-custom")}
          className="px-3 py-1.5 rounded-[5px] text-[12px] font-medium text-[#5e6ad2] hover:bg-[#5e6ad2]/10 transition-colors cursor-pointer"
        >
          + Add tool
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {allTools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} onLaunch={handleLaunch} />
        ))}
      </div>

      {/* Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1c1c1f] border border-[#2a2a2d] rounded-md p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-semibold text-[#e8e8ea]">
                {activeModal === "add-custom"
                  ? "Add Custom Tool"
                  : allTools.find((t) => t.id === activeModal)?.name}
              </h2>
              <button
                onClick={() => setActiveModal(null)}
                className="text-[#55555c] hover:text-[#e8e8ea] text-lg cursor-pointer leading-none"
              >
                ×
              </button>
            </div>

            {activeModal === "add-custom" && (
              <div className="space-y-3">
                <input
                  className="w-full p-2.5 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d] text-[#e8e8ea] text-[13px] placeholder:text-[#55555c]"
                  placeholder="Tool name"
                  value={newTool.name}
                  onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                />
                <input
                  className="w-full p-2.5 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d] text-[#e8e8ea] text-[13px] placeholder:text-[#55555c]"
                  placeholder="Description"
                  value={newTool.description}
                  onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                />
                <input
                  className="w-full p-2.5 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d] text-[#e8e8ea] text-[13px] placeholder:text-[#55555c]"
                  placeholder="URL or command"
                  value={newTool.url}
                  onChange={(e) => setNewTool({ ...newTool, url: e.target.value })}
                />
                <button
                  onClick={saveCustomTool}
                  className="w-full py-2 rounded-[5px] bg-[#5e6ad2] text-white text-[13px] font-medium hover:bg-[#4f5bc3] transition-colors cursor-pointer"
                >
                  Save Tool
                </button>
              </div>
            )}

            {activeModal === "mc-status" && (
              <pre className="text-[12px] text-[#8b8b91] bg-[#0f0f10] p-4 rounded-[5px] overflow-auto font-mono">
                {JSON.stringify(statusJson, null, 2)}
              </pre>
            )}

            {activeModal === "stock-analyzer" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    className="flex-1 p-2.5 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d] text-[#e8e8ea] text-[13px] placeholder:text-[#55555c]"
                    placeholder="Enter ticker (e.g. AAPL)"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                  />
                  <button
                    onClick={runAnalysis}
                    className="px-4 py-2 rounded-[5px] bg-[#5e6ad2] text-white text-[13px] font-medium hover:bg-[#4f5bc3] transition-colors cursor-pointer"
                  >
                    Analyze
                  </button>
                </div>
                {analysisResult && (
                  <pre className="text-[13px] text-[#e8e8ea] bg-[#0f0f10] p-4 rounded-[5px] whitespace-pre-wrap font-mono">
                    {analysisResult}
                  </pre>
                )}
              </div>
            )}

            {activeModal === "lead-research" && (
              <div className="space-y-3">
                <input
                  className="w-full p-2.5 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d] text-[#e8e8ea] text-[13px] placeholder:text-[#55555c]"
                  placeholder="Company name (e.g. SOLV Energy)"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Industry", value: company ? "Solar EPC" : "—" },
                    { label: "Employees", value: company ? "1,500+" : "—" },
                    { label: "HQ", value: company ? "San Diego, CA" : "—" },
                    { label: "Fit Score", value: company ? "92%" : "—", highlight: true },
                  ].map((field) => (
                    <div key={field.label} className="p-3 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d]">
                      <p className="text-[11px] text-[#55555c] mb-1">{field.label}</p>
                      <p className={`text-[13px] ${field.highlight && company ? "text-[#26a86a]" : "text-[#e8e8ea]"}`}>
                        {field.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeModal === "email-composer" && (
              <div className="space-y-3">
                <select
                  className="w-full p-2.5 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d] text-[#e8e8ea] text-[13px]"
                  value={emailTemplate}
                  onChange={(e) => setEmailTemplate(e.target.value)}
                >
                  {emailTemplates.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <textarea
                  className="w-full p-2.5 rounded-[5px] bg-[#0f0f10] border border-[#2a2a2d] text-[#e8e8ea] text-[13px] h-40 resize-none placeholder:text-[#55555c]"
                  placeholder="Compose your email..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
                <button className="w-full py-2 rounded-[5px] bg-[#5e6ad2] text-white text-[13px] font-medium hover:bg-[#4f5bc3] transition-colors cursor-pointer">
                  Copy to Clipboard
                </button>
              </div>
            )}

            {activeModal === "graham-board" && (
              <p className="text-[13px] text-[#8b8b91]">
                Graham Stock Board opens at{" "}
                <span className="text-[#5e6ad2] font-mono text-[12px]">/graham-stock-board/index.html</span>
              </p>
            )}

            {activeModal?.startsWith("custom-") && (
              <p className="text-[13px] text-[#8b8b91]">
                Custom tool launched. URL:{" "}
                <span className="text-[#5e6ad2] font-mono text-[12px]">
                  {allTools.find((t) => t.id === activeModal)?.url || "N/A"}
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

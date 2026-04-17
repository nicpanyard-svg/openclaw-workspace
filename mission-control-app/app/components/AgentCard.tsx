import type { Agent } from "../types";
import StatusPill from "./StatusPill";

export default function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div
      className={`rounded-xl border p-5 ${agent.bgClass} ${agent.borderClass} transition-all hover:scale-[1.02] hover:shadow-lg`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className={`text-lg font-bold ${agent.colorClass}`}>{agent.name}</h3>
          <p className="text-sm text-[#94a7cf]">{agent.role}</p>
        </div>
        <StatusPill status={agent.status} />
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-[#94a7cf]">Current: </span>
          <span className="text-[#eef4ff]">{agent.currentTask}</span>
        </div>
        <div>
          <span className="text-[#94a7cf]">Next: </span>
          <span className="text-[#eef4ff]">{agent.nextAction}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {agent.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded text-xs bg-[#07101f] text-[#94a7cf] border border-[#27365f]"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

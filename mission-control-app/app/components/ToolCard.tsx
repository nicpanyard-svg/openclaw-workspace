import type { Tool } from "../types";

const statusDot = {
  online: "bg-[#26a86a]",
  offline: "bg-[#e05252]",
  beta: "bg-[#e8a045]",
};

export default function ToolCard({
  tool,
  onLaunch,
}: {
  tool: Tool;
  onLaunch: (tool: Tool) => void;
}) {
  return (
    <div className="rounded-md border border-[#2a2a2d] bg-[#1c1c1f] p-4 flex flex-col hover:border-[#3a3a3f] transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-lg">{tool.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-medium text-[#e8e8ea] truncate">{tool.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot[tool.status]}`} />
          <span className="text-[11px] text-[#55555c]">{tool.status}</span>
        </div>
      </div>
      <p className="text-[12px] text-[#8b8b91] flex-1 mb-4 leading-relaxed">{tool.description}</p>
      <button
        onClick={() => onLaunch(tool)}
        className="w-full py-1.5 rounded-[5px] bg-[#5e6ad2]/10 text-[#5e6ad2] text-[12px] font-medium hover:bg-[#5e6ad2]/20 transition-colors cursor-pointer"
      >
        Launch
      </button>
    </div>
  );
}

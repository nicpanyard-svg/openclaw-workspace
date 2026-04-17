"use client";

const commodities = [
  { name: "Gold",    symbol: "GC",  icon: "Au", color: "#f59e0b", price: "$3,043", change: "+1.2%" },
  { name: "Silver",  symbol: "SI",  icon: "Ag", color: "#94a3b8", price: "$33.74", change: "+0.8%" },
  { name: "WTI Oil", symbol: "CL",  icon: "WTI", color: "#ef4444", price: "$68.28", change: "-0.4%" },
  { name: "Nat Gas", symbol: "NG",  icon: "NG", color: "#3b82f6", price: "$3.89",  change: "+2.1%" },
  { name: "Copper",  symbol: "HG",  icon: "Cu", color: "#f97316", price: "$5.12",  change: "+0.6%" },
];

export default function CommodityBar() {
  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {commodities.map((c) => {
        const up = c.change.startsWith("+");
        return (
          <div
            key={c.symbol}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 flex items-center gap-3"
          >
            {/* Icon circle */}
            <div
              className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
              style={{ background: `${c.color}18`, color: c.color }}
            >
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                {c.name}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-[var(--text-primary)]">
                  {c.price}
                </span>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: up ? "#26a86a" : "#e05252" }}
                >
                  {c.change}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

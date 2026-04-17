export default function StatusPill({ status }: { status: "ACTIVE" | "IDLE" | "WARN" | "DOWN" }) {
  const styles = {
    ACTIVE: "text-[#26a86a] bg-[#26a86a]/10",
    IDLE:   "text-[#8b8b91] bg-[#8b8b91]/10",
    WARN:   "text-[#e8a045] bg-[#e8a045]/10",
    DOWN:   "text-[#e05252] bg-[#e05252]/10",
  };

  const dotColor = {
    ACTIVE: "bg-[#26a86a]",
    IDLE:   "bg-[#8b8b91]",
    WARN:   "bg-[#e8a045]",
    DOWN:   "bg-[#e05252]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium lowercase ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor[status]}`} />
      {status.toLowerCase()}
    </span>
  );
}

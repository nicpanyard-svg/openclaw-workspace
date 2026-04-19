import Image from "next/image";

type RapidQuoteLogoProps = {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
  invertSubtitle?: boolean;
};

const sizeClasses = {
  sm: {
    mark: "h-10 w-10 rounded-[14px]",
    icon: 20,
    title: "text-[16px]",
    subtitle: "text-[11px] tracking-[0.18em]",
  },
  md: {
    mark: "h-12 w-12 rounded-[16px]",
    icon: 24,
    title: "text-[18px]",
    subtitle: "text-[11px] tracking-[0.2em]",
  },
  lg: {
    mark: "h-14 w-14 rounded-[18px]",
    icon: 28,
    title: "text-[22px]",
    subtitle: "text-[12px] tracking-[0.22em]",
  },
} as const;

export function RapidQuoteLogo({
  size = "md",
  showWordmark = true,
  subtitle = "QUOTE WORKSPACE",
  className = "",
  invertSubtitle = false,
}: RapidQuoteLogoProps) {
  const config = sizeClasses[size];

  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <div className={`flex items-center justify-center bg-[#111827] shadow-[0_10px_24px_rgba(17,24,39,0.18)] ring-1 ring-white/70 ${config.mark}`}>
        <Image src="/inet-logo.png" alt="RapidQuote logo" width={config.icon} height={config.icon} className="h-auto w-auto object-contain brightness-0 invert" priority />
      </div>
      {showWordmark ? (
        <div className="leading-none">
          <div className={`font-semibold tracking-[-0.03em] text-[#16202b] ${config.title}`}>RapidQuote</div>
          <div className={`mt-1 font-semibold uppercase ${invertSubtitle ? "text-white/70" : "text-[#8b96a3]"} ${config.subtitle}`}>{subtitle}</div>
        </div>
      ) : null}
    </div>
  );
}

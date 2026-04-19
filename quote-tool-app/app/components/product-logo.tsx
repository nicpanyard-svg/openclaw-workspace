import Image from "next/image";

export function ProductLogo({
  width = 160,
  height = 45,
  className,
  priority = false,
}: {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/rapidquote-logo.svg"
      alt="RapidQuote logo"
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}

import Image from "next/image";
import { RAPIDQUOTE_DEPLOYMENT_BRANDING } from "@/app/lib/app-environment";

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
      src="/rapidquote-logo.jpg"
      alt={`${RAPIDQUOTE_DEPLOYMENT_BRANDING.appLabel} logo`}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}

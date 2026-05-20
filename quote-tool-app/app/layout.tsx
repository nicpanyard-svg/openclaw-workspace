import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { AppFrame, AuthProvider } from "@/app/components/auth-shell";
import { RAPIDQUOTE_DEPLOYMENT_BRANDING, RAPIDQUOTE_DEPLOYMENT_KEY } from "@/app/lib/app-environment";
import "./globals.css";

export const metadata: Metadata = {
  title: `RapidQuote | ${RAPIDQUOTE_DEPLOYMENT_BRANDING.appLabel}`,
  description: `${RAPIDQUOTE_DEPLOYMENT_BRANDING.appLabel} workspace with authenticated access, shared ownership direction, and customer-ready output tools.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const brandThemeVars: CSSProperties = {
    ["--brand-primary" as string]: RAPIDQUOTE_DEPLOYMENT_BRANDING.primaryColor,
    ["--brand-accent" as string]: RAPIDQUOTE_DEPLOYMENT_BRANDING.accentColor,
    ["--brand-muted" as string]: RAPIDQUOTE_DEPLOYMENT_BRANDING.mutedColor,
  };

  return (
    <html lang="en" data-deployment={RAPIDQUOTE_DEPLOYMENT_KEY} style={brandThemeVars}>
      <body>
        <AuthProvider>
          <AppFrame>{children}</AppFrame>
        </AuthProvider>
      </body>
    </html>
  );
}

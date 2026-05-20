import type { Metadata } from "next";
import { AppFrame, AuthProvider } from "@/app/components/auth-shell";
import { RAPIDQUOTE_DEPLOYMENT_BRANDING } from "@/app/lib/app-environment";
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
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppFrame>{children}</AppFrame>
        </AuthProvider>
      </body>
    </html>
  );
}

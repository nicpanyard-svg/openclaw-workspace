import type { Metadata } from "next";
import { AppFrame, AuthProvider } from "@/app/components/auth-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "RapidQuote | Secure Proposal Workspace",
  description: "RapidQuote proposal workspace with authenticated access, shared ownership direction, and customer-ready output tools.",
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

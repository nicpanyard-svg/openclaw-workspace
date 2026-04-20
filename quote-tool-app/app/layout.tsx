import type { Metadata } from "next";
import { AppFrame, AuthProvider } from "@/app/components/auth-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "RapidQuote | Proposal Workspace",
  description: "RapidQuote is the proposal workspace for building, reviewing, and managing iNet quotes and proposals.",
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

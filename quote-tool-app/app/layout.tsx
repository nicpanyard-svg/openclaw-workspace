import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RapidQuote | Proposal Workspace",
  description: "Proposal workspace and quote builder for creating polished, customer-ready proposals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quote Tool App",
  description: "Internal quote template shell preview",
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

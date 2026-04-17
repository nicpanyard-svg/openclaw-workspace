import type { Metadata } from "next";
import "./globals.css";
import NavBar from "./components/NavBar";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Agent command center and operations dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex bg-[#0f0f10]" suppressHydrationWarning>
        <NavBar />
        <main className="flex-1 ml-[220px] min-h-screen overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}

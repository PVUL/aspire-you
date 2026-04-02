import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aspire You — Private Journal",
  description: "Decentralized journaling backed by your personal GitHub vault. Local-first, offline-capable, and fully private.",
};

const isDev = process.env.NODE_ENV === "development";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {isDev && <DevPanel />}
      </body>
    </html>
  );
}

// Lazy-load the debug panel so it's tree-shaken in production
async function DevPanel() {
  const { SqliteDebugPanel } = await import("@/components/SqliteDebugPanel");
  return <SqliteDebugPanel />;
}


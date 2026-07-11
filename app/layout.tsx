import type { Metadata } from "next";
import { Music2, Key, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import "./globals.css";
import { getOrCreateSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Plugnote - AI Music Expert & Recommendations",
  description: "Monolithic, production-grade AI music recommendations, playlist curation, lyrics, and 30-second audio previews.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guarantee session exists in DB and cookie is set
  await getOrCreateSession();

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-zinc-950 text-zinc-50 min-h-screen flex flex-col antialiased">
        
        {/* Navigation Bar */}
        <header className="h-16 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-45 flex items-center justify-between px-4 md:px-6" suppressHydrationWarning>
          <div className="flex items-center gap-6" suppressHydrationWarning>
            <Link href="/" className="flex items-center gap-2" suppressHydrationWarning>
              <div className="p-2 bg-gradient-to-tr from-violet-600 to-pink-500 rounded-xl text-white shadow-md hover:shadow-lg transition-all" suppressHydrationWarning>
                <Music2 className="h-5 w-5" />
              </div>
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                Plugnote
              </span>
            </Link>
            
            <nav className="hidden sm:flex items-center gap-1" suppressHydrationWarning>
              <Link
                href="/"
                className="text-xs font-semibold px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 rounded-xl transition-all flex items-center gap-1.5"
                suppressHydrationWarning
              >
                <Music2 className="h-3.5 w-3.5" />
                Chat
              </Link>
              <Link
                href="/settings"
                className="text-xs font-semibold px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 rounded-xl transition-all flex items-center gap-1.5"
                suppressHydrationWarning
              >
                <Key className="h-3.5 w-3.5" />
                API Keys
              </Link>
              <Link
                href="/about"
                className="text-xs font-semibold px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 rounded-xl transition-all flex items-center gap-1.5"
                suppressHydrationWarning
              >
                <Info className="h-3.5 w-3.5" />
                About
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3" suppressHydrationWarning>
            <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-850 px-3 py-1.5 rounded-full text-xs text-zinc-400" suppressHydrationWarning>
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span className="font-medium">AI Music Expert</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col min-h-0">
          {children}
        </main>
      </body>
    </html>
  );
}

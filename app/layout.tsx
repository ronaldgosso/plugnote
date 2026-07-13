import type { Metadata } from "next";
import { Key, Info, Sparkles, Headphones } from "lucide-react";
import Link from "next/link";
import "./globals.css";
import { getOrCreateSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Plugnote — AI Music Expert & Recommendations",
  description: "Premium AI music recommendations, playlist curation, lyrics, and 30-second audio previews. Your personal music intelligence.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getOrCreateSession();

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-[#08080a] text-zinc-50 min-h-screen flex flex-col antialiased">

        {/* ─── Navigation Bar ─────────────────────────────────────── */}
        <header
          className="h-16 sticky top-0 z-40 flex items-center justify-between px-4 md:px-6"
          style={{
            background: "linear-gradient(180deg, #141418 0%, #0f0f12 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.6)",
          }}
          suppressHydrationWarning
        >
          {/* Left — Logo + Nav */}
          <div className="flex items-center gap-5" suppressHydrationWarning>

            {/* Vinyl Logo Mark */}
            <Link href="/" className="flex items-center gap-3 group" suppressHydrationWarning>
              {/* Spinning vinyl disc */}
              <div className="relative h-9 w-9 shrink-0" suppressHydrationWarning>
                {/* Vinyl disc */}
                <div className="absolute inset-0 rounded-full vinyl-disc group-hover:[animation-play-state:running]"
                  style={{ animation: "record-spin 12s linear infinite" }} />
                {/* Center label */}
                <div className="absolute inset-[10px] rounded-full vinyl-label flex items-center justify-center">
                  <Headphones className="h-3 w-3 text-violet-300" />
                </div>
                {/* Chrome rim */}
                <div className="absolute inset-0 rounded-full"
                  style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.8)" }} />
              </div>

              <div className="flex flex-col leading-none" suppressHydrationWarning>
                <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-violet-300 via-pink-300 to-violet-400 bg-clip-text text-transparent">
                  Plugnote
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600 mt-0.5">
                  AI Music Expert
                </span>
              </div>
            </Link>

            {/* Nav Links */}
            <nav className="hidden sm:flex items-center gap-1 pl-2 border-l border-zinc-800/60" suppressHydrationWarning>
              {[
                { href: "/", icon: <Headphones className="h-3.5 w-3.5" />, label: "Studio" },
                { href: "/settings", icon: <Key className="h-3.5 w-3.5" />, label: "API Keys" },
                { href: "/about", icon: <Info className="h-3.5 w-3.5" />, label: "About" },
              ].map(({ href, icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-xs font-semibold px-3 py-1.5 text-zinc-500 hover:text-zinc-200 rounded-lg transition-all flex items-center gap-1.5 hover:bg-white/[0.04]"
                  suppressHydrationWarning
                >
                  {icon}
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right — Status Badge */}
          <div className="flex items-center gap-3" suppressHydrationWarning>
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(236,72,153,0.06) 100%)",
                border: "1px solid rgba(139,92,246,0.2)",
                boxShadow: "0 0 12px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
              suppressHydrationWarning
            >
              {/* Glow dot */}
              <span className="glow-dot" />
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-violet-300">Powered by AI</span>
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

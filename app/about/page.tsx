import { ArrowLeft, ShieldCheck, Music2, BrainCircuit, Play, FileText } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8 bg-zinc-950">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-semibold"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Workspace
          </Link>
          <h1 className="text-2xl font-black text-zinc-100 tracking-tight bg-gradient-to-r from-violet-400 to-pink-500 bg-clip-text text-transparent">
            About Plugnote
          </h1>
          <p className="text-zinc-500 text-xs">
            Learn more about the application features and integrations.
          </p>
        </div>

        {/* Feature lists */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="p-2 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-xl inline-block">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-zinc-200">6 Connected Models</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Allows plugging in your own API keys for OpenAI, Anthropic, Google, Cohere, Groq, and Mistral. Toggle active providers on-the-fly inside the chat panel.
            </p>
          </div>

          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="p-2 bg-green-600/10 border border-green-500/20 text-green-400 rounded-xl inline-block">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-zinc-200">AES-256-GCM Protection</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Keys are encrypted with AES-256-GCM using a server-side encryption key. Decryption occurs inside Server Actions—keys are never sent to the browser.
            </p>
          </div>

          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="p-2 bg-pink-600/10 border border-pink-500/20 text-pink-400 rounded-xl inline-block">
              <Play className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-zinc-200">iTunes Audio Previews</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              We parse track suggestions from the conversation responses, fetch official high-quality cover art, and fetch a 30-second audio stream.
            </p>
          </div>

          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="p-2 bg-cyan-600/10 border border-cyan-500/20 text-cyan-400 rounded-xl inline-block">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-zinc-200">LRCLib Lyrics Search</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Audition recommendations and check lyrics instantly. Queries the free public LRCLib API to load synced or plain lyrics in an overlay panel.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 border-zinc-800 space-y-4">
          <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <Music2 className="h-4.5 w-4.5 text-violet-400" />
            Monolithic Focus
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Plugnote is built as a monolithic Next.js 14 Web Application utilizing SQLite database caching, Next.js Middleware cookies, and React Server Components (RSC) to render responsive, lightweight pages.
          </p>
        </div>
      </div>
    </div>
  );
}

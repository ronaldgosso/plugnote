"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled Error Boundary triggered:", error);
  }, [error]);

  return (
    <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center p-6 space-y-6 text-center">
      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-2xl text-red-500">
        <AlertCircle className="h-8 w-8" />
      </div>
      
      <div className="space-y-2 max-w-sm">
        <h2 className="text-lg font-bold text-zinc-250">Playback interrupted</h2>
        <p className="text-zinc-500 text-xs leading-relaxed">
          {error.message || "A rendering or runtime exception occurred."}
        </p>
      </div>

      <button
        onClick={() => reset()}
        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Try Again
      </button>
    </div>
  );
}

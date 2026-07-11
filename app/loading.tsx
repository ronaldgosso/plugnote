import { Disc } from "lucide-react";

export default function LoadingPage() {
  return (
    <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <Disc className="h-10 w-10 text-violet-500 animate-spin" style={{ animationDuration: "3s" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-3 w-3 bg-zinc-950 rounded-full" />
        </div>
      </div>
      
      <div className="flex items-end gap-1 h-5 mt-1">
        <span className="wave-bar" />
        <span className="wave-bar" />
        <span className="wave-bar" />
        <span className="wave-bar" />
        <span className="wave-bar" />
      </div>
      
      <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest animate-pulse">
        Buffering Soundwaves
      </p>
    </div>
  );
}

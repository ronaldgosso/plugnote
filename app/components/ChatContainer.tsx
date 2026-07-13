"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  Plus, MessageSquare, Trash2, Edit2, Send, Sparkles, Settings, Play, Pause, 
  FileText, Music2, AlertTriangle, Menu, X, ArrowUpRight,
  HelpCircle, Star, PanelLeftOpen, PanelLeftClose
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { readStreamableValue } from "ai/rsc";
import { useRouter } from "next/navigation";
import { 
  sendMessage, getMessages, createConversation, deleteConversation, 
  renameConversation, getConversations, getFreeTrialStatus 
} from "@/app/actions/chat";
import { fetchTrackDetailsAction } from "@/app/actions/music";
import { PROVIDERS_INFO, ProviderId } from "@/lib/ai";

interface Conversation {
  id: string;
  title: string;
  modelProvider: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface ChatContainerProps {
  initialConversations: Conversation[];
  initialActiveId?: string;
  initialMessages: Message[];
  apiKeysStatus: { provider: string; isActive: boolean; hasKey: boolean }[];
  trialStatus: { used: number; limit: number };
}

interface ParsedTrack {
  title: string;
  artist: string;
}

// Track details cache to avoid redundant API queries
interface TrackCacheItem {
  coverArtUrl: string;
  previewUrl: string | null;
  lyrics: string | null;
  album: string;
}

const MOOD_PROMPTS: Record<string, string[]> = {
  all: [
    "Suggest 5 alternative rock albums similar to In Rainbows.",
    "Recommend a warm acoustic song for a rainy evening.",
    "Create a driving synthwave playlist for a nighttime drive.",
    "Explain the connection between Miles Davis and ambient music.",
    "What are some essential 1970s Japanese City Pop tracks?",
    "Suggest dark, cinematic techno for focused programming.",
    "Recommend albums for fans of Pink Floyd's progressive rock style.",
    "What are 5 essential shoegaze albums besides Loveless?",
    "Recommend upbeat bossa nova tracks for a Sunday morning brunch.",
    "Suggest heavy, melancholic doom metal with beautiful vocals.",
    "Explain the origins of Trip Hop and suggest 3 key albums.",
    "Suggest modern neo-classical tracks featuring solo piano.",
    "Create a playlist of 90s East Coast hip-hop with jazz samples.",
    "Recommend high-energy Afrobeat tracks for a workout.",
    "What are some entry-level bebop jazz albums for a beginner?",
    "Suggest dreamy indie pop tracks with lush synth production.",
    "Recommend math rock bands with complex guitar tapping.",
    "Suggest post-punk albums similar to Joy Division's Unknown Pleasures.",
    "Explain the difference between Chicago house and Detroit techno.",
    "Suggest 5 melancholic folk songs with acoustic guitar.",
    "Recommend space ambient albums for deep sleep and relaxation.",
    "Suggest energetic funk tracks with prominent basslines.",
    "What are some essential roots reggae songs about unity?",
    "Recommend baroque pop albums with orchestral arrangements.",
    "Suggest glitch hop or IDM tracks similar to Aphex Twin.",
    "Recommend 80s goth rock songs with dark basslines.",
    "Create a playlist of desert blues or Tuareg guitar music.",
    "Suggest ambient drone tracks for reading a fantasy novel.",
    "Recommend delta blues tracks recorded before 1950.",
    "What are some high-tempo drum and -bass tracks for running?"
  ],
  chill: [
    "Recommend a warm acoustic song for a rainy evening.",
    "Suggest upbeat bossa nova tracks for a Sunday morning brunch.",
    "Suggest 5 melancholic folk songs with acoustic guitar.",
    "What is a good slow-tempo jazz track to wind down to?",
    "Suggest modern lo-fi hip-hop tracks with vinyl crackle.",
    "Recommend ambient dream pop similar to Cigarettes After Sex."
  ],
  focus: [
    "Suggest dark, cinematic techno for focused programming.",
    "Suggest modern neo-classical tracks featuring solo piano.",
    "Suggest ambient drone tracks for reading a fantasy novel.",
    "Recommend instrumental post-rock for deep focus.",
    "What are some minimalist electronic tracks with steady rhythms?",
    "Suggest jazz fusion tracks without lyrics for studying."
  ],
  energy: [
    "Create a driving synthwave playlist for a nighttime drive.",
    "Recommend high-energy Afrobeat tracks for a workout.",
    "What are some high-tempo drum and -bass tracks for running?",
    "Suggest energetic funk tracks with prominent basslines.",
    "Recommend aggressive industrial rock or electronic tracks.",
    "Suggest fast-paced latin house music to get moving."
  ],
  sad: [
    "Suggest heavy, melancholic doom metal with beautiful vocals.",
    "Suggest post-punk albums similar to Joy Division's Unknown Pleasures.",
    "Recommend 80s goth rock songs with dark basslines.",
    "Suggest 5 alternative rock albums similar to In Rainbows.",
    "Recommend slowcore tracks with slow tempos and sad lyrics.",
    "Suggest depressing indie folk songs with hushed vocals."
  ],
  dreamy: [
    "Recommend space ambient albums for deep sleep and relaxation.",
    "Suggest glitch hop or IDM tracks similar to Aphex Twin.",
    "What are 5 essential shoegaze albums besides Loveless?",
    "What are some essential 1970s Japanese City Pop tracks?",
    "Suggest psychedelic rock tracks with spacey guitar effects.",
    "Recommend dreamy synth-pop with ethereal vocal textures."
  ]
};

const MOODS = [
  { id: "all", name: "All Moods", emoji: "🎵" },
  { id: "chill", name: "Chill", emoji: "🧘" },
  { id: "focus", name: "Focus", emoji: "🧠" },
  { id: "energy", name: "Energy", emoji: "⚡" },
  { id: "sad", name: "Melancholy", emoji: "🌧️" },
  { id: "dreamy", name: "Ethereal", emoji: "🌌" }
];

export default function ChatContainer({
  initialConversations,
  initialActiveId,
  initialMessages,
  apiKeysStatus,
  trialStatus
}: ChatContainerProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | undefined>(initialActiveId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("trial_mistral");
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [currentTrialStatus, setCurrentTrialStatus] = useState(trialStatus);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Rename states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Music Player & Lyrics States
  const [trackDetails, setTrackDetails] = useState<Record<string, TrackCacheItem>>({});
  const [loadingTrack, setLoadingTrack] = useState<Record<string, boolean>>({});
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null); // "artist||title"
  const [lyricsTrack, setLyricsTrack] = useState<{ artist: string; title: string; lyrics: string | null } | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [activeMood, setActiveMood] = useState<string>("all");
  
  // Active lyrics line index (for line-by-line highlight)
  const [activeLyricLine, setActiveLyricLine] = useState<number>(0);
  // Waveform mini bar heights for audio player animation
  const [waveformHeights, setWaveformHeights] = useState<number[]>([6, 10, 5, 8, 4, 11, 7, 3, 9, 6]);

  // Audio Controller
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Pending fetches dedup map — prevents concurrent duplicate track API requests
  const pendingFetches = useRef<Map<string, Promise<void>>>(new Map());
  // Typewriter interval ref — prevents stale closure leaks on rapid re-renders
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Lyrics line advance interval ref
  const lyricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Waveform animation interval ref
  const waveformIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll to bottom of chat — via RAF to avoid layout thrash
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, streamingMessage]);

  // Cleanup audio + intervals on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
      if (lyricsIntervalRef.current) clearInterval(lyricsIntervalRef.current);
      if (waveformIntervalRef.current) clearInterval(waveformIntervalRef.current);
    };
  }, []);

  // Shuffle suggestion prompts on mount, when messages reset (new chat), or when activeMood changes
  useEffect(() => {
    if (messages.length === 0) {
      const promptsForMood = MOOD_PROMPTS[activeMood] || MOOD_PROMPTS.all;
      const shuffled = [...promptsForMood].sort(() => 0.5 - Math.random());
      setSuggestedPrompts(shuffled.slice(0, 4));
    }
  }, [messages, activeMood]);

  // Poll free trial status in background to keep tabs synced in real-time
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await getFreeTrialStatus();
        setCurrentTrialStatus(status);
      } catch (err) {
        console.error("Failed to sync free trial status", err);
      }
    }, 10000); // sync every 10 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Filter available providers based on trial or user keys — memoized
  const availableProviders = useMemo(() =>
    Object.entries(PROVIDERS_INFO).filter(([id]) => {
      if (id === "trial_mistral") return true;
      const status = apiKeysStatus.find((k) => k.provider === id);
      return status?.isActive && status?.hasKey;
    }),
  [apiKeysStatus]);

  // Group conversations by date (Today / Yesterday / Earlier) — memoized
  const groupedConversations = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const groups: { label: string; items: Conversation[] }[] = [
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "Earlier", items: [] },
    ];
    conversations.forEach((conv) => {
      const d = new Date(conv.updatedAt);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (day.getTime() >= today.getTime()) groups[0].items.push(conv);
      else if (day.getTime() >= yesterday.getTime()) groups[1].items.push(conv);
      else groups[2].items.push(conv);
    });
    return groups.filter((g) => g.items.length > 0);
  }, [conversations]);

  // Track parser helper — memoized
  const extractTracks = useCallback((text: string): ParsedTrack[] => {
    const results: ParsedTrack[] = [];
    const seen = new Set<string>();

    // Pattern 1: "Song" by Artist
    const pattern1 = /"([^"]+)"\s+by\s+([A-Za-z0-9\s,&'.\-]+)/gi;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      const title = match[1].trim();
      const artist = match[2].trim();
      const key = `${title.toLowerCase()}||${artist.toLowerCase()}`;
      if (!seen.has(key) && title.length > 1 && artist.length > 1) {
        seen.add(key);
        results.push({ title, artist });
      }
    }

    // Pattern 2: Artist - Song (on list lines starting with -, *, or digits)
    const lines = text.split("\n");
    const pattern2 = /^\s*[\-\*\d\.\s]*\s*([A-Za-z0-9\s,&'.\-]+)\s+-\s+["']?([^"'\n]+)["']?$/i;
    for (const line of lines) {
      const match2 = pattern2.exec(line);
      if (match2) {
        const artist = match2[1].trim();
        const title = match2[2].trim();
        const key = `${title.toLowerCase()}||${artist.toLowerCase()}`;
        if (!seen.has(key) && title.length > 1 && artist.length > 1) {
          seen.add(key);
          results.push({ title, artist });
        }
      }
    }

    return results;
  }, []);

  // Lazy-load details for a suggested track — deduplicated with pendingFetches
  const loadTrackData = useCallback(async (artist: string, title: string) => {
    const key = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    if (trackDetails[key] || loadingTrack[key] || pendingFetches.current.has(key)) return;

    const fetchPromise = (async () => {
      setLoadingTrack((prev) => ({ ...prev, [key]: true }));
      try {
        const data = await fetchTrackDetailsAction(artist, title);
        if (data) {
          setTrackDetails((prev) => ({
            ...prev,
            [key]: {
              coverArtUrl: data.coverArtUrl || "",
              previewUrl: data.previewUrl,
              lyrics: data.lyrics,
              album: data.album
            }
          }));
        }
      } catch (e) {
        console.error("Failed to load track data", e);
      } finally {
        setLoadingTrack((prev) => ({ ...prev, [key]: false }));
        pendingFetches.current.delete(key);
      }
    })();

    pendingFetches.current.set(key, fetchPromise);
    await fetchPromise;
  }, [trackDetails, loadingTrack]);

  // Automatically trigger track data preloading for all parsed assistant recommendations
  // Fix: include extractTracks and loadTrackData in deps to avoid stale closures
  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.role === "assistant") {
        const tracks = extractTracks(msg.content);
        tracks.forEach((track) => {
          loadTrackData(track.artist, track.title);
        });
      }
    });
  }, [messages, extractTracks, loadTrackData]);

  // Play audio snippet — also starts waveform animation
  const handlePlayPreview = async (artist: string, title: string, previewUrl: string | null) => {
    const trackId = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    
    if (playingTrackId === trackId) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingTrackId(null);
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current);
        waveformIntervalRef.current = null;
      }
      return;
    }

    if (!previewUrl) return;

    if (audioRef.current) audioRef.current.pause();

    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPlayingTrackId(trackId);

    // Animate waveform bars while playing
    if (waveformIntervalRef.current) clearInterval(waveformIntervalRef.current);
    waveformIntervalRef.current = setInterval(() => {
      setWaveformHeights(
        Array.from({ length: 10 }, () => Math.floor(Math.random() * 14) + 3)
      );
    }, 120);

    audio.play().catch((err) => {
      // Ignore AbortError caused by rapid play/pause toggle actions
      if (err.name !== "AbortError") {
        console.error("Audio playback error:", err);
        setPlayingTrackId(null);
      }
    });

    audio.onended = () => {
      setPlayingTrackId(null);
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current);
        waveformIntervalRef.current = null;
      }
    };
  };

  // Show lyrics modal — start line-advance timer and waveform animation
  const handleShowLyrics = (artist: string, title: string, lyrics: string | null) => {
    setLyricsTrack({ artist, title, lyrics });
    setActiveLyricLine(0);
    // Advance the active lyric line every ~2.5 seconds (simulated)
    if (lyricsIntervalRef.current) clearInterval(lyricsIntervalRef.current);
    if (lyrics) {
      const lineCount = lyrics.split("\n").filter(Boolean).length;
      lyricsIntervalRef.current = setInterval(() => {
        setActiveLyricLine((prev) => {
          if (prev >= lineCount - 1) {
            if (lyricsIntervalRef.current) clearInterval(lyricsIntervalRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 2500);
    }
  };

  // Close lyrics modal — clear timer
  const handleCloseLyrics = () => {
    setLyricsTrack(null);
    if (lyricsIntervalRef.current) {
      clearInterval(lyricsIntervalRef.current);
      lyricsIntervalRef.current = null;
    }
  };

  // Select a conversation from sidebar
  const handleSelectConversation = async (id: string) => {
    setActiveId(id);
    setStreamingMessage("");
    setSidebarOpen(false);
    router.push(`/?c=${id}`);
    try {
      const msgs = await getMessages(id);
      setMessages(msgs.map((m: any) => ({ ...m, createdAt: new Date(m.createdAt) })));
      // Set active provider to the model used in this conversation
      const conv = conversations.find(c => c.id === id);
      if (conv) {
        setSelectedProvider(conv.modelProvider);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create new conversation
  const handleNewChat = async () => {
    try {
      const newConv = await createConversation("New Conversation", selectedProvider);
      setConversations((prev) => [
        { 
          id: newConv.id,
          title: newConv.title,
          modelProvider: newConv.modelProvider,
          createdAt: new Date(newConv.createdAt),
          updatedAt: new Date(newConv.updatedAt)
        },
        ...prev
      ]);
      setActiveId(newConv.id);
      setMessages([]);
      setStreamingMessage("");
      router.push(`/?c=${newConv.id}`);
    } catch (err) {
      console.error("Failed to create conversation", err);
    }
  };

  // Submit User Message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    let targetConvId = activeId;
    
    // Create new conversation if none exists
    if (!targetConvId) {
      try {
        const newConv = await createConversation("New Conversation", selectedProvider);
        setConversations((prev) => [
          { ...newConv, createdAt: new Date(newConv.createdAt), updatedAt: new Date(newConv.updatedAt) },
          ...prev
        ]);
        targetConvId = newConv.id;
        setActiveId(newConv.id);
      } catch (err) {
        console.error("Failed to create conversation", err);
        return;
      }
    }

    if (!targetConvId) return;

    const userMessageContent = input.trim();
    setInput("");
    setIsSending(true);
    setStreamingMessage("");

    // optimistic user message append
    const tempUserMsg: Message = {
      id: Math.random().toString(),
      role: "user",
      content: userMessageContent,
      createdAt: new Date()
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    const isTrial = selectedProvider === "trial_mistral";

    try {
      if (isTrial) {
        setCurrentTrialStatus((prev) => ({ ...prev, used: Math.min(prev.limit, prev.used + 1) }));
      }

      const responseStream = await sendMessage(targetConvId, userMessageContent, selectedProvider);
      
      let targetText = "";
      let displayedText = "";
      
      // Typewriter interval — stored in ref to prevent stale closure leaks
      typewriterIntervalRef.current = setInterval(() => {
        if (displayedText.length < targetText.length) {
          const charsLeft = targetText.length - displayedText.length;
          // Speed up typing step dynamically if we fall far behind the stream buffer
          const step = charsLeft > 80 ? 6 : charsLeft > 20 ? 2 : 1;
          displayedText += targetText.substring(displayedText.length, displayedText.length + step);
          setStreamingMessage(displayedText);
        }
      }, 10); // Fluid sweep runs every 10ms

      try {
        for await (const chunk of readStreamableValue(responseStream.output)) {
          targetText += chunk;
        }
        
        // Wait for typewriter to completely catch up before finishing
        while (displayedText.length < targetText.length) {
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      } finally {
        if (typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }
      }

      // Re-fetch messages and conversations to get updated database state (including title renaming)
      const freshMsgs = await getMessages(targetConvId);
      setMessages(freshMsgs.map((m: any) => ({ ...m, createdAt: new Date(m.createdAt) })));
      
      const freshConvs = await getConversations();
      setConversations(freshConvs.map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt)
      })));

      // Sync free trial count
      const updatedTrial = await getFreeTrialStatus();
      setCurrentTrialStatus(updatedTrial);
      
    } catch (err: any) {
      console.error("Error sending message:", err);
      if (isTrial) {
        setCurrentTrialStatus((prev) => ({ ...prev, used: Math.max(0, prev.used - 1) }));
      }
      if (err.message === "TRIAL_EXCEEDED") {
        alert("You have reached the free trial limit of 10 messages. Please go to Settings and enter your own API key to continue.");
      } else {
        alert(err.message || "An error occurred while sending your message.");
      }
      // Remove the optimistic user message if generation crashed immediately
      setMessages((prev) => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setIsSending(false);
      setStreamingMessage("");
    }
  };

  // Delete Chat
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this conversation?")) return;

    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(undefined);
        setMessages([]);
        setStreamingMessage("");
        router.push("/");
      }
    } catch (e) {
      console.error("Failed to delete conversation", e);
    }
  };

  // Start Inline Rename
  const startRename = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(title);
  };

  // Save Inline Rename
  const saveRename = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;

    try {
      await renameConversation(id, editTitle.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: editTitle.trim() } : c))
      );
      setEditingId(null);
    } catch (e) {
      console.error("Failed to rename conversation", e);
    }
  };

  // Keyboard shortcut to submit or close rename
  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  const isTrialExceeded = selectedProvider === "trial_mistral" && currentTrialStatus.used >= currentTrialStatus.limit;

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden relative" style={{ background: "#08080a" }}>
      
      {/* ─── Sidebar ───────────────────────────────────────────────── */}
      <div 
        className={`absolute md:relative inset-y-0 left-0 z-30 transition-all duration-300 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          sidebarCollapsed ? "md:-translate-x-full md:absolute md:w-0 md:invisible" : "md:translate-x-0 md:w-72 md:visible"
        } flex flex-col justify-between`}
        style={{
          background: "linear-gradient(180deg, #111116 0%, #0e0e12 100%)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          boxShadow: "2px 0 24px rgba(0,0,0,0.5), inset -1px 0 0 rgba(255,255,255,0.03)",
        }}
      >
        <div className="flex flex-col h-full overflow-hidden">

          {/* Sidebar Header — New Chat + Collapse */}
          <div className="p-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <button
              onClick={handleNewChat}
              className="flex-1 btn-primary-tactile text-white rounded-xl py-2.5 px-3 flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              <span className="truncate">New Chat</span>
            </button>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-2.5 rounded-xl text-zinc-500 hover:text-zinc-300 transition-colors hidden md:flex items-center justify-center btn-tactile"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Recent Chats List — grouped by date */}
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {conversations.length === 0 ? (
              <div className="text-xs text-zinc-600 italic p-4 text-center">
                No sessions yet. Start chatting!
              </div>
            ) : (
              groupedConversations.map((group) => (
                <div key={group.label}>
                  <div className="sidebar-group-label">{group.label}</div>
                  <div className="space-y-0.5">
                    {group.items.map((conv) => {
                      const isActive = activeId === conv.id;
                      const isEditing = editingId === conv.id;

                      return (
                        <div
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          className="group relative flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                          style={isActive ? {
                            background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(109,40,217,0.06) 100%)",
                            border: "1px solid rgba(139,92,246,0.18)",
                            boxShadow: "0 0 12px rgba(139,92,246,0.08), inset 0 1px 0 rgba(139,92,246,0.1)",
                          } : {
                            border: "1px solid transparent",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                              (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.05)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              (e.currentTarget as HTMLDivElement).style.background = "";
                              (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
                            }
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-8">
                            {/* Wax circle when active */}
                            <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                              isActive
                                ? "bg-violet-600/20"
                                : "bg-zinc-800/60"
                            }`}
                              style={isActive ? {
                                boxShadow: "0 0 8px rgba(139,92,246,0.3), inset 0 1px 0 rgba(139,92,246,0.2)",
                              } : {}}
                            >
                              <MessageSquare className={`h-3 w-3 ${ isActive ? "text-violet-400" : "text-zinc-600"}`} />
                            </div>
                            
                            {isEditing ? (
                              <form 
                                onSubmit={(e) => saveRename(conv.id, e)} 
                                onClick={(e) => e.stopPropagation()}
                                className="w-full"
                              >
                                <input
                                  autoFocus
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onBlur={(e) => saveRename(conv.id, e as any)}
                                  onKeyDown={(e) => handleRenameKeyDown(e, conv.id)}
                                  className="bg-zinc-950 border border-violet-500/40 rounded-lg px-2 py-0.5 text-xs text-zinc-100 focus:outline-none w-full"
                                  style={{ boxShadow: "0 0 8px rgba(139,92,246,0.2)" }}
                                />
                              </form>
                            ) : (
                              <span className={`text-xs font-medium truncate ${ isActive ? "text-zinc-100" : "text-zinc-400"}`}>
                                {conv.title}
                              </span>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                              <button
                                onClick={(e) => startRename(conv.id, conv.title, e)}
                                className="p-1 hover:text-zinc-200 text-zinc-600 transition-colors rounded"
                                title="Rename"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteChat(conv.id, e)}
                                className="p-1 hover:text-red-400 text-zinc-600 transition-colors rounded"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar Footer — Trial Usage */}
        <div className="p-4 space-y-3" style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(0,0,0,0.3)",
        }}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-600">Free Trial</span>
            <span className="font-semibold tabular-nums" style={{
              color: currentTrialStatus.used >= currentTrialStatus.limit ? "#f87171" : "#a78bfa"
            }}>
              {currentTrialStatus.used} / {currentTrialStatus.limit}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{
            background: "#0f0f12",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.8)",
          }}>
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${Math.min(100, (currentTrialStatus.used / currentTrialStatus.limit) * 100)}%`,
                background: currentTrialStatus.used >= currentTrialStatus.limit
                  ? "linear-gradient(90deg, #dc2626, #ef4444)"
                  : "linear-gradient(90deg, #7c3aed, #8b5cf6, #a78bfa)",
                boxShadow: currentTrialStatus.used < currentTrialStatus.limit
                  ? "0 0 8px rgba(139,92,246,0.6)" : "0 0 8px rgba(239,68,68,0.5)",
              }}
            />
          </div>
          <a
            href="/settings"
            className="flex items-center justify-between text-xs font-semibold transition-colors"
            style={{ color: "#7c3aed" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#a78bfa")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#7c3aed")}
          >
            <span>Manage API Keys</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* ─── Main Chat Workspace ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-between h-full overflow-hidden" style={{ background: "#09090c" }}>
        
        {/* Mobile Header */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 z-20"
          style={{
            background: "linear-gradient(180deg, #141418 0%, #111114 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-bold tracking-tight flex items-center gap-2"
            style={{ background: "linear-gradient(90deg, #a78bfa, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Plugnote Studio
          </span>
          <a href="/settings" className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Settings className="h-5 w-5" />
          </a>
        </div>

        {/* Desktop Chat Header */}
        <div className="hidden md:flex items-center justify-between px-6 py-3.5"
          style={{
            background: "linear-gradient(180deg, #111116 0%, #0d0d10 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.3)",
          }}>
          <div className="flex items-center gap-3">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 transition-colors btn-tactile"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <div>
              <h1 className="text-sm font-bold text-zinc-200 tracking-tight">
                {activeId ? conversations.find(c => c.id === activeId)?.title : "New Music Session"}
              </h1>
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600 mt-0.5">
                {PROVIDERS_INFO[selectedProvider as ProviderId]?.name || selectedProvider}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Model selector */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{
              background: "#0f0f12",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
            }}>
              <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Model</span>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="bg-transparent border-none text-xs text-violet-400 font-semibold focus:outline-none cursor-pointer"
              >
                {availableProviders.map(([id, info]) => (
                  <option key={id} value={id} className="bg-zinc-900 text-zinc-300">
                    {info.name}
                  </option>
                ))}
              </select>
            </div>
            <a
              href="/settings"
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 transition-colors btn-tactile"
              title="API Key Settings"
            >
              <Settings className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* ─── Messages Viewport ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-5">
          
          {/* ─── Welcome / Empty State ──────────────────────────── */}
          {messages.length === 0 && !streamingMessage && (
            <div className="max-w-2xl mx-auto text-center py-10 md:py-16 space-y-8 animate-slide-in-up">

              {/* Vinyl Record Illustration */}
              <div className="relative inline-flex items-center justify-center">
                {/* Outer glow */}
                <div className="absolute inset-0 rounded-full" style={{
                  background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
                  filter: "blur(20px)",
                  transform: "scale(1.5)",
                }} />
                {/* Vinyl disc */}
                <div className="relative h-28 w-28 rounded-full vinyl-disc"
                  style={{ animation: "record-spin 16s linear infinite" }}>
                  {/* Grooves (concentric rings) */}
                  {[35, 44, 53, 62].map(r => (
                    <div key={r} className="absolute rounded-full" style={{
                      inset: `${r}%`,
                      border: "1px solid rgba(255,255,255,0.04)",
                    }} />
                  ))}
                  {/* Center label */}
                  <div className="absolute inset-[30%] rounded-full vinyl-label flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-violet-300" />
                  </div>
                  {/* Chrome rim */}
                  <div className="absolute inset-0 rounded-full" style={{
                    boxShadow: "inset 0 2px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.8), 0 8px 40px rgba(0,0,0,0.8)",
                  }} />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight"
                  style={{ background: "linear-gradient(135deg, #a78bfa 0%, #f472b6 50%, #38bdf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Your Personal Music Expert
                </h1>
                <p className="text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Discover tracks, explore genres, get playlist ideas, or dive into music history.
                </p>
              </div>

              {/* Mood Selectors */}
              <div className="space-y-3">
                <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">Choose Your Vibe</div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {MOODS.map((mood) => {
                    const isSelected = activeMood === mood.id;
                    return (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => setActiveMood(mood.id)}
                        className="px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all"
                        style={isSelected ? {
                          background: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
                          border: "1px solid rgba(139,92,246,0.5)",
                          color: "white",
                          boxShadow: "0 0 12px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.3)",
                          transform: "scale(1.05)",
                        } : {
                          background: "linear-gradient(180deg, #1e1e26 0%, #17171e 100%)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          color: "#71717a",
                          boxShadow: "0 1px 0 rgba(255,255,255,0.05), 0 2px 6px rgba(0,0,0,0.3)",
                        }}
                      >
                        <span>{mood.emoji}</span>
                        <span>{mood.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prompt Cards — brushed-metal chrome top strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(prompt)}
                    className="group text-left rounded-2xl overflow-hidden transition-all"
                    style={{
                      background: "linear-gradient(160deg, #16161e 0%, #111115 60%, #0e0e13 100%)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      boxShadow: "0 3px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.3)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.07)";
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 3px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)";
                      (e.currentTarget as HTMLButtonElement).style.transform = "";
                    }}
                  >
                    {/* Chrome accent strip with shimmer */}
                    <div className="prompt-card-metal-strip" />
                    {/* Card body with subtle felt texture */}
                    <div className="p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Star className="h-2.5 w-2.5 text-violet-500/80" />
                        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-violet-500/70">Prompt Idea</span>
                      </div>
                      <span className="text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors">{prompt}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Message List ──────────────────────────────────── */}
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const suggestedTracks = !isUser ? extractTracks(msg.content) : [];

            return (
              <div
                key={msg.id}
                className={`flex gap-3 md:gap-4 max-w-3xl message-appear ${
                  isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                {/* Avatar */}
                {isUser ? (
                  <div className="h-8 w-8 md:h-9 md:w-9 rounded-xl shrink-0 flex items-center justify-center font-bold text-[11px]"
                    style={{
                      background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
                      boxShadow: "0 2px 8px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}>
                    ME
                  </div>
                ) : (
                  <div className="h-8 w-8 md:h-9 md:w-9 rounded-xl shrink-0 flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #1a1a24, #141420)",
                      border: "1px solid rgba(139,92,246,0.2)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}>
                    <Sparkles className="h-4 w-4 text-violet-400" />
                  </div>
                )}

                <div className="space-y-3 max-w-[calc(100%-48px)]">
                  {/* Message Bubble */}
                  <div style={isUser ? {
                    background: "linear-gradient(135deg, rgba(109,40,217,0.15) 0%, rgba(139,92,246,0.08) 100%)",
                    border: "1px solid rgba(139,92,246,0.2)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(139,92,246,0.1)",
                    borderRadius: "16px",
                    padding: "14px 16px",
                    fontSize: "14px",
                    lineHeight: "1.7",
                    color: "#e4e4e7",
                  } : {
                    background: "linear-gradient(180deg, #161620 0%, #111118 100%)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.3)",
                    borderRadius: "16px",
                    padding: "14px 16px",
                    fontSize: "14px",
                    lineHeight: "1.7",
                  }}>
                    {/* Chrome top strip for AI messages */}
                    {!isUser && (
                      <div className="-mx-4 -mt-3.5 mb-3 px-4 py-1.5 rounded-t-2xl" style={{
                        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}>
                        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-600">Plugnote AI</span>
                      </div>
                    )}
                    {isUser ? (
                      <span className="whitespace-pre-line">{msg.content}</span>
                    ) : (
                      <ReactMarkdown className="markdown-content">
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>

                  {/* Track Cards */}
                  {suggestedTracks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <div className="flex gap-0.5 items-end h-4">
                          <span className="eq-bar" style={{ height: "10px" }} />
                          <span className="eq-bar" style={{ height: "14px" }} />
                          <span className="eq-bar" style={{ height: "8px" }} />
                        </div>
                        <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-violet-500">Discovered Tracks</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {suggestedTracks.map((track, i) => {
                          const trackKey = `${track.artist.toLowerCase()}||${track.title.toLowerCase()}`;
                          const details = trackDetails[trackKey];
                          const isLoading = loadingTrack[trackKey] || false;
                          const isPlaying = playingTrackId === trackKey;

                          return (
                            <div 
                              key={i}
                              className="track-card-sleeve rounded-2xl p-3 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {/* Album Art — larger, record sleeve style */}
                                <div className="relative h-14 w-14 rounded-xl shrink-0 overflow-visible">
                                  {/* Sleeve square */}
                                  <div className="absolute inset-0 rounded-xl overflow-hidden z-10" style={{
                                    background: "#0a0a0d",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
                                  }}>
                                    {details?.coverArtUrl ? (
                                      <img 
                                        src={details.coverArtUrl} 
                                        alt={track.title} 
                                        className="object-cover h-full w-full"
                                      />
                                    ) : (
                                      <div className="h-full w-full flex items-center justify-center">
                                        <Music2 className="h-5 w-5 text-zinc-700" />
                                      </div>
                                    )}
                                    {isLoading && (
                                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                        <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                      </div>
                                    )}
                                  </div>
                                  {/* Vinyl record peeking out to the right */}
                                  <div className="vinyl-peek" style={{ top: "50%", transform: "translateY(-50%)" }} />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-zinc-200 truncate leading-tight">{track.title}</div>
                                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{track.artist}</div>
                                  {details?.album && (
                                    <div className="text-[9px] text-zinc-700 truncate mt-1 font-mono uppercase tracking-wide">{details.album}</div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {details?.previewUrl && (
                                  <button
                                    onClick={() => handlePlayPreview(track.artist, track.title, details.previewUrl)}
                                    className="p-2 rounded-xl transition-all"
                                    style={isPlaying ? {
                                      background: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
                                      border: "1px solid rgba(139,92,246,0.5)",
                                      color: "white",
                                      boxShadow: "0 0 14px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
                                    } : {
                                      background: "linear-gradient(180deg, #1a1a24 0%, #111118 100%)",
                                      border: "1px solid rgba(255,255,255,0.08)",
                                      color: "#71717a",
                                      boxShadow: "0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                                    }}
                                    title={isPlaying ? "Pause" : "Play 30s preview"}
                                  >
                                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                                {details && (
                                  <button
                                    onClick={() => handleShowLyrics(track.artist, track.title, details.lyrics)}
                                    className="p-2 rounded-xl transition-all"
                                    style={{
                                      background: "linear-gradient(180deg, #1a1a24 0%, #111118 100%)",
                                      border: "1px solid rgba(255,255,255,0.08)",
                                      color: "#71717a",
                                      boxShadow: "0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.currentTarget as HTMLButtonElement).style.color = "#d4d4d8";
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.2)";
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.currentTarget as HTMLButtonElement).style.color = "#71717a";
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                                    }}
                                    title="View lyrics"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* ─── Thinking Bubble ──────────────────────────────── */}
          {isSending && !streamingMessage && (
            <div className="flex gap-3 md:gap-4 max-w-3xl mr-auto animate-slide-in-up">
              <div className="h-8 w-8 md:h-9 md:w-9 rounded-xl shrink-0 flex items-center justify-center" style={{
                background: "linear-gradient(135deg, #1a1a24, #141420)",
                border: "1px solid rgba(139,92,246,0.2)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}>
                {/* Equalizer animation */}
                <div className="flex gap-0.5 items-end h-5">
                  <span className="eq-bar" style={{ height: "8px" }} />
                  <span className="eq-bar" style={{ height: "12px" }} />
                  <span className="eq-bar" style={{ height: "6px" }} />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 px-5 h-11 rounded-2xl" style={{
                  background: "linear-gradient(180deg, #161620 0%, #111118 100%)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Streaming Bubble ─────────────────────────────── */}
          {streamingMessage && (
            <div className="flex gap-3 md:gap-4 max-w-3xl mr-auto">
              <div className="h-8 w-8 md:h-9 md:w-9 rounded-xl shrink-0 flex items-center justify-center" style={{
                background: "linear-gradient(135deg, #1a1a24, #141420)",
                border: "1px solid rgba(139,92,246,0.25)",
                boxShadow: "0 0 12px rgba(139,92,246,0.15), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}>
                <div className="flex gap-0.5 items-end h-5">
                  <span className="eq-bar" style={{ height: "8px" }} />
                  <span className="eq-bar" style={{ height: "12px" }} />
                  <span className="eq-bar" style={{ height: "6px" }} />
                </div>
              </div>
              <div className="max-w-[calc(100%-48px)]">
                <div className="rounded-2xl" style={{
                  background: "linear-gradient(180deg, #161620 0%, #111118 100%)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.3)",
                  padding: "14px 16px",
                }}>
                  <div className="-mx-4 -mt-3.5 mb-3 px-4 py-1.5 rounded-t-2xl" style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-600">Plugnote AI</span>
                  </div>
                  <div className="markdown-content typewriter-cursor">
                    <ReactMarkdown>{streamingMessage}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ─── Input Bar ──────────────────────────────────────── */}
        <div className="p-4 md:p-5" style={{
          background: "linear-gradient(180deg, #0d0d10 0%, #0a0a0e 100%)",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}>
          <form onSubmit={handleSend} className="max-w-3xl mx-auto space-y-3">
            
            {/* Trial exceeded banner */}
            {isTrialExceeded ? (
              <div className="p-3 rounded-xl flex items-start gap-2.5 text-xs"
                style={{
                  background: "rgba(220,38,38,0.08)",
                  border: "1px solid rgba(220,38,38,0.2)",
                  color: "#f87171",
                }}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Trial limit reached.</span> Enter your API key in{" "}
                  <a href="/settings" className="underline font-bold" style={{ color: "#a78bfa" }}>Settings</a>{" "}
                  to continue.
                </div>
              </div>
            ) : (
              selectedProvider === "trial_mistral" && (
                <div className="flex items-center justify-between text-[10px] font-mono px-1" style={{ color: "#52525b" }}>
                  <span>Trial · Mistral Large</span>
                  <span>{Math.max(0, 10 - currentTrialStatus.used)} queries remaining</span>
                </div>
              )
            )}

            {/* Input field + keyboard shortcut hint */}
            <div className="relative flex items-center rounded-2xl input-focus-ring" style={{
              background: "#0e0e12",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.03)",
            }}>
              <input
                disabled={isSending || isTrialExceeded}
                type="text"
                placeholder={isTrialExceeded ? "Trial exhausted — add your API key" : "Ask about tracks, albums, artists, moods..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-transparent pl-5 pr-20 py-4 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none disabled:opacity-40 font-medium"
              />
              
              {/* Keyboard shortcut hint */}
              {!input.trim() && !isTrialExceeded && (
                <span className="absolute right-4 text-[10px] font-mono text-zinc-700 pointer-events-none select-none hidden sm:block">
                  ↵ send
                </span>
              )}
              
              <div className="absolute right-2.5">
                {input.trim() && (
                  <button
                    disabled={isSending || isTrialExceeded}
                    type="submit"
                    className="btn-primary-tactile p-2.5 rounded-xl disabled:opacity-40"
                    title="Send (Enter)"
                  >
                    <Send className="h-4 w-4 text-white" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ─── Floating Audio Player ───────────────────────────────── */}
      {playingTrackId && (
        <div className="fixed bottom-6 right-6 z-50 animate-scale-in" style={{
          background: "linear-gradient(160deg, #141420 0%, #0f0f18 60%, #0c0c14 100%)",
          border: "1px solid rgba(139,92,246,0.3)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.12), 0 0 48px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
          borderRadius: "22px",
          padding: "14px 16px",
          width: "300px",
        }}>
          {/* Top chrome strip */}
          <div className="-mx-4 -mt-3.5 mb-3 px-4 py-1.5 rounded-t-[20px] flex items-center justify-between" style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-violet-400">Now Playing</span>
            <span className="glow-dot" />
          </div>

          <div className="flex items-center gap-3">
            {/* Spinning vinyl album art */}
            <div className="relative h-13 w-13 shrink-0" style={{ width: 52, height: 52 }}>
              <div className="absolute inset-0 rounded-full" style={{
                animation: "record-spin 4s linear infinite",
                background: trackDetails[playingTrackId]?.coverArtUrl
                  ? `url(${trackDetails[playingTrackId].coverArtUrl}) center/cover`
                  : "radial-gradient(circle, #2a1a3e, #1a0a2e)",
                boxShadow: "0 0 0 2px rgba(139,92,246,0.4), 0 0 0 4px rgba(139,92,246,0.1), 0 4px 20px rgba(0,0,0,0.7)",
              }} />
              {/* Center hole */}
              <div className="absolute inset-[38%] rounded-full" style={{ background: "#08080a", border: "1px solid rgba(255,255,255,0.12)" }} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-zinc-100 truncate leading-tight">
                {playingTrackId.split("||")[1].replace(/\b\w/g, c => c.toUpperCase())}
              </div>
              <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                {playingTrackId.split("||")[0].replace(/\b\w/g, c => c.toUpperCase())}
              </div>
              {/* Animated waveform bars (live heights from state) */}
              <div className="waveform-bar-container mt-2">
                {waveformHeights.map((h, i) => (
                  <div key={i} className="waveform-mini-bar" style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                if (audioRef.current) audioRef.current.pause();
                setPlayingTrackId(null);
                if (waveformIntervalRef.current) {
                  clearInterval(waveformIntervalRef.current);
                  waveformIntervalRef.current = null;
                }
              }}
              className="p-2 rounded-xl flex-shrink-0 transition-all"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
                boxShadow: "0 0 16px rgba(139,92,246,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
                color: "white",
              }}
              title="Stop"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Lyrics Modal — Stage Backdrop with Line-by-Line Highlight ── */}
      {lyricsTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
          background: "rgba(0,0,0,0.9)",
          backdropFilter: "blur(20px)",
        }}
          onClick={handleCloseLyrics}
        >
          {/* Spotlight radial glow behind modal */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139,92,246,0.08) 0%, transparent 70%)",
          }} />

          <div className="w-full max-w-lg max-h-[82vh] flex flex-col animate-scale-in relative"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(180deg, #161622 0%, #0f0f1a 40%, #0a0a12 100%)",
              border: "1px solid rgba(139,92,246,0.25)",
              borderRadius: "28px",
              boxShadow: "0 48px 120px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04), 0 0 60px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}>

            {/* Modal chrome header */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)",
              borderRadius: "28px 28px 0 0",
            }}>
              <div className="min-w-0">
                <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-violet-400 mb-1">Song Lyrics</div>
                <h2 className="text-base font-bold text-zinc-100 truncate" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                  {lyricsTrack.title}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5 italic" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                  {lyricsTrack.artist}
                </p>
              </div>
              <button
                onClick={handleCloseLyrics}
                className="p-2 rounded-xl text-zinc-600 hover:text-zinc-300 transition-colors ml-4 shrink-0"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Lyrics scroll area — line-by-line serif with active highlight */}
            <div className="flex-1 overflow-y-auto py-4 px-3" style={{
              scrollbarWidth: "thin",
            }}>
              {lyricsTrack.lyrics ? (
                <div className="space-y-0.5">
                  {lyricsTrack.lyrics.split("\n").filter(Boolean).map((line, idx) => (
                    <p
                      key={idx}
                      className={`lyrics-line ${
                        idx === activeLyricLine ? "lyrics-line-active" : ""
                      }`}
                      onClick={() => setActiveLyricLine(idx)}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="text-zinc-600 italic text-center py-12 flex flex-col items-center gap-3">
                  <HelpCircle className="h-8 w-8 text-zinc-700" />
                  <span style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>No lyrics found in the LRCLib database for this song.</span>
                </div>
              )}
            </div>
            
            {/* Modal footer */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{
              borderTop: "1px solid rgba(255,255,255,0.05)",
              borderRadius: "0 0 28px 28px",
            }}>
              <span className="text-[10px] font-mono text-zinc-700">
                {lyricsTrack.lyrics ? `${lyricsTrack.lyrics.split("\n").filter(Boolean).length} lines` : ""}
              </span>
              <button
                onClick={handleCloseLyrics}
                className="px-5 py-2 text-xs font-semibold rounded-xl transition-all btn-tactile text-zinc-400 hover:text-zinc-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

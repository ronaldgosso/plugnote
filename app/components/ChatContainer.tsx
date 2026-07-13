"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, MessageSquare, Trash2, Edit2, Send, Sparkles, Settings, Play, Pause,
  FileText, Music2, AlertTriangle, Menu, X, ArrowUpRight,
  HelpCircle, Star, PanelLeftOpen, PanelLeftClose, ExternalLink
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { readStreamableValue } from "ai/rsc";
import { useRouter } from "next/navigation";
import {
  sendMessage, getMessages, createConversation, deleteConversation,
  renameConversation, getConversations, getFreeTrialStatus
} from "@/app/actions/chat";
import { fetchTrackDetailsAction } from "@/app/actions/music";
import { reactToMessage } from "@/app/actions/reactions";
import { PROVIDERS_INFO, ProviderId } from "@/lib/ai";
import { createVisualizer, drawVisualizer, type Visualizer } from "@/lib/visualizer";

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
  reaction?: string | null;
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

// Parsed LRC timestamp line for karaoke sync
interface LrcLine {
  time: number; // milliseconds from track start
  text: string;
}

// Track details cache to avoid redundant API queries
interface TrackCacheItem {
  coverArtUrl: string;
  previewUrl: string | null;
  lyrics: string | null;
  syncedLyrics: string | null;
  album: string;
  lrcLines?: LrcLine[] | null;
}

// Emoji reaction definitions
const REACTIONS = [
  { emoji: "👍", id: "like",    label: "Like" },
  { emoji: "🔥", id: "fire",    label: "Fire" },
  { emoji: "💡", id: "insight", label: "Insightful" },
  { emoji: "❤️", id: "love",   label: "Love" },
] as const;

// Mood-reactive theme palette
const MOOD_THEMES: Record<string, { primary: string; secondary: string; ring: string; accent: string; bg: string }> = {
  all:    { primary: "#8b5cf6", secondary: "#ec4899", ring: "#d8b4fe", accent: "#06b6d4", bg: "#08080a" },
  chill:  { primary: "#f59e0b", secondary: "#fb923c", ring: "#fde68a", accent: "#fbbf24", bg: "#0f0a00" },
  focus:  { primary: "#06b6d4", secondary: "#0ea5e9", ring: "#67e8f9", accent: "#38bdf8", bg: "#00050f" },
  energy: { primary: "#84cc16", secondary: "#facc15", ring: "#bef264", accent: "#a3e635", bg: "#020800" },
  sad:    { primary: "#6366f1", secondary: "#818cf8", ring: "#a5b4fc", accent: "#6366f1", bg: "#050508" },
  dreamy: { primary: "#ec4899", secondary: "#f472b6", ring: "#fbcfe8", accent: "#e879f9", bg: "#080410" },
};

/** Applies a mood theme by mutating CSS custom properties on :root */
function applyMoodTheme(moodId: string) {
  const theme = MOOD_THEMES[moodId] ?? MOOD_THEMES.all;
  const root = document.documentElement;
  root.style.setProperty("--primary",   theme.primary);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--ring",      theme.ring);
  root.style.setProperty("--accent",    theme.accent);
  root.style.setProperty("--background", theme.bg);
}

/** Parses raw LRC-format synced lyrics into timed lines (milliseconds) */
function parseLrc(raw: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const ms = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000
             + parseInt(m[3].padEnd(3, "0"), 10);
    const text = m[4].trim();
    if (text) lines.push({ time: ms, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Generates a Spotify search deep-link URL */
const getSpotifyUrl = (artist: string, title: string) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`;

/** Generates a YouTube Music search URL */
const getYouTubeUrl = (artist: string, title: string) =>
  `https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`;

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
  const [lyricsTrack, setLyricsTrack] = useState<{
    artist: string;
    title: string;
    lyrics: string | null;
    lrcLines: LrcLine[] | null;
  } | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [activeMood, setActiveMood] = useState<string>("all");
  // Emoji reactions: messageId → reactionId
  const [messageReactions, setMessageReactions] = useState<Record<string, string | null>>(() =>
    initialMessages.reduce((acc, m) => {
      if (m.reaction) acc[m.id] = m.reaction;
      return acc;
    }, {} as Record<string, string | null>)
  );

  // Active lyrics line index (for karaoke highlight)
  const [activeLyricLine, setActiveLyricLine] = useState<number>(0);

  // Refs — audio, scroll anchor, fetch dedup, interval/raf handles
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingFetches = useRef<Map<string, Promise<void>>>(new Map());
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  // Web Audio visualizer
  const visualizerRef  = useRef<Visualizer | null>(null);
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const rafRef         = useRef<number | null>(null);

  const canvasCallbackRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (canvas && visualizerRef.current) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      drawVisualizer(visualizerRef.current.analyser, canvas, rafRef);
    }
  }, []);
  // LRC timeupdate handler ref (stable reference for removeEventListener)
  const timeUpdateHandlerRef = useRef<(() => void) | null>(null);
  // LRC lines ref (avoids stale closure in the timeupdate handler)
  const lrcLinesRef = useRef<LrcLine[] | null>(null);

  // Auto-scroll to bottom of chat — via RAF to avoid layout thrash
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, streamingMessage]);

  // Cleanup audio + visualizer + intervals on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
      if (lyricsIntervalRef.current) clearInterval(lyricsIntervalRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (visualizerRef.current) visualizerRef.current.cleanup();
      if (audioRef.current && timeUpdateHandlerRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
      }
    };
  }, []);

  // Auto-scroll the active lyric line into view inside the lyrics modal
  useEffect(() => {
    if (!lyricsScrollRef.current) return;
    const activeEl = lyricsScrollRef.current.querySelector(".lyrics-line-active");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLyricLine]);

  // Sync message reactions when messages change (e.g. conversation switches)
  useEffect(() => {
    const nextReactions: Record<string, string | null> = {};
    messages.forEach((m) => {
      if (m.reaction) {
        nextReactions[m.id] = m.reaction;
      }
    });
    setMessageReactions(nextReactions);
  }, [messages]);

  // Shuffle suggestion prompts on mount, when messages reset (new chat), or when activeMood changes
  useEffect(() => {
    if (messages.length === 0) {
      const promptsForMood = MOOD_PROMPTS[activeMood] || MOOD_PROMPTS.all;
      const shuffled = [...promptsForMood].sort(() => 0.5 - Math.random());
      setSuggestedPrompts(shuffled.slice(0, 4));
    }
    // Apply the mood theme when activeMood changes (client-only)
    if (typeof window !== "undefined") applyMoodTheme(activeMood);
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

    // Pattern 1: "Song" by Artist (supporting markdown stars and accented characters)
    const pattern1 = /"([^"]+)"\s*(?:\*\*)?\s*by\s*(?:\*\*)?\s*([A-Za-z0-9\s,&'.\-\(\)\u00C0-\u017F\u0180-\u024F]+)/gi;
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

    // Pattern 2: Artist - Song (on list lines starting with -, *, or digits, supporting markdown stars and accented characters)
    const lines = text.split("\n");
    const pattern2 = /^\s*[\-\*\d\.\s]*\s*(?:\*\*)?\s*([A-Za-z0-9\s,&'.\-\(\)\u00C0-\u017F\u0180-\u024F]+)\s*-\s*(?:\*\*)?\s*["']?([^"'\n*]+)["']?\s*(?:\*\*)?$/i;
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
              coverArtUrl:   data.coverArtUrl || "",
              previewUrl:    data.previewUrl,
              lyrics:        data.lyrics,
              syncedLyrics:  data.syncedLyrics,
              album:         data.album,
              lrcLines:      data.lrcLines || null,
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

  // ── Stop helper — tears down audio + visualizer cleanly
  const stopAudio = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (visualizerRef.current) { visualizerRef.current.cleanup(); visualizerRef.current = null; }
    setPlayingTrackId(null);
  }, []);

  // Play audio snippet — starts Web Audio visualizer
  const handlePlayPreview = async (artist: string, title: string, previewUrl: string | null) => {
    const trackId = `${artist.toLowerCase()}||${title.toLowerCase()}`;

    // Toggle off if already playing this track
    if (playingTrackId === trackId) {
      stopAudio();
      return;
    }

    if (!previewUrl) return;

    // Tear down previous audio + visualizer
    stopAudio();

    const proxiedUrl = `/api/audio-proxy?url=${encodeURIComponent(previewUrl)}`;
    const audio = new Audio(proxiedUrl);
    audio.crossOrigin = "anonymous"; // required for AudioContext CORS
    audioRef.current = audio;
    setPlayingTrackId(trackId);

    // Start Web Audio visualizer after user gesture (play button click)
    const viz = createVisualizer(audio);
    visualizerRef.current = viz;
    if (viz && canvasRef.current) {
      drawVisualizer(viz.analyser, canvasRef.current, rafRef);
    }

    audio.play().catch((err) => {
      if (err.name !== "AbortError") {
        console.error("Audio playback error:", err);
        stopAudio();
      }
    });

    audio.onended = () => stopAudio();
  };

  // Show lyrics modal — real LRC sync when syncedLyrics available, 2.5s timer as fallback
  const handleShowLyrics = (
    artist: string,
    title: string,
    lyrics: string | null,
    syncedLyrics: string | null,
    cachedLrcLines?: LrcLine[] | null
  ) => {
    // Clear any previous listeners / intervals
    if (lyricsIntervalRef.current) { clearInterval(lyricsIntervalRef.current); lyricsIntervalRef.current = null; }
    if (audioRef.current && timeUpdateHandlerRef.current) {
      audioRef.current.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
      timeUpdateHandlerRef.current = null;
    }

    const lrcLines = cachedLrcLines || (syncedLyrics ? parseLrc(syncedLyrics) : null);
    lrcLinesRef.current = lrcLines;
    setLyricsTrack({ artist, title, lyrics, lrcLines });
    setActiveLyricLine(0);

    if (lrcLines && lrcLines.length > 0 && audioRef.current) {
      // ── Real-time LRC sync via ontimeupdate
      const handler = () => {
        if (!audioRef.current || !lrcLinesRef.current) return;
        const nowMs = audioRef.current.currentTime * 1000;
        let idx = 0;
        for (let i = 0; i < lrcLinesRef.current.length; i++) {
          if (lrcLinesRef.current[i].time <= nowMs) idx = i;
          else break;
        }
        setActiveLyricLine(idx);
      };
      timeUpdateHandlerRef.current = handler;
      audioRef.current.addEventListener("timeupdate", handler);
    } else if (lyrics) {
      // ── Fallback: advance a line every 2.5s
      const lineCount = lyrics.split("\n").filter(Boolean).length;
      lyricsIntervalRef.current = setInterval(() => {
        setActiveLyricLine((prev) => {
          if (prev >= lineCount - 1) { clearInterval(lyricsIntervalRef.current!); return prev; }
          return prev + 1;
        });
      }, 2500);
    }
  };

  // Close lyrics modal — clear all sync mechanisms
  const handleCloseLyrics = () => {
    setLyricsTrack(null);
    lrcLinesRef.current = null;
    if (lyricsIntervalRef.current) { clearInterval(lyricsIntervalRef.current); lyricsIntervalRef.current = null; }
    if (audioRef.current && timeUpdateHandlerRef.current) {
      audioRef.current.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
      timeUpdateHandlerRef.current = null;
    }
  };

  // Emoji reaction handler — optimistic update + server persist
  const handleReaction = async (messageId: string, reactionId: string) => {
    const current = messageReactions[messageId];
    const next = current === reactionId ? null : reactionId; // toggle off if same
    setMessageReactions((prev) => ({ ...prev, [messageId]: next }));
    try {
      await reactToMessage(messageId, next);
    } catch (e) {
      console.error("Failed to save reaction:", e);
      // Rollback optimistic update
      setMessageReactions((prev) => ({ ...prev, [messageId]: current ?? null }));
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

      const responseStream = await sendMessage(targetConvId, userMessageContent, selectedProvider, activeMood);
      
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
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden relative" style={{ background: "var(--background)" }}>
      
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
      <div className="flex-1 flex flex-col justify-between h-full overflow-hidden" style={{ background: "var(--background)" }}>
        
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

                {/* ── Emoji Reaction Bar (assistant messages only) */}
                {!isUser && msg.id && (
                  <div className="flex items-center gap-0.5 px-1">
                    {REACTIONS.map(({ emoji, id, label }) => {
                      const isSelected = messageReactions[msg.id] === id;
                      return (
                        <button
                          key={id}
                          onClick={() => handleReaction(msg.id, id)}
                          className={`reaction-btn ${isSelected ? "reaction-btn-active" : ""}`}
                          title={label}
                          aria-label={`React with ${label}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                )}

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
                                      <div className={`h-full w-full flex items-center justify-center ${isLoading ? "shimmer-bg" : ""}`}>
                                        <Music2 className={`h-5 w-5 text-zinc-700 ${isLoading ? "animate-pulse" : ""}`} />
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

                              {/* Action buttons: Play, Lyrics, Spotify, YouTube, or loading state */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isLoading ? (
                                  <div 
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-violet-500/20 shimmer-bg select-none"
                                    style={{
                                      boxShadow: "0 0 12px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.02)",
                                    }}
                                  >
                                    {/* Spinner & Pulsing message */}
                                    <div className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                    <span className="text-[9px] font-mono text-violet-400 font-bold uppercase tracking-wider">Syncing Preview...</span>
                                  </div>
                                ) : (
                                  <>
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
                                        onClick={() => handleShowLyrics(track.artist, track.title, details.lyrics, details.syncedLyrics, details.lrcLines)}
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
                                    {/* Spotify deep link */}
                                    <a
                                      href={getSpotifyUrl(track.artist, track.title)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-2 rounded-xl transition-all"
                                      style={{
                                        background: "linear-gradient(180deg, #1a1a24 0%, #111118 100%)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        color: "#71717a",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                                        display: "inline-flex", alignItems: "center",
                                      }}
                                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#1db954"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(29,185,84,0.3)"; }}
                                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#71717a"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
                                      title="Open in Spotify"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                                    </a>
                                    {/* YouTube Music deep link */}
                                    <a
                                      href={getYouTubeUrl(track.artist, track.title)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-2 rounded-xl transition-all"
                                      style={{
                                        background: "linear-gradient(180deg, #1a1a24 0%, #111118 100%)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        color: "#71717a",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                                        display: "inline-flex", alignItems: "center",
                                      }}
                                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#ff0000"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,0,0,0.3)"; }}
                                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#71717a"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
                                      title="Open in YouTube Music"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/></svg>
                                    </a>
                                  </>
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


      {/* ─── Floating Audio Player ─────────────────────────────────────── */}
      {playingTrackId && (
        <div className="fixed bottom-6 right-6 z-50 animate-scale-in" style={{
          background: trackDetails[playingTrackId]?.coverArtUrl
            ? "rgba(12, 12, 18, 0.88)"
            : "linear-gradient(160deg, #141420 0%, #0f0f18 60%, #0c0c14 100%)",
          border: "1px solid rgba(139,92,246,0.3)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.12), 0 0 48px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
          borderRadius: "22px",
          padding: "14px 16px",
          width: "300px",
          position: "relative",
          overflow: "hidden",
        }}>

          {/* Cinematic blurred album art background */}
          {trackDetails[playingTrackId]?.coverArtUrl && (
            <div
              className="cinematic-art-bg"
              style={{
                position: "absolute", inset: 0, zIndex: 0,
                backgroundImage: `url(${trackDetails[playingTrackId].coverArtUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(40px) saturate(0.45) brightness(0.18)",
                transform: "scale(1.15)",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Content layer — sits above the cinematic bg */}
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Top chrome strip */}
            <div className="-mx-4 -mt-3.5 mb-3 px-4 py-1.5 rounded-t-[20px] flex items-center justify-between" style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-violet-400">Now Playing</span>
              <span className="glow-dot" />
            </div>

            <div className="flex items-center gap-3">
              {/* Spinning vinyl disc with album art */}
              <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
                <div className="absolute inset-0 rounded-full" style={{
                  animation: "record-spin 4s linear infinite",
                  background: trackDetails[playingTrackId]?.coverArtUrl
                    ? `url(${trackDetails[playingTrackId].coverArtUrl}) center/cover`
                    : "radial-gradient(circle, #2a1a3e, #1a0a2e)",
                  boxShadow: "0 0 0 2px rgba(139,92,246,0.4), 0 0 0 4px rgba(139,92,246,0.1), 0 4px 20px rgba(0,0,0,0.7)",
                }} />
                <div className="absolute inset-[38%] rounded-full" style={{ background: "#08080a", border: "1px solid rgba(255,255,255,0.12)" }} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-zinc-100 truncate leading-tight">
                  {playingTrackId.split("||")[1].replace(/\b\w/g, c => c.toUpperCase())}
                </div>
                <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                  {playingTrackId.split("||")[0].replace(/\b\w/g, c => c.toUpperCase())}
                </div>
                {/* Real-time Web Audio FFT canvas — replaces random waveform bars */}
                <canvas
                  ref={canvasCallbackRef}
                  width={120}
                  height={18}
                  className="mt-2 block"
                  style={{ borderRadius: "3px" }}
                />
              </div>

              <button
                onClick={stopAudio}
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
            
            {/* Lyrics scroll area — 3-state karaoke with auto-scroll */}
            <div
              ref={lyricsScrollRef}
              className="flex-1 overflow-y-auto py-4 px-3"
              style={{ scrollbarWidth: "thin" }}
            >
              {lyricsTrack.lrcLines && lyricsTrack.lrcLines.length > 0 ? (
                <div className="space-y-0.5">
                  {lyricsTrack.lrcLines.map((line, idx) => (
                    <p
                      key={idx}
                      className={`lyrics-line ${
                        idx === activeLyricLine
                          ? "lyrics-line-active"
                          : idx === activeLyricLine + 1
                          ? "lyrics-line-upcoming"
                          : ""
                      }`}
                      onClick={() => setActiveLyricLine(idx)}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : lyricsTrack.lyrics ? (
                <div className="space-y-0.5">
                  {lyricsTrack.lyrics.split("\n").filter(Boolean).map((line, idx) => (
                    <p
                      key={idx}
                      className={`lyrics-line ${
                        idx === activeLyricLine
                          ? "lyrics-line-active"
                          : idx === activeLyricLine + 1
                          ? "lyrics-line-upcoming"
                          : ""
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

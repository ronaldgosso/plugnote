"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, MessageSquare, Trash2, Edit2, Send, Sparkles, Settings, Disc, Play, Pause, 
  FileText, Music2, AlertTriangle, ChevronRight, Menu, X, ArrowUpRight, Volume2, 
  HelpCircle, Star, Loader2, PanelLeftOpen, PanelLeftClose
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
  
  // Audio Controller
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
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

  // Filter available providers based on trial or user keys
  const availableProviders = Object.entries(PROVIDERS_INFO).filter(([id]) => {
    if (id === "trial_mistral") return true;
    const status = apiKeysStatus.find((k) => k.provider === id);
    return status?.isActive && status?.hasKey;
  });

  // Track parser helper
  const extractTracks = (text: string): ParsedTrack[] => {
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
  };

  // Lazy-load details for a suggested track
  const loadTrackData = async (artist: string, title: string) => {
    const key = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    if (trackDetails[key] || loadingTrack[key]) return;

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
    }
  };

  // Automatically trigger track data preloading for all parsed assistant recommendations
  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.role === "assistant") {
        const tracks = extractTracks(msg.content);
        tracks.forEach((track) => {
          loadTrackData(track.artist, track.title);
        });
      }
    });
  }, [messages]);

  // Play audio snippet
  const handlePlayPreview = async (artist: string, title: string, previewUrl: string | null) => {
    const trackId = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    
    if (playingTrackId === trackId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
      return;
    }

    if (!previewUrl) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPlayingTrackId(trackId);

    audio.play().catch((err) => {
      // Ignore AbortError caused by rapid play/pause toggle actions
      if (err.name !== "AbortError") {
        console.error("Audio playback error:", err);
        setPlayingTrackId(null);
      }
    });

    audio.onended = () => {
      setPlayingTrackId(null);
    };
  };

  // Show lyrics modal
  const handleShowLyrics = (artist: string, title: string, lyrics: string | null) => {
    setLyricsTrack({ artist, title, lyrics });
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
      
      // Typewriter interval for character-by-character fluid streaming
      const typewriterInterval = setInterval(() => {
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
        clearInterval(typewriterInterval);
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
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden relative bg-zinc-950">
      
      {/* Sidebar - saved conversations */}
      <div 
        className={`absolute md:relative inset-y-0 left-0 bg-zinc-900 border-r border-zinc-800/80 z-30 transition-all duration-300 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          sidebarCollapsed ? "md:-translate-x-full md:absolute md:w-0 md:invisible" : "md:translate-x-0 md:w-80 md:visible"
        } flex flex-col justify-between`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* New Chat Button & Collapse trigger */}
          <div className="p-4 border-b border-zinc-800/50 flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white rounded-xl py-3 px-4 flex items-center justify-center gap-2 font-semibold transition-all hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]"
            >
              <Plus className="h-5 w-5 animate-pulse" />
              <span className="truncate">New Chat</span>
            </button>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-3 hover:bg-zinc-850 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors hidden md:block"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-3 py-2">
              Recent Chats
            </div>
            
            {conversations.length === 0 ? (
              <div className="text-xs text-zinc-500 italic p-3 text-center">
                No saved conversations.
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = activeId === conv.id;
                const isEditing = editingId === conv.id;

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                      isActive 
                        ? "bg-zinc-800 text-white" 
                        : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-8">
                      <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-violet-400" : "text-zinc-500"}`} />
                      
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
                            className="bg-zinc-950 border border-violet-500/50 rounded px-1.5 py-0.5 text-xs text-zinc-100 font-medium focus:outline-none w-full"
                          />
                        </form>
                      ) : (
                        <span className="text-xs font-medium truncate">{conv.title}</span>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button
                          onClick={(e) => startRename(conv.id, conv.title, e)}
                          className="p-1 hover:text-zinc-200 text-zinc-500 transition-colors"
                          title="Rename chat"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteChat(conv.id, e)}
                          className="p-1 hover:text-red-400 text-zinc-500 transition-colors"
                          title="Delete chat"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Free trial footer info */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/40 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Free Trial Usage</span>
            <span className="font-semibold text-violet-400">{currentTrialStatus.used} / {currentTrialStatus.limit}</span>
          </div>
          <div className="w-full bg-zinc-850 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-violet-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${(currentTrialStatus.used / currentTrialStatus.limit) * 100}%` }}
            />
          </div>
          <a
            href="/settings"
            className="flex items-center justify-between text-xs text-violet-400 hover:text-violet-300 font-semibold"
          >
            <span>Manage Custom API Keys</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Main Workspace chat window */}
      <div className="flex-1 flex flex-col justify-between h-full bg-zinc-950 overflow-hidden">
        
        {/* Mobile Header Bar */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800/60 z-20">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-bold text-violet-400 tracking-wide flex items-center gap-1.5">
            <Music2 className="h-4.5 w-4.5" />
            Plugnote AI
          </span>
          <a
            href="/settings"
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
          >
            <Settings className="h-5 w-5" />
          </a>
        </div>

        {/* Chat Header details */}
        <div className="hidden md:flex items-center justify-between px-6 py-4 bg-zinc-900/40 border-b border-zinc-900/60">
          <div className="flex items-center gap-3">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2.5 hover:bg-zinc-800 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-4.5 w-4.5" />
              </button>
            )}
            <div>
              <h1 className="text-sm font-bold text-zinc-200">
                {activeId ? conversations.find(c => c.id === activeId)?.title : "New Music Session"}
              </h1>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-0.5">
                Active Provider: {PROVIDERS_INFO[selectedProvider as ProviderId]?.name || selectedProvider}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs text-zinc-400">Model:</span>
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
              className="p-2 hover:bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
              title="API Key Settings"
            >
              <Settings className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Messages display viewport */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          
          {/* Empty state welcome card */}
          {messages.length === 0 && !streamingMessage && (
            <div className="max-w-2xl mx-auto text-center py-12 md:py-20 space-y-8">
              <div className="inline-flex p-4 rounded-3xl bg-violet-600/10 border border-violet-500/20 text-violet-400 animate-bounce">
                <Disc className="h-10 w-10 animate-spin" style={{ animationDuration: "12s" }} />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-extrabold text-zinc-100 tracking-tight bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                  Personal AI Music Expert
                </h1>
                <p className="text-sm text-zinc-400 max-w-md mx-auto">
                  Ask for personalized recommendations, discover matching songs, explore genres, or write lyrics context.
                </p>
              </div>

              {/* Mood Filter Pill selectors */}
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Select Your Music Mood</div>
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg mx-auto">
                  {MOODS.map((mood) => {
                    const isSelected = activeMood === mood.id;
                    return (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => setActiveMood(mood.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                          isSelected
                            ? "bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-500/15 scale-105"
                            : "bg-zinc-900/60 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:border-zinc-750"
                        }`}
                      >
                        <span>{mood.emoji}</span>
                        <span>{mood.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(prompt)}
                    className="p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-800 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-all text-left space-y-1"
                  >
                    <span className="flex items-center gap-1.5 text-violet-400 font-semibold mb-0.5">
                      <Star className="h-3 w-3" /> Sample Prompt
                    </span>
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages list rendering */}
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const suggestedTracks = !isUser ? extractTracks(msg.content) : [];

            return (
              <div
                key={msg.id}
                className={`flex gap-3 md:gap-4 max-w-3xl ${
                  isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                {/* Avatar */}
                <div className={`h-8 w-8 md:h-10 md:w-10 rounded-full shrink-0 flex items-center justify-center font-bold text-xs ${
                  isUser 
                    ? "bg-gradient-to-r from-pink-500 to-violet-500 text-white" 
                    : "bg-zinc-800 text-violet-400 border border-zinc-700/50"
                }`}>
                  {isUser ? "ME" : <Sparkles className="h-4.5 w-4.5 text-violet-400" />}
                </div>

                <div className="space-y-4 max-w-[calc(100%-48px)]">
                  {/* Bubble content */}
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed border ${
                    isUser 
                      ? "bg-violet-950/20 border-violet-500/20 text-zinc-100" 
                      : "bg-zinc-900/60 border-zinc-800/80 text-zinc-300"
                  }`}>
                    {isUser ? (
                      <span className="whitespace-pre-line">{msg.content}</span>
                    ) : (
                      <ReactMarkdown className="markdown-content space-y-2 prose prose-invert max-w-none text-zinc-300">
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>

                  {/* Recommendations Cards Block */}
                  {suggestedTracks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] text-violet-400 font-bold uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <Volume2 className="h-3.5 w-3.5" />
                        Discovered Tracks
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {suggestedTracks.map((track, i) => {
                          const trackKey = `${track.artist.toLowerCase()}||${track.title.toLowerCase()}`;
                          const details = trackDetails[trackKey];
                          const isLoading = loadingTrack[trackKey] || false;
                          const isPlaying = playingTrackId === trackKey;

                          return (
                            <div 
                              key={i}
                              className="bg-zinc-900 border border-zinc-850 hover:border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm hover:shadow-md transition-all group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Thumbnail Cover */}
                                <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg bg-zinc-950 flex items-center justify-center shrink-0 border border-zinc-850 relative overflow-hidden">
                                  {details?.coverArtUrl ? (
                                    <img 
                                      src={details.coverArtUrl} 
                                      alt={track.title} 
                                      className="object-cover h-full w-full"
                                    />
                                  ) : (
                                    <Music2 className="h-5 w-5 text-zinc-600" />
                                  )}
                                  
                                  {isLoading && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                      <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-zinc-200 truncate">{track.title}</div>
                                  <div className="text-[10px] text-zinc-500 truncate">{track.artist}</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                                {/* Play Audio Button */}
                                {details?.previewUrl && (
                                  <button
                                    onClick={() => handlePlayPreview(track.artist, track.title, details.previewUrl)}
                                    className={`p-1.5 rounded-lg border transition-colors ${
                                      isPlaying 
                                        ? "bg-violet-600 border-violet-500 text-white" 
                                        : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
                                    }`}
                                    title={isPlaying ? "Pause preview" : "Play 30s preview"}
                                  >
                                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                  </button>
                                )}

                                {/* Lyrics Button */}
                                {details && (
                                  <button
                                    onClick={() => handleShowLyrics(track.artist, track.title, details.lyrics)}
                                    className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
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

          {/* Waiting/Thinking bubble animation */}
          {isSending && !streamingMessage && (
            <div className="flex gap-3 md:gap-4 max-w-3xl mr-auto animate-pulse">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-zinc-800 border border-zinc-700/50 text-violet-400 flex items-center justify-center shrink-0">
                <Sparkles className="h-4.5 w-4.5 text-violet-500 animate-spin" style={{ animationDuration: "4s" }} />
              </div>
              <div className="space-y-4 max-w-[calc(100%-48px)]">
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-sm text-zinc-400 flex items-center gap-1.5 h-11 px-5">
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {/* Streaming display bubble */}
          {streamingMessage && (
            <div className="flex gap-3 md:gap-4 max-w-3xl mr-auto">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-zinc-800 border border-zinc-700/50 text-violet-400 flex items-center justify-center shrink-0">
                <Sparkles className="h-4.5 w-4.5 text-violet-500 animate-pulse" />
              </div>
              <div className="space-y-4 max-w-[calc(100%-48px)]">
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-sm text-zinc-300 leading-relaxed shadow-[0_0_15px_rgba(139,92,246,0.02)]">
                  <ReactMarkdown className="markdown-content space-y-2 prose prose-invert max-w-none text-zinc-300">
                    {streamingMessage}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input submission container bar */}
        <div className="p-4 bg-zinc-900/40 border-t border-zinc-900/60">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto space-y-3">
            
            {/* Trial Exceeded warning block */}
            {isTrialExceeded ? (
              <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Trial limit exceeded!</span> You have reached your 10 free trial queries. 
                  Please navigate to the{" "}
                  <a href="/settings" className="underline font-bold text-violet-400 hover:text-violet-300">
                    Settings Page
                  </a>{" "}
                  and enter your own API key to restore unlimited access.
                </div>
              </div>
            ) : (
              selectedProvider === "trial_mistral" && (
                <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1.5 font-medium">
                  <span>Using Host Trial (Mistral Large)</span>
                  <span>{10 - currentTrialStatus.used} free queries left</span>
                </div>
              )
            )}

            <div className="relative flex items-center bg-zinc-900 border border-zinc-800/80 focus-within:border-violet-500/50 rounded-2xl transition-colors">
              <input
                disabled={isSending || isTrialExceeded}
                type="text"
                placeholder={isTrialExceeded ? "Trial queries exhausted. Enter custom keys." : "Ask about tracks, albums, artists, or request playlists..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-transparent pl-4 pr-16 py-3.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-40"
              />
              
              <div className="absolute right-2 flex items-center gap-1">
                {input.trim() && (
                  <button
                    disabled={isSending || isTrialExceeded}
                    type="submit"
                    className="p-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-950 text-white rounded-xl transition-all shadow-md hover:shadow-lg disabled:shadow-none"
                  >
                    <Send className="h-4.5 w-4.5" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Floating Audio Player Widget (bottom right) */}
      {playingTrackId && (
        <div className="fixed bottom-6 right-6 z-40 bg-zinc-900/90 border border-violet-500/20 shadow-2xl rounded-2xl p-4 flex items-center gap-4 animate-fade-in w-72 backdrop-blur-md">
          <div className="h-10 w-10 rounded-lg bg-zinc-950 border border-zinc-800 shrink-0 relative overflow-hidden flex items-center justify-center">
            {trackDetails[playingTrackId]?.coverArtUrl ? (
              <img 
                src={trackDetails[playingTrackId].coverArtUrl} 
                alt="Playing cover" 
                className="object-cover h-full w-full animate-pulse"
              />
            ) : (
              <Music2 className="h-5 w-5 text-violet-400" />
            )}
            
            <div className="absolute inset-0 bg-violet-600/10 flex items-center justify-center">
              <div className="flex gap-0.5 items-end h-5">
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
              </div>
            </div>
          </div>
          
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-zinc-200 truncate">
              {playingTrackId.split("||")[1].toUpperCase()}
            </div>
            <div className="text-[10px] text-zinc-500 truncate">
              {playingTrackId.split("||")[0].toUpperCase()}
            </div>
          </div>
          
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.pause();
              }
              setPlayingTrackId(null);
            }}
            className="p-2 rounded-full bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Lyrics Modal Backdrop */}
      {lyricsTrack && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wide">Song Lyrics</h3>
                <h2 className="text-base font-extrabold text-violet-400 truncate mt-0.5">
                  {lyricsTrack.title} <span className="text-zinc-500 font-normal">by {lyricsTrack.artist}</span>
                </h2>
              </div>
              <button
                onClick={() => setLyricsTrack(null)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Scroll Content */}
            <div className="flex-1 overflow-y-auto p-6 text-zinc-300 font-mono text-sm leading-relaxed whitespace-pre-wrap select-text">
              {lyricsTrack.lyrics ? (
                lyricsTrack.lyrics
              ) : (
                <div className="text-zinc-500 italic text-center py-12 flex flex-col items-center gap-2">
                  <HelpCircle className="h-8 w-8 text-zinc-600" />
                  No lyrics found for this song in the free LRCLib database.
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 text-right">
              <button
                onClick={() => setLyricsTrack(null)}
                className="bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
              >
                Close Lyrics
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

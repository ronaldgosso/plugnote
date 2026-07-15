"use server";

import db from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

export interface DiscoveredTrackData {
  id: string;
  conversationId: string;
  conversationTitle: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  coverArtUrl: string | null;
  previewUrl: string | null;
  syncedLyrics: string | null;
  lyrics: string | null;
  mood: string;
  createdAt: Date;
}

/**
 * Saves a recommended track to the database Library.
 * Deduplicates by conversationId + artist + title to prevent duplicates.
 */
export async function saveDiscoveredTrack(
  conversationId: string,
  track: {
    title: string;
    artist: string;
    album?: string | null;
    genre?: string | null;
    coverArtUrl?: string | null;
    previewUrl?: string | null;
    syncedLyrics?: string | null;
    lyrics?: string | null;
    mood?: string;
  }
) {
  try {
    const existing = await db.discoveredTrack.findFirst({
      where: {
        conversationId,
        artist: track.artist,
        title: track.title,
      },
    });

    if (existing) {
      return existing;
    }

    return await db.discoveredTrack.create({
      data: {
        conversationId,
        title: track.title,
        artist: track.artist,
        album: track.album || null,
        genre: track.genre || null,
        coverArtUrl: track.coverArtUrl || null,
        previewUrl: track.previewUrl || null,
        syncedLyrics: track.syncedLyrics || null,
        lyrics: track.lyrics || null,
        mood: track.mood || "all",
      },
    });
  } catch (err) {
    console.error("[saveDiscoveredTrack Error]:", err);
    return null;
  }
}

/**
 * Retrieves all discovered tracks for a session, joined with the conversation details.
 */
export async function getDiscoveredTracks(): Promise<DiscoveredTrackData[]> {
  try {
    const sessionId = await getOrCreateSession();
    let tracks = await db.discoveredTrack.findMany({
      where: {
        conversation: {
          sessionId,
        },
      },
      include: {
        conversation: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Self-healing migration fallback: if the library is empty, parse historical assistant messages
    if (tracks.length === 0) {
      const messages = await db.message.findMany({
        where: {
          conversation: {
            sessionId,
          },
          role: "assistant",
        },
        include: {
          conversation: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      if (messages.length > 0) {
        const { getTrackDetails } = await import("@/lib/music");
        
        for (const msg of messages) {
          const content = msg.content;
          const discovered: { title: string; artist: string }[] = [];
          const seen = new Set<string>();

          // Pattern 1: "Song" by Artist
          const p1 = /"([^"]+)"\s*(?:\*\*)?\s*by\s*(?:\*\*)?\s*([A-Za-z0-9\s,&'.\-\(\)\u00C0-\u017F\u0180-\u024F]+)/gi;
          let m;
          while ((m = p1.exec(content)) !== null) {
            const title = m[1].trim();
            const artist = m[2].trim();
            const key = `${title.toLowerCase()}||${artist.toLowerCase()}`;
            if (!seen.has(key) && title.length > 1 && artist.length > 1) {
              seen.add(key);
              discovered.push({ title, artist });
            }
          }

          // Pattern 2: Artist - Song
          const lines = content.split("\n");
          const p2 = /^\s*[\-\*\d\.\s]*\s*(?:\*\*)?\s*([A-Za-z0-9\s,&'.\-\(\)\u00C0-\u017F\u0180-\u024F]+)\s*-\s*(?:\*\*)?\s*["']?([^"'\n*]+)["']?\s*(?:\*\*)?$/i;
          for (const line of lines) {
            const m2 = p2.exec(line);
            if (m2) {
              const artist = m2[1].trim();
              const title = m2[2].trim();
              const key = `${title.toLowerCase()}||${artist.toLowerCase()}`;
              if (!seen.has(key) && title.length > 1 && artist.length > 1) {
                seen.add(key);
                discovered.push({ title, artist });
              }
            }
          }

          // Resolve and back-populate track database records
          for (const t of discovered) {
            try {
              const details = await getTrackDetails(t.artist, t.title);
              await saveDiscoveredTrack(msg.conversation.id, {
                title: t.title,
                artist: t.artist,
                album: details?.album,
                genre: details?.genre,
                coverArtUrl: details?.coverArtUrl,
                previewUrl: details?.previewUrl,
                syncedLyrics: details?.syncedLyrics,
                lyrics: details?.lyrics,
                mood: "all",
              });
            } catch (err) {
              console.error(`Failed to import historical track ${t.title}`, err);
            }
          }
        }

        // Refetch fully updated track records
        tracks = await db.discoveredTrack.findMany({
          where: {
            conversation: {
              sessionId,
            },
          },
          include: {
            conversation: {
              select: {
                title: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      }
    }

    return tracks.map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      conversationTitle: t.conversation.title,
      title: t.title,
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      coverArtUrl: t.coverArtUrl,
      previewUrl: t.previewUrl,
      syncedLyrics: t.syncedLyrics,
      lyrics: t.lyrics,
      mood: t.mood,
      createdAt: t.createdAt,
    }));
  } catch (err) {
    console.error("[getDiscoveredTracks Error]:", err);
    return [];
  }
}

/**
 * Searches YouTube for the track and resolves the best matching Video ID.
 * Employs a robust parsing mechanism scraping search results without api keys.
 */
export async function searchYouTubeAction(artist: string, title: string): Promise<string | null> {
  try {
    const query = `${artist} ${title} audio`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      console.error("[searchYouTubeAction] YouTube HTTP error", res.status);
      return null;
    }

    const html = await res.text();

    // Strategy 1: Extract from ytInitialData script
    const regex = /var ytInitialData\s*=\s*({.+?});/;
    const match = html.match(regex);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const contents =
          data.contents?.twoColumnSearchResultRenderer?.primaryContents?.sectionListRenderer
            ?.contents?.[0]?.itemSectionRenderer?.contents;

        if (contents && Array.isArray(contents)) {
          for (const item of contents) {
            const videoId = item.videoRenderer?.videoId;
            if (videoId) {
              return videoId;
            }
          }
        }
      } catch (parseErr) {
        console.warn("[searchYouTubeAction] JSON parse warning", parseErr);
      }
    }

    // Strategy 2: Regex fallback looking for watch link formats
    const fallbackRegex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
    let fallbackMatch;
    while ((fallbackMatch = fallbackRegex.exec(html)) !== null) {
      if (fallbackMatch[1] && fallbackMatch[1].length === 11) {
        return fallbackMatch[1];
      }
    }

    return null;
  } catch (err) {
    console.error("[searchYouTubeAction Error]:", err);
    return null;
  }
}

export interface SongDetails {
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  coverArtUrl: string;
  previewUrl: string | null;
  /** Plain-text lyrics (fallback display when syncedLyrics is unavailable) */
  lyrics: string | null;
  /** Raw LRC-format synced lyrics with [mm:ss.xx] timestamps for karaoke sync */
  syncedLyrics: string | null;
  lrcLines: { time: number; text: string }[] | null;
}

interface LrcLine {
  time: number;
  text: string;
}

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

export async function getTrackDetails(artist: string, track: string): Promise<SongDetails | null> {
  try {
    const itunesQuery = `${artist} ${track}`;
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(itunesQuery)}&limit=1&media=music`;
    
    let coverArtUrl = ""; // client side can show a waveform gradient if empty
    let previewUrl: string | null = null;
    let verifiedArtist = artist;
    let verifiedTrack = track;
    let verifiedAlbum = "";
    let genre: string | null = null;

    try {
      const itunesRes = await fetch(itunesUrl, { 
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(2500)
      }); // cache for 24 hours
      if (itunesRes.ok) {
        const data = await itunesRes.json();
        if (data.results && data.results.length > 0) {
          const item = data.results[0];
          // Convert 100x100 cover art to high quality 500x500
          coverArtUrl = item.artworkUrl100 ? item.artworkUrl100.replace("100x100bb.jpg", "500x500bb.jpg") : "";
          previewUrl = item.previewUrl || null;
          verifiedArtist = item.artistName || artist;
          verifiedTrack = item.trackName || track;
          verifiedAlbum = item.collectionName || "";
          genre = item.primaryGenreName || null;
        }
      }
    } catch (err) {
      console.error("Error fetching from iTunes API:", err);
    }

    // Fetch lyrics from LRCLib API
    let lyrics: string | null = null;
    let syncedLyrics: string | null = null;
    try {
      const lrcUrl = `https://lrclib.net/api/get?artist=${encodeURIComponent(verifiedArtist)}&title=${encodeURIComponent(verifiedTrack)}`;
      const lrcRes = await fetch(lrcUrl, { 
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(1500)
      });
      
      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        lyrics = lrcData.plainLyrics || null;
        syncedLyrics = lrcData.syncedLyrics || null;
      } else {
        // Fallback to query search
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(verifiedArtist + " " + verifiedTrack)}`;
        const searchRes = await fetch(searchUrl, { 
          next: { revalidate: 86400 },
          signal: AbortSignal.timeout(1500)
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData && searchData.length > 0) {
            lyrics = searchData[0].plainLyrics || null;
            syncedLyrics = searchData[0].syncedLyrics || null;
          }
        }
      }
    } catch (err) {
      console.error("Error fetching lyrics from LRCLib:", err);
    }

    const lrcLines = syncedLyrics ? parseLrc(syncedLyrics) : null;

    return {
      title: verifiedTrack,
      artist: verifiedArtist,
      album: verifiedAlbum,
      genre,
      coverArtUrl,
      previewUrl,
      lyrics,
      syncedLyrics,
      lrcLines,
    };
  } catch (error) {
    console.error("Error in getTrackDetails:", error);
    return null;
  }
}

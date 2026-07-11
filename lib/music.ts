export interface SongDetails {
  title: string;
  artist: string;
  album: string;
  coverArtUrl: string;
  previewUrl: string | null;
  lyrics: string | null;
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

    try {
      const itunesRes = await fetch(itunesUrl, { next: { revalidate: 86400 } }); // cache for 24 hours
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
        }
      }
    } catch (err) {
      console.error("Error fetching from iTunes API:", err);
    }

    // Fetch lyrics from LRCLib API
    let lyrics: string | null = null;
    try {
      const lrcUrl = `https://lrclib.net/api/get?artist=${encodeURIComponent(verifiedArtist)}&title=${encodeURIComponent(verifiedTrack)}`;
      const lrcRes = await fetch(lrcUrl, { next: { revalidate: 86400 } });
      
      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        lyrics = lrcData.plainLyrics || lrcData.syncedLyrics || null;
      } else {
        // Fallback to query search
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(verifiedArtist + " " + verifiedTrack)}`;
        const searchRes = await fetch(searchUrl, { next: { revalidate: 86400 } });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData && searchData.length > 0) {
            lyrics = searchData[0].plainLyrics || searchData[0].syncedLyrics || null;
          }
        }
      }
    } catch (err) {
      console.error("Error fetching lyrics from LRCLib:", err);
    }

    return {
      title: verifiedTrack,
      artist: verifiedArtist,
      album: verifiedAlbum,
      coverArtUrl,
      previewUrl,
      lyrics
    };
  } catch (error) {
    console.error("Error in getTrackDetails:", error);
    return null;
  }
}

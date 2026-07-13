"use server";

import db from "@/lib/db";

const MAX_ARTISTS = 25;
const MAX_GENRES = 15;
const MAX_MOODS = 10;

type TasteProfileData = {
  likedGenres: string;
  exploredArtists: string;
  moodHistory: string;
};

/**
 * Fetches the TasteProfile for a given session, or null if not yet created.
 */
export async function getTasteProfile(sessionId: string): Promise<TasteProfileData | null> {
  const profile = await db.tasteProfile.findUnique({ where: { sessionId } });
  return profile
    ? {
        likedGenres: profile.likedGenres,
        exploredArtists: profile.exploredArtists,
        moodHistory: profile.moodHistory,
      }
    : null;
}

/**
 * Appends new artist names and genre signals to the session's TasteProfile.
 * Deduplicates entries and caps each list at its maximum.
 * Creates the profile row on first call (upsert).
 */
export async function updateTasteProfile(
  sessionId: string,
  newArtists: string[],
  newGenres: string[],
  newMood?: string
): Promise<void> {
  const existing = await db.tasteProfile.findUnique({ where: { sessionId } });

  const mergeList = (raw: string, incoming: string[], max: number): string => {
    const existing: string[] = JSON.parse(raw || "[]");
    // Normalise: lowercase trim for dedup, store original casing from first appearance
    const seen = new Set(existing.map((s) => s.toLowerCase()));
    const merged = [...existing];
    for (const item of incoming) {
      const key = item.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(item.trim());
      }
    }
    return JSON.stringify(merged.slice(0, max));
  };

  const updatedArtists = mergeList(
    existing?.exploredArtists ?? "[]",
    newArtists,
    MAX_ARTISTS
  );
  const updatedGenres = mergeList(
    existing?.likedGenres ?? "[]",
    newGenres,
    MAX_GENRES
  );

  let updatedMoods = existing?.moodHistory ?? "[]";
  if (newMood) {
    const moods: string[] = JSON.parse(updatedMoods);
    if (!moods.includes(newMood)) {
      moods.push(newMood);
    }
    updatedMoods = JSON.stringify(moods.slice(-MAX_MOODS));
  }

  await db.tasteProfile.upsert({
    where: { sessionId },
    create: {
      sessionId,
      exploredArtists: updatedArtists,
      likedGenres: updatedGenres,
      moodHistory: updatedMoods,
    },
    update: {
      exploredArtists: updatedArtists,
      likedGenres: updatedGenres,
      moodHistory: updatedMoods,
    },
  });
}

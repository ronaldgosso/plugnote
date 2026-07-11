"use server";

import { getTrackDetails } from "@/lib/music";

export async function fetchTrackDetailsAction(artist: string, title: string) {
  try {
    return await getTrackDetails(artist, title);
  } catch (error) {
    console.error("Error in fetchTrackDetailsAction Server Action:", error);
    return null;
  }
}

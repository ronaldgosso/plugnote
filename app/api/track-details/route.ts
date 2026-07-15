import { NextRequest, NextResponse } from "next/server";
import { getTrackDetails } from "@/lib/music";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist");
  const title = searchParams.get("title");

  if (!artist || !title) {
    return new Response("Missing artist or title parameters", { status: 400 });
  }

  try {
    const data = await getTrackDetails(artist, title);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Track Details Proxy Error]:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    // Fetch the audio stream from iTunes/Apple CDN
    const res = await fetch(url);
    if (!res.ok) {
      return new Response("Error fetching audio preview", { status: res.status });
    }

    // Proxy the audio stream back to the browser with CORS headers
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Type", res.headers.get("Content-Type") || "audio/mpeg");
    
    const contentLength = res.headers.get("Content-Length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(res.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("[Audio Proxy Error]:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

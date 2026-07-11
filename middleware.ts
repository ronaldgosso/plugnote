import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "session_token";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  if (!request.cookies.has(COOKIE_NAME)) {
    const sessionId = crypto.randomUUID();
    
    response.cookies.set(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });
  }
  
  return response;
}

export const config = {
  matcher: [
    // Intercept all routes except internal files or API endpoints
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};

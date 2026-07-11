import { cookies } from "next/headers";
import crypto from "crypto";
import db from "./db";

const COOKIE_NAME = "session_token";

export async function getSessionId(): Promise<string | undefined> {
  const cookieStore = cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export async function getOrCreateSession(): Promise<string> {
  const cookieStore = cookies();
  let sessionId = cookieStore.get(COOKIE_NAME)?.value;
  
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    try {
      cookieStore.set(COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: "/",
      });
    } catch (e) {
      // In server components, cookies().set() throws an error.
      // We rely on the Edge Middleware to guarantee cookies are set,
      // but this fallback ensures we have a valid ID.
    }
  }
  
  // Upsert the session inside the database to make sure it exists
  await db.session.upsert({
    where: { id: sessionId },
    update: {},
    create: { id: sessionId },
  });
  
  return sessionId;
}

export async function getSession() {
  const sessionId = await getSessionId();
  if (!sessionId) return null;
  
  return db.session.findUnique({
    where: { id: sessionId },
    include: {
      apiKeys: true,
    }
  });
}

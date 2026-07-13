"use server";

import db from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

const VALID_REACTIONS = new Set(["like", "fire", "insight", "love"]);

/**
 * Persists or clears a reaction emoji on an assistant message.
 * Passing `null` removes the existing reaction (toggle-off).
 *
 * Validates session ownership to prevent cross-session mutations.
 */
export async function reactToMessage(
  messageId: string,
  reaction: string | null
): Promise<{ success: boolean }> {
  if (reaction !== null && !VALID_REACTIONS.has(reaction)) {
    throw new Error(`Invalid reaction: "${reaction}"`);
  }

  const sessionId = await getOrCreateSession();

  // Verify the message belongs to a conversation owned by this session
  const message = await db.message.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { sessionId: true } } },
  });

  if (!message || message.conversation.sessionId !== sessionId) {
    throw new Error("Message not found or access denied");
  }

  await db.message.update({
    where: { id: messageId },
    data: { reaction },
  });

  return { success: true };
}

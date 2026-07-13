"use server";

import db from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { getAIModel, buildSystemPrompt } from "@/lib/ai";
import { getTasteProfile, updateTasteProfile } from "@/app/actions/profile";
import { streamText, CoreMessage } from "ai";
import { createStreamableValue } from "ai/rsc";

export async function getConversations() {
  const sessionId = await getOrCreateSession();
  return db.conversation.findMany({
    where: { sessionId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getMessages(conversationId: string) {
  const sessionId = await getOrCreateSession();
  
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId, sessionId },
  });
  
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  
  return db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createConversation(title: string, provider: string) {
  const sessionId = await getOrCreateSession();
  
  return db.conversation.create({
    data: {
      sessionId,
      title,
      modelProvider: provider,
    },
  });
}

export async function renameConversation(id: string, title: string) {
  const sessionId = await getOrCreateSession();
  
  return db.conversation.update({
    where: { id, sessionId },
    data: { title },
  });
}

export async function deleteConversation(id: string) {
  const sessionId = await getOrCreateSession();
  
  return db.conversation.delete({
    where: { id, sessionId },
  });
}

export async function sendMessage(conversationId: string, content: string, provider: string, activeMood?: string) {
  const sessionId = await getOrCreateSession();
  
  // Verify session ownership of the conversation
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId, sessionId },
  });
  
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  
  let key: string | null = null;
  
  if (provider === "trial_mistral") {
    const session = await db.session.findUnique({
      where: { id: sessionId },
    });
    
    if (session && session.freeMessagesUsed >= 10) {
      throw new Error("TRIAL_EXCEEDED");
    }
    
    // Increment the usage counter
    await db.session.update({
      where: { id: sessionId },
      data: { freeMessagesUsed: { increment: 1 } },
    });
  } else {
    // Retrieve and decrypt user API key
    const record = await db.userApiKey.findUnique({
      where: {
        sessionId_provider: {
          sessionId,
          provider,
        },
      },
    });
    
    if (!record || !record.isActive) {
      throw new Error(`KEY_MISSING: API key for ${provider} is not configured or is disabled. Add it in the settings panel.`);
    }
    
    key = decrypt(record.encryptedKey);
  }
  
  // Save User Message in DB
  const userMsg = await db.message.create({
    data: {
      conversationId,
      role: "user",
      content,
    },
  });
  
  // Update conversation timestamp
  await db.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Retrieve conversation history
  const previousMessages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  // Fetch taste profile for personalized system prompt
  const tasteProfile = await getTasteProfile(sessionId);
  const systemPrompt = buildSystemPrompt(tasteProfile);

  // Format for Vercel AI SDK
  const formattedMessages: CoreMessage[] = previousMessages.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  // Create stream
  const stream = createStreamableValue("");
  
  (async () => {
    try {
      const model = getAIModel(provider, key);
      const { textStream } = await streamText({
        model,
        system: systemPrompt,
        messages: formattedMessages,
      });
      
      let fullContent = "";
      for await (const chunk of textStream) {
        fullContent += chunk;
        stream.update(chunk);
      }
      
      // Save assistant response to DB
      await db.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: fullContent,
        },
      });

      // Extract artist names from AI response and update the taste profile
      // Uses the same dual-pattern regex as the client-side extractTracks helper
      const extractedArtists: string[] = [];
      const p1 = /"[^"]+"\s*(?:\*\*)?\s*by\s*(?:\*\*)?\s*([A-Za-z0-9\s,&'.\-\(\)\u00C0-\u017F\u0180-\u024F]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = p1.exec(fullContent)) !== null) {
        const a = m[1].trim();
        if (a.length > 1) extractedArtists.push(a);
      }
      const lines = fullContent.split("\n");
      const p2 = /^\s*[\-\*\d\.\s]*\s*(?:\*\*)?\s*([A-Za-z0-9\s,&'.\-\(\)\u00C0-\u017F\u0180-\u024F]+)\s*-\s*(?:\*\*)?\s*["']?([^"'\n*]+)["']?\s*(?:\*\*)?$/i;
      for (const line of lines) {
        const m2 = p2.exec(line);
        if (m2) {
          const a = m2[1].trim();
          if (a.length > 1) extractedArtists.push(a);
        }
      }
      // Extract genre keywords from both user query and AI response
      const knownGenres = ["rock", "jazz", "electronic", "ambient", "pop", "metal", "hip-hop", "classical", "folk", "techno", "indie", "soul", "blues", "country", "funk", "reggae", "synthwave", "shoegaze", "house", "afrobeat", "lo-fi"];
      const extractedGenres: string[] = [];
      const lowerContent = (content + " " + fullContent).toLowerCase();
      for (const genre of knownGenres) {
        if (new RegExp(`\\b${genre}\\b`, "i").test(lowerContent)) {
          extractedGenres.push(genre);
        }
      }

      if (extractedArtists.length > 0 || extractedGenres.length > 0 || (activeMood && activeMood !== "all")) {
        // Fire-and-forget — don't block the stream response
        updateTasteProfile(sessionId, extractedArtists, extractedGenres, activeMood !== "all" ? activeMood : undefined).catch(() => {});
      }
      
      // Auto-rename conversation based on first message
      const userMsgCount = previousMessages.filter(m => m.role === 'user').length;
      if (userMsgCount <= 1) {
        const words = content.split(" ").slice(0, 5).join(" ");
        const title = words.length > 30 ? words.substring(0, 30) + "..." : words;
        await db.conversation.update({
          where: { id: conversationId },
          data: { title: title || "New Chat" },
        });
      }
      
      stream.done();
    } catch (error: any) {
      console.error("Streaming error:", error);
      stream.error(error.message || "An error occurred during AI response generation.");
    }
  })();
  
  return { 
    output: stream.value, 
    userMessageId: userMsg.id 
  };
}

export async function getFreeTrialStatus() {
  const sessionId = await getOrCreateSession();
  const session = await db.session.findUnique({
    where: { id: sessionId },
  });
  
  return {
    used: session?.freeMessagesUsed || 0,
    limit: 10,
  };
}

"use server";

import db from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { getAIModel, SYSTEM_PROMPT } from "@/lib/ai";
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

export async function sendMessage(conversationId: string, content: string, provider: string) {
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
        system: SYSTEM_PROMPT,
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

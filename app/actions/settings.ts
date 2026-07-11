"use server";

import db from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAIModel } from "@/lib/ai";
import { generateText } from "ai";

export async function getApiKeysStatus() {
  const sessionId = await getOrCreateSession();
  const apiKeys = await db.userApiKey.findMany({
    where: { sessionId },
  });
  
  return apiKeys.map((key) => ({
    provider: key.provider,
    isActive: key.isActive,
    hasKey: true,
  }));
}

export async function saveApiKey(provider: string, key: string, isActive: boolean = true) {
  if (!key || key.trim() === "") {
    return { success: false, error: "API key cannot be empty" };
  }
  
  try {
    const sessionId = await getOrCreateSession();
    const encryptedKey = encrypt(key.trim());
    
    await db.userApiKey.upsert({
      where: {
        sessionId_provider: {
          sessionId,
          provider,
        },
      },
      update: {
        encryptedKey,
        isActive,
      },
      create: {
        sessionId,
        provider,
        encryptedKey,
        isActive,
      },
    });
    
    return { success: true };
  } catch (error: any) {
    console.error("Error saving API key:", error);
    return { success: false, error: error.message || "Failed to save API key" };
  }
}

export async function toggleApiKey(provider: string, isActive: boolean) {
  try {
    const sessionId = await getOrCreateSession();
    
    await db.userApiKey.update({
      where: {
        sessionId_provider: {
          sessionId,
          provider,
        },
      },
      data: { isActive },
    });
    
    return { success: true };
  } catch (error: any) {
    console.error("Error toggling API key:", error);
    return { success: false, error: error.message || "Failed to toggle API key" };
  }
}

export async function deleteApiKey(provider: string) {
  try {
    const sessionId = await getOrCreateSession();
    
    await db.userApiKey.delete({
      where: {
        sessionId_provider: {
          sessionId,
          provider,
        },
      },
    });
    
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting API key:", error);
    return { success: false, error: error.message || "Failed to delete API key" };
  }
}

export async function testApiKeyConnection(provider: string, keyToTest?: string) {
  try {
    const sessionId = await getOrCreateSession();
    let key = keyToTest;
    
    if (!key) {
      const record = await db.userApiKey.findUnique({
        where: {
          sessionId_provider: {
            sessionId,
            provider,
          },
        },
      });
      
      if (record) {
        key = decrypt(record.encryptedKey);
      }
    }
    
    if (!key && provider !== "trial_mistral") {
      return { success: false, error: "No API key configured to test" };
    }
    
    const model = getAIModel(provider, key || null);
    
    const { text } = await generateText({
      model,
      prompt: "Respond with exactly the word: Connection OK",
      maxTokens: 5,
    });
    
    return { success: true, response: text.trim() };
  } catch (error: any) {
    console.error(`Error testing API key connection for ${provider}:`, error);
    return { success: false, error: error.message || "Connection test failed. Verify your key." };
  }
}

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createCohere } from "@ai-sdk/cohere";
import { createMistral } from "@ai-sdk/mistral";

export const SYSTEM_PROMPT =
  "You are a world-class music recommender. You draw on encyclopedic knowledge of music across all genres and eras. " +
  "Give thoughtful, personalized suggestions, explain why they fit, and keep a friendly tone. " +
  "When you recommend songs, formats them EXACTLY as \"Song Name\" by Artist Name or Artist Name - Song Name so they can be parsed by our player.";

/**
 * Builds the system prompt for an AI call.
 * When a taste profile is provided, appends a personalization context block
 * so the model can tailor recommendations to the user's demonstrated preferences.
 */
export function buildSystemPrompt(
  tasteProfile?: { likedGenres: string; exploredArtists: string; moodHistory: string } | null
): string {
  if (!tasteProfile) return SYSTEM_PROMPT;

  const artists: string[] = JSON.parse(tasteProfile.exploredArtists || "[]");
  const genres: string[] = JSON.parse(tasteProfile.likedGenres || "[]");
  const moods: string[] = JSON.parse(tasteProfile.moodHistory || "[]");

  if (!artists.length && !genres.length && !moods.length) return SYSTEM_PROMPT;

  const parts: string[] = [];
  if (artists.length) parts.push(`Previously explored artists: ${artists.slice(0, 12).join(", ")}.`);
  if (genres.length)  parts.push(`Known genre interests: ${genres.slice(0, 8).join(", ")}.`);
  if (moods.length)   parts.push(`Recent mood preferences: ${[...new Set(moods)].join(", ")}.`);

  return (
    SYSTEM_PROMPT +
    "\n\nPersonalization context — use this to fine-tune your recommendations: " +
    parts.join(" ") +
    " Build on what the user already loves while also introducing fresh discoveries."
  );
}


export const PROVIDERS_INFO = {
  trial_mistral: { name: "Mistral (Free Trial)", isTrial: true },
  openai: { name: "OpenAI GPT-4o", isTrial: false },
  anthropic: { name: "Anthropic Claude 3.5 Sonnet", isTrial: false },
  google: { name: "Google Gemini 1.5 Pro", isTrial: false },
  cohere: { name: "Cohere Command R+", isTrial: false },
  groq: { name: "Groq Llama 3.1 70B", isTrial: false },
  mistral: { name: "Mistral Large", isTrial: false },
};

export type ProviderId = keyof typeof PROVIDERS_INFO;

export function getAIModel(provider: string, decryptedKey: string | null) {
  switch (provider) {
    case "openai": {
      if (!decryptedKey) throw new Error("OpenAI API key is missing");
      const openai = createOpenAI({ apiKey: decryptedKey });
      return openai("gpt-4o");
    }
    case "anthropic": {
      if (!decryptedKey) throw new Error("Anthropic API key is missing");
      const anthropic = createAnthropic({ apiKey: decryptedKey });
      return anthropic("claude-3-5-sonnet-latest");
    }
    case "google": {
      if (!decryptedKey) throw new Error("Google Gemini API key is missing");
      const google = createGoogleGenerativeAI({ apiKey: decryptedKey });
      return google("gemini-1.5-pro");
    }
    case "cohere": {
      if (!decryptedKey) throw new Error("Cohere API key is missing");
      const cohere = createCohere({ apiKey: decryptedKey });
      return cohere("command-r-plus");
    }
    case "groq": {
      if (!decryptedKey) throw new Error("Groq API key is missing");
      const groq = createOpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: decryptedKey,
      });
      return groq("llama-3.1-70b-versatile");
    }
    case "mistral": {
      if (!decryptedKey) throw new Error("Mistral API key is missing");
      const mistral = createMistral({ apiKey: decryptedKey });
      return mistral("mistral-large-latest");
    }
    case "trial_mistral": {
      const trialKey = process.env.MISTRAL_API_KEY;
      if (!trialKey) {
        throw new Error("The host has not configured the default free trial Mistral key. Please configure your own API key in Settings to continue.");
      }
      const mistral = createMistral({ apiKey: trialKey });
      return mistral("mistral-large-latest");
    }
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

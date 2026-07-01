/**
 * Available AI models for the IDE chat panel.
 * 
 * This file is intentionally separated from ai.ts to avoid pulling
 * server-only dependencies (env.ts, @ai-sdk/*) into client bundles.
 */

// Only Google/Gemini models are listed: the app authenticates with a Google AI
// Studio key (shared GOOGLE_API_KEY or a per-user bring-your-own key), and a BYO
// key only works for Google models. Other providers (OpenAI/Anthropic/etc.)
// require a paid AI Gateway, so listing them just produces "requires AI Gateway"
// errors for free/BYO users. All of these run on Gemini's free tier, and a BYO
// key also bypasses the shared plan limits.
export const AVAILABLE_MODELS = [
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google", tier: "free" },
    { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "Google", tier: "free" },
    { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google", tier: "free" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", tier: "free" },
] as const;

export type AIModelId = typeof AVAILABLE_MODELS[number]["id"];

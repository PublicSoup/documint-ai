/**
 * Available AI models for the IDE chat panel.
 * 
 * This file is intentionally separated from ai.ts to avoid pulling
 * server-only dependencies (env.ts, @ai-sdk/*) into client bundles.
 */

// Gemini models run on the shared GOOGLE_API_KEY (or a BYO Google key) and are
// free-tier friendly. The other providers work through the AI Gateway when one
// is configured, or through the user's own key for that provider (added via the
// API Keys dialog) — a BYO key also bypasses the shared plan limits.
export const AVAILABLE_MODELS = [
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google", tier: "free" },
    { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "Google", tier: "free" },
    { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google", tier: "free" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", tier: "free" },
    { id: "anthropic/claude-opus-4-5", label: "Claude Opus 4.5", provider: "Anthropic", tier: "pro" },
    { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Anthropic", tier: "pro" },
    { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "Anthropic", tier: "free" },
    { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI", tier: "pro" },
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI", tier: "free" },
    { id: "openai/o3-mini", label: "o3-mini", provider: "OpenAI", tier: "pro" },
    { id: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek", tier: "pro" },
    { id: "xai/grok-2-latest", label: "Grok 2", provider: "xAI", tier: "pro" },
    // Served by the user's own OpenAI-compatible endpoint, configured in API Keys.
    { id: "custom/model", label: "Custom Provider", provider: "Custom", tier: "free" },
] as const;

export type AIModelId = typeof AVAILABLE_MODELS[number]["id"];

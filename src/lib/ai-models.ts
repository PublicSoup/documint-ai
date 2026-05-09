/**
 * Available AI models for the IDE chat panel.
 * 
 * This file is intentionally separated from ai.ts to avoid pulling
 * server-only dependencies (env.ts, @ai-sdk/*) into client bundles.
 */

export const AVAILABLE_MODELS = [
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", tier: "pro" },
    { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google", tier: "free" },
    { id: "anthropic/claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", provider: "Anthropic", tier: "pro" },
    { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI", tier: "pro" },
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI", tier: "free" },
    { id: "openai/o3-mini", label: "o3-mini", provider: "OpenAI", tier: "pro" },
    { id: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek", tier: "pro" },
    { id: "xai/grok-2-latest", label: "Grok 2", provider: "xAI", tier: "pro" },
] as const;

export type AIModelId = typeof AVAILABLE_MODELS[number]["id"];

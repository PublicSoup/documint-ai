import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText as aiSDKGenerateText, generateObject, streamText as aiSDKStreamText, APICallError, RetryError } from "ai";
import { z } from "zod";
import { env } from "./env";
import { createGateway, GatewayError } from "@ai-sdk/gateway";
import { AiQuotaExceededError, assertAiUsageBudget, getUserApiKeys, parseCustomProviderConfig, trackAiUsage, OPENROUTER_BASE_URL, type AiKeyProvider } from "./ai-usage";
import { normalizeConversation } from "./agent/tool-protocol";

/**
 * AI Provider Utility - Refactored for Vercel AI SDK (@ai-sdk/google)
 * Supports BYO API key per user + shared key with plan quota enforcement.
 */

export interface AIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface AICompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    reasoningEffort?: "low" | "medium";
    /** If provided, the user's own API key will be used if available */
    userId?: string;
}

export interface AICompletionResult {
    content: string;
    provider: string;
    model: string;
}

export { AVAILABLE_MODELS } from "./ai-models";

/**
 * Sanitize prompt content to prevent basic injection attacks
 */
export function safePrompt(input: string): string {
    return input
        .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u2028\u2029]/g, "") // Control chars
        .replace(/^System:/i, "User:") // Neutralize fake system headers
        .trim();
}

/**
 * Pull the real failure reason out of the AI SDK / Gateway error chain instead
 * of surfacing "Failed after 3 attempts. Last error: Provider returned error".
 */
export function describeAiError(error: unknown, modelName: string): string {
    // Unwrap the retry wrapper to get to the last real error.
    let inner: unknown = error;
    if (RetryError.isInstance(inner)) {
        inner = inner.lastError ?? inner.errors[inner.errors.length - 1] ?? inner;
    }

    let statusCode: number | undefined;
    let detail = "";

    if (GatewayError.isInstance(inner)) {
        statusCode = inner.statusCode;
        detail = inner.message;
        const cause = inner.cause;
        if (cause && typeof cause === "object") {
            const causeError = (cause as Record<string, unknown>).error;
            if (causeError && typeof causeError === "object" && "message" in causeError) {
                detail = String((causeError as Record<string, unknown>).message) || detail;
            }
        }
    } else if (APICallError.isInstance(inner)) {
        statusCode = inner.statusCode;
        detail = inner.message;
        if (inner.responseBody) {
            try {
                const body = JSON.parse(inner.responseBody) as { error?: { message?: string } | string };
                const bodyError = typeof body.error === "string" ? body.error : body.error?.message;
                if (bodyError) detail = bodyError;
            } catch {
                detail = inner.responseBody.slice(0, 300) || detail;
            }
        }
    } else if (inner instanceof Error) {
        detail = inner.message;
    } else {
        detail = String(inner);
    }

    detail = detail.replace(/\s+/g, " ").trim().slice(0, 400);

    if (statusCode === 401 || statusCode === 403) {
        return `The AI provider rejected the credentials for ${modelName} (HTTP ${statusCode}). Check the configured API key.`;
    }
    if (statusCode === 402) {
        return `The AI provider reports insufficient credits for ${modelName}. Top up the provider/OpenRouter balance or pick a free model.`;
    }
    if (statusCode === 404) {
        return `Model ${modelName} is not available from the provider (HTTP 404). Pick a different model.`;
    }
    if (statusCode && statusCode >= 500) {
        return `The provider for ${modelName} is having a temporary outage (HTTP ${statusCode}). Try again, or switch models. ${detail ? `Details: ${detail}` : ""}`.trim();
    }
    if (statusCode) {
        return `The provider rejected the request for ${modelName} (HTTP ${statusCode}): ${detail || "no details returned"}`;
    }
    return detail || "Unknown provider error";
}

/** True when the failure looks like the request was too large for the model. */
function isPayloadTooLargeError(error: unknown): boolean {
    let inner: unknown = error;
    if (RetryError.isInstance(inner)) {
        inner = inner.lastError ?? inner.errors[inner.errors.length - 1] ?? inner;
    }
    const statusCode = GatewayError.isInstance(inner) || APICallError.isInstance(inner) ? inner.statusCode : undefined;
    const text = inner instanceof Error ? inner.message.toLowerCase() : "";
    return (
        statusCode === 413 ||
        /context.length|context window|too (long|large|many tokens)|max.?_?tokens|token limit|exceeds/.test(text)
    );
}

/**
 * Initialize SDKs
 */
const sharedGoogleGenAI = createGoogleGenerativeAI({
    apiKey: env.GOOGLE_API_KEY,
});

// The AI Gateway authenticates with an explicit key when provided, otherwise
// falls back to Vercel OIDC — automatic on Vercel deployments (request-context
// token), and available locally through the VERCEL_OIDC_TOKEN that
// `vercel env pull` writes. This keeps shared Gemini/gateway models working
// even though the legacy shared GOOGLE_API_KEY was revoked.
const gatewayProvider = env.AI_GATEWAY_API_KEY
    ? createGateway({ apiKey: env.AI_GATEWAY_API_KEY })
    : (process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)
        ? createGateway({})
        : null;

function hasSharedAiProviderConfigured(): boolean {
    return Boolean(gatewayProvider || env.GOOGLE_API_KEY);
}

function isGoogleModel(modelName: string): boolean {
    return modelName.startsWith("google/") || !modelName.includes("/");
}

/**
 * Which BYO-key provider serves a given model.
 */
function byokProviderForModel(modelName: string): AiKeyProvider | null {
    if (isGoogleModel(modelName)) return "google";
    if (modelName.startsWith("anthropic/")) return "anthropic";
    if (modelName.startsWith("openai/")) return "openai";
    if (modelName.startsWith("xai/")) return "xai";
    if (modelName.startsWith("deepseek/")) return "deepseek";
    if (modelName.startsWith("openrouter/")) return "openrouter";
    if (modelName.startsWith("custom/")) return "custom";
    return null;
}

/**
 * Gateway catalog IDs that differ from the provider's native model ID
 * when calling the provider's own API directly with a user key.
 */
const DIRECT_MODEL_OVERRIDES: Record<string, string> = {
    "deepseek/deepseek-r1": "deepseek-reasoner",
};

/**
 * Build a model instance backed by the user's own credentials.
 * `storedValue` is the bare API key, except for "custom" where it is the
 * JSON config produced by the API key settings ({ apiKey, baseUrl, modelId }).
 */
function createUserProviderModel(provider: AiKeyProvider, storedValue: string, modelName: string) {
    const directModelName =
        DIRECT_MODEL_OVERRIDES[modelName] ?? modelName.replace(/^[a-z]+\//, "");
    switch (provider) {
        case "google":
            return createGoogleGenerativeAI({ apiKey: storedValue })(directModelName);
        case "anthropic":
            return createAnthropic({ apiKey: storedValue })(directModelName);
        case "openai":
            return createOpenAI({ apiKey: storedValue })(directModelName);
        case "xai":
            return createXai({ apiKey: storedValue })(directModelName);
        case "deepseek":
            return createDeepSeek({ apiKey: storedValue })(directModelName);
        case "custom": {
            const config = parseCustomProviderConfig(storedValue);
            if (!config) {
                throw new Error("Custom provider is not configured. Add its endpoint and key in API Keys.");
            }
            return createOpenAICompatible({
                name: "custom",
                baseURL: config.baseUrl,
                apiKey: config.apiKey,
            })(config.modelId);
        }
        case "openrouter": {
            // storedValue is the bare OpenRouter key; the model id is whatever
            // follows "openrouter/" in the requested model name (OpenRouter ids
            // are themselves "vendor/model", e.g. "anthropic/claude-3.5-sonnet").
            const orModel = modelName.replace(/^openrouter\//, "").trim() || "openai/gpt-4o-mini";
            return createOpenAICompatible({
                name: "openrouter",
                baseURL: OPENROUTER_BASE_URL,
                apiKey: storedValue,
            })(orModel);
        }
    }
}

/**
 * Base AI Model selector (uses the shared API key)
 */
function getModel(modelName: string = "google/gemini-2.0-flash") {
    if (modelName.startsWith("custom/")) {
        throw new Error("Custom Provider is not configured. Open API Keys and add your endpoint, model ID, and key first.");
    }
    if (modelName.startsWith("openrouter/")) {
        throw new Error("No OpenRouter API key found on your account. Open API Keys → OpenRouter, paste your sk-or-v1-… key, and Save — then try again.");
    }

    if (gatewayProvider) {
        return gatewayProvider(modelName);
    }

    if (!isGoogleModel(modelName)) {
        throw new Error("Selected model requires AI Gateway. Set AI_GATEWAY_API_KEY or choose a Google model.");
    }

    if (!env.GOOGLE_API_KEY) {
        throw new Error("AI backend is not configured. Set GOOGLE_API_KEY or connect your own API key.");
    }
    
    // Fallback: strip 'google/' prefix if using direct Google API
    const directModelName = modelName.replace(/^google\//, "");
    return sharedGoogleGenAI(directModelName);
}

/**
 * Get or create a model instance for a specific user.
 * - If the user has stored their own API key, it's used (bypasses plan quota).
 * - Otherwise, falls back to the shared key with usage tracking.
 */
async function getModelForUser(
    userId: string | undefined,
    modelName: string = "google/gemini-2.0-flash"
): Promise<{ model: ReturnType<typeof getModel>; usingOwnKey: boolean }> {
    // Check for BYO API key
    if (userId) {
        const provider = byokProviderForModel(modelName);
        if (provider) {
            const userKey = (await getUserApiKeys(userId))[provider];
            if (userKey) {
                return { model: createUserProviderModel(provider, userKey, modelName), usingOwnKey: true };
            }
        }
    }

    // Fall back to shared key
    return { model: getModel(modelName), usingOwnKey: false };
}

/** Cheapest model per provider, used only for key validation. */
const VALIDATION_MODELS: Record<AiKeyProvider, string> = {
    google: "gemini-2.0-flash",
    anthropic: "claude-haiku-4-5",
    openai: "gpt-4o-mini",
    xai: "grok-3-mini",
    deepseek: "deepseek-chat",
    openrouter: "", // validated via the OpenRouter key endpoint, not a completion
    custom: "", // the custom config carries its own model ID
};

/**
 * Validate provider credentials by making a minimal one-token completion call.
 * For "custom", pass the JSON config string as `storedValue`.
 *
 * OpenRouter is validated differently: a bare key with zero credits would fail
 * a completion (402) even though the key itself is valid, so we check it against
 * OpenRouter's key-info endpoint, which only cares about authentication.
 */
export async function validateProviderApiKey(
    provider: AiKeyProvider,
    storedValue: string
): Promise<{ valid: boolean; error?: string }> {
    if (provider === "openrouter") {
        try {
            const res = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
                headers: { Authorization: `Bearer ${storedValue}` },
                signal: AbortSignal.timeout(10_000),
            });
            if (res.status === 401 || res.status === 403) {
                return { valid: false, error: "OpenRouter rejected this API key." };
            }
            // Any non-auth response (200, or even a transient 5xx) means the key
            // itself isn't being rejected; don't block the user on that.
            return { valid: true };
        } catch {
            // Network hiccup reaching OpenRouter — allow the save rather than
            // hard-blocking; a bad key surfaces on first use.
            return { valid: true };
        }
    }

    try {
        await aiSDKGenerateText({
            model: createUserProviderModel(provider, storedValue, VALIDATION_MODELS[provider]),
            messages: [{ role: "user", content: "Hi" }],
            maxOutputTokens: 1,
        });
        return { valid: true };
    } catch (e: unknown) {
        return { valid: false, error: e instanceof Error ? e.message : "Invalid API key" };
    }
}

/**
 * Validate a Google API key (legacy alias for validateProviderApiKey).
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    return validateProviderApiKey("google", apiKey);
}

/**
 * Get AI completion with detailed error handling
 * Now powered by Vercel AI SDK for robust exponential backoff and error tracking
 */
export async function getAICompletionWithDetailedError(
    messages: AIMessage[],
    options: AICompletionOptions = {}
): Promise<{ success: boolean; data?: AICompletionResult; error?: string }> {
    try {
        const modelName = options.model || "google/gemini-2.0-flash";
        const { model, usingOwnKey } = await getModelForUser(options.userId, modelName);

        if (!usingOwnKey && !hasSharedAiProviderConfigured()) {
            return {
                success: false,
                error: "AI backend is not configured. Add GOOGLE_API_KEY or connect your own API key in Settings.",
            };
        }
        
        // Extract system message for Vercel AI SDK
        const systemMessage = messages.find(m => m.role === "system")?.content;

        // Map remaining messages (User/Assistant) and normalize the role
        // sequence — strict providers (many OpenRouter upstreams, local chat
        // templates) reject leading-assistant or consecutive same-role turns,
        // which is exactly what the agent's [TOOL_OUTPUT] messages produce.
        // This is why switching models mid-conversation used to blow up.
        const chatMessages = normalizeConversation(
            messages.map(m => ({ role: m.role, content: safePrompt(m.content) }))
        ) as Array<{ role: "user" | "assistant"; content: string }>;

        const estimatedInputTokens = Math.ceil(
            ((systemMessage?.length ?? 0) + chatMessages.reduce((sum, msg) => sum + msg.content.length, 0)) / 4
        );
        const reservedOutputTokens = options.maxTokens ?? 8192;

        if (options.userId) {
            await assertAiUsageBudget(options.userId, estimatedInputTokens + reservedOutputTokens, { isUsingOwnKey: usingOwnKey });
        }

        let response;
        try {
            response = await aiSDKGenerateText({
                model,
                system: systemMessage,
                messages: chatMessages,
                temperature: options.temperature ?? 0.4,
                maxOutputTokens: options.maxTokens ?? 8192,
                abortSignal: AbortSignal.timeout(60000), // Strict 60s timeout abort
            });
        } catch (firstError: unknown) {
            // The request may simply be too big for the selected model (smaller
            // context window / lower max output). Retry once with a trimmed
            // history and a conservative output budget before failing.
            if (!isPayloadTooLargeError(firstError)) throw firstError;

            response = await aiSDKGenerateText({
                model,
                system: systemMessage,
                messages: normalizeConversation(chatMessages.slice(-8)) as Array<{ role: "user" | "assistant"; content: string }>,
                temperature: options.temperature ?? 0.4,
                maxOutputTokens: Math.min(options.maxTokens ?? 8192, 4096),
                abortSignal: AbortSignal.timeout(60000),
            });
        }

        if (options.userId) {
            const estimatedOutputTokens = Math.ceil((response.text?.length ?? 0) / 4);
            const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;

            await trackAiUsage(options.userId, estimatedTotalTokens, { isUsingOwnKey: usingOwnKey });
        }

        if (!response.text || response.text.trim() === "") {
            return { success: false, error: "AI returned an empty response. Try rephrasing your request." };
        }

        return {
            success: true,
            data: {
                content: response.text,
                provider: modelName.split("/")[0] || "unknown",
                model: modelName,
            }
        };
    } catch (e: unknown) {
        if (e instanceof AiQuotaExceededError) {
            return {
                success: false,
                error: e.message,
            };
        }

        const described = describeAiError(e, options.model || "google/gemini-2.0-flash");
        console.error("[Vercel AI SDK Error]:", described);

        const lowerMessage = described.toLowerCase();
        if (lowerMessage.includes("429") || lowerMessage.includes("rate limit") || lowerMessage.includes("resource exhausted")) {
            return {
                success: false,
                error: options.userId
                    ? "AI provider rate limit reached. Add your own API key in API Keys to bypass shared limits, or try again in a minute."
                    : "AI provider rate limit reached. Try again in a minute.",
            };
        }

        return { success: false, error: described };
    }
}

/**
 * Get AI completion (Legacy wrapper)
 */
export async function getAICompletion(
    messages: AIMessage[],
    options: AICompletionOptions = {}
): Promise<AICompletionResult | null> {
    const result = await getAICompletionWithDetailedError(messages, options);
    return result.success && result.data ? result.data : null;
}

/**
 * Generate text with a simple prompt
 */
export async function generateText(
    systemPrompt: string,
    userPrompt: string,
    options: AICompletionOptions = {}
): Promise<string> {
    const result = await getAICompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
    ], options);

    return result?.content || "";
}

/**
 * NEW: Core Stream Text Function for Edge Runtime
 * Use this in UI API routes to directly return `result.toDataStreamResponse()`
 */
export async function streamTextEndpoint(
    systemPrompt: string,
    userPrompt: string,
    options: AICompletionOptions = {}
) {
    const modelName = options.model || "google/gemini-2.0-flash";
    const { model, usingOwnKey } = await getModelForUser(options.userId, modelName);
    const safeUserPrompt = safePrompt(userPrompt);
    const estimatedInputTokens = Math.ceil((systemPrompt.length + safeUserPrompt.length) / 4);

    if (options.userId) {
        await assertAiUsageBudget(options.userId, estimatedInputTokens + (options.maxTokens ?? 8192), { isUsingOwnKey: usingOwnKey });
    }
    
    return aiSDKStreamText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: safeUserPrompt }],
        temperature: options.temperature ?? 0.4,
        maxOutputTokens: options.maxTokens ?? 8192,
    });
}

/**
 * Generate documentation with Gemini
 */
export async function generateDocumentation(
    code: string,
    language: string,
    type: 'file' | 'function' | 'class' | 'complex_logic' = 'file',
    styleGuide?: string
): Promise<string> {
    const systemPrompt = "You are DocuMint AI, an expert technical documentation assistant.";
    let userPrompt = "";

    if (type === 'function') {
        userPrompt = `Generate comprehensive documentation for this ${language} function.
Structure your response with:
- **Summary**: One clear sentence describing what the function does
- **Parameters**: List each parameter with its type and purpose
- **Returns**: Describe the return value and type
- **Example**: Show a practical usage example

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

Code:
\`\`\`${language}
${safePrompt(code)}
\`\`\``;
    } else if (type === 'class') {
        userPrompt = `Generate documentation for this ${language} class.
Include:
- **Purpose**: What this class represents and its responsibilities
- **Key Methods**: Overview of main methods and their purposes
- **Usage**: How to instantiate and use this class

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

Code:
\`\`\`${language}
${safePrompt(code)}
\`\`\``;
    } else if (type === 'complex_logic') {
        userPrompt = `Explain this complex ${language} code block clearly.
Focus on:
- What the code accomplishes
- Why it uses this particular approach
- Any important edge cases

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

Code:
\`\`\`${language}
${safePrompt(code)}
\`\`\``;
    } else {
        userPrompt = `Analyze this ${language} file and provide a concise summary.
Include:
- **Purpose**: Main responsibility of this file
- **Key Exports**: Important functions, classes, or components
- **Dependencies**: Notable imports

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

Code:
\`\`\`${language}
${safePrompt(code.slice(0, 2000))}
\`\`\``;
    }

    return generateText(systemPrompt, userPrompt, { userId: undefined });
}

/**
 * Generate documentation with FULL CODEBASE AWARENESS
 */
export async function generateDocumentationWithContext(
    code: string,
    language: string,
    type: 'file' | 'function' | 'class' | 'complex_logic',
    userId: string,
    fileId: string,
    relatedFileIds: string[] = [],
    styleGuide?: string
): Promise<string> {
    const systemPrompt = "You are DocuMint AI, an expert technical documentation assistant with full codebase awareness.";
    const userPrompt = `Contextual analysis for ${type} in ${language}.
    
File ID: ${fileId}
Related Files: ${relatedFileIds.join(", ")}

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

CODE:
\`\`\`${language}
${safePrompt(code)}
\`\`\``;

    return generateText(systemPrompt, userPrompt, { userId });
}

/**
 * Analyze entire codebase and generate comprehensive report
 */
export async function analyzeFullCodebase(userId: string): Promise<string> {
    const systemPrompt = `You are a Principal Architect performing a comprehensive codebase review.
Analyze the project structure and provide insights.`;

    const userPrompt = `Please provide a high-level architectural overview and analysis for the user's project (User ID: ${userId}). 
Include:
1. Architecture Summary
2. Key Components
3. Dependency Graph Overview
4. Code Quality Assessment
5. Top Recommendations
6. Technical Debt Identification
7. Security Considerations`;

    return generateText(systemPrompt, userPrompt, {
        userId,
        temperature: 0.3,
        maxTokens: 4096
    });
}

/**
 * Detect intent drift between code and documentation
 * UPGRADED: Uses `generateObject` with strictly typed Zod Schema to never fail parsing.
 */
export async function detectIntentDrift(
    newCode: string,
    documentation: string
): Promise<{ drifted: boolean; reasoning?: string | null }> {
    const systemPrompt = "You are a Documentation Drift Analyst. Determine if code changes invalidate existing documentation. Be highly precise.";
    
    try {
        const { object } = await generateObject({
            model: (await getModelForUser(undefined, "google/gemini-2.0-flash")).model,
            system: systemPrompt,
            prompt: `
            EXISTING DOCUMENTATION:
            ${safePrompt(documentation)}
        
            NEW CODE STATE:
            \`\`\`
            ${safePrompt(newCode.substring(0, 6000))}
            \`\`\`
        
            Analyze if the new code implementation has drifted significantly from the documented intent.
            Focus on signature changes, logic contradictions, or missing critical context.`,
            temperature: 0.1,
            // Automatically enforces strict JSON conformity bypassing string-hack vulnerabilities!
            schema: z.object({
                drifted: z.boolean().describe("True if the documentation heavily drifted from actual code logic"),
                reasoning: z.string().nullable().describe("Concise explanation of the mismatch, or null if no drift"),
            }),
        });

        return object;
    } catch (e) {
        console.error("Drift Analytics Error: ", e);
        return { drifted: false, reasoning: null };
    }
}

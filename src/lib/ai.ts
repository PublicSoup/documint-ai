import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText as aiSDKGenerateText, generateObject, streamText as aiSDKStreamText, APICallError, RetryError } from "ai";
import { z } from "zod";
import { env } from "./env";
import { createGateway, GatewayError } from "@ai-sdk/gateway";
import { AiQuotaExceededError, assertAiUsageBudget, getUserApiKey, trackAiUsage } from "./ai-usage";

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

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

/**
 * Normalize a conversation so it is accepted by strict providers.
 *
 * Gemini tolerates arbitrary role sequences, but many gateway/OpenRouter
 * upstreams reject conversations that (a) contain consecutive same-role
 * messages — the agent loop emits several user-role [TOOL_OUTPUT] messages in
 * a row — (b) start with an assistant message (the UI greeting), or (c)
 * contain empty messages. That is why switching from a lenient model to a
 * strict one mid-conversation used to fail with an opaque provider error.
 */
export function normalizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
    const nonEmpty = messages.filter((m) => m.content.trim().length > 0);

    const normalized: ChatMessage[] = [];
    for (const message of nonEmpty) {
        const previous = normalized[normalized.length - 1];
        if (previous && previous.role === message.role) {
            previous.content = `${previous.content}\n\n${message.content}`;
        } else {
            normalized.push({ ...message });
        }
    }

    // Strict providers require the first message to come from the user.
    if (normalized.length > 0 && normalized[0].role === "assistant") {
        normalized.unshift({ role: "user", content: "(Conversation resumed from saved history.)" });
    }

    // ...and the conversation to end with a user turn.
    if (normalized.length > 0 && normalized[normalized.length - 1].role === "assistant") {
        normalized.push({ role: "user", content: "Continue." });
    }

    return normalized;
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
            const causeRecord = cause as Record<string, unknown>;
            const causeError = causeRecord.error;
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
        return `The AI provider reports insufficient credits for ${modelName}. Top up the gateway/OpenRouter balance or pick a free model.`;
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
// falls back to Vercel OIDC — automatic on Vercel deployments, and available
// locally through the VERCEL_OIDC_TOKEN that `vercel env pull` writes.
const gatewayProvider = env.AI_GATEWAY_API_KEY
    ? createGateway({ apiKey: env.AI_GATEWAY_API_KEY })
    : process.env.VERCEL_OIDC_TOKEN
        ? createGateway({})
        : null;

function hasSharedAiProviderConfigured(): boolean {
    return Boolean(gatewayProvider || env.GOOGLE_API_KEY);
}

function isGoogleModel(modelName: string): boolean {
    return modelName.startsWith("google/") || !modelName.includes("/");
}

/**
 * Base AI Model selector (uses the shared API key)
 */
function getModel(modelName: string = "google/gemini-2.0-flash") {
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
    if (userId && isGoogleModel(modelName)) {
        const userKey = await getUserApiKey(userId);
        if (userKey) {
            const userGenAI = createGoogleGenerativeAI({ apiKey: userKey });
            const directModelName = modelName.replace(/^google\//, "");
            return { model: userGenAI(directModelName), usingOwnKey: true };
        }
    }

    // Fall back to shared key
    return { model: getModel(modelName), usingOwnKey: false };
}

/**
 * Validate a Google API key by making a lightweight list models call.
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
        const testAI = createGoogleGenerativeAI({ apiKey });
        const model = testAI("gemini-2.0-flash");
        await aiSDKGenerateText({
            model,
            messages: [{ role: "user", content: "Hi" }],
            maxOutputTokens: 1,
        });
        return { valid: true };
    } catch (e: unknown) {
        return { valid: false, error: e instanceof Error ? e.message : "Invalid API key" };
    }
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
        // sequence so strict providers accept histories produced by lenient ones.
        const chatMessages = normalizeChatMessages(
            messages
                .filter(m => m.role !== "system")
                .map(m => ({
                    role: m.role as "user" | "assistant",
                    content: safePrompt(m.content)
                }))
        );

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
            // The request may simply be too big for the newly selected model
            // (smaller context window / lower max output). Retry once with a
            // trimmed history and a conservative output budget before failing.
            if (!isPayloadTooLargeError(firstError)) throw firstError;

            const trimmedMessages = normalizeChatMessages(chatMessages.slice(-8));
            response = await aiSDKGenerateText({
                model,
                system: systemMessage,
                messages: trimmedMessages,
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

        const modelName = options.model || "google/gemini-2.0-flash";
        const described = describeAiError(e, modelName);
        console.error("[Vercel AI SDK Error]:", described);

        const lowerMessage = described.toLowerCase();
        if (lowerMessage.includes("429") || lowerMessage.includes("rate limit") || lowerMessage.includes("resource exhausted")) {
            return {
                success: false,
                error: options.userId
                    ? "AI provider rate limit reached. Add your own Google API key in Settings to bypass shared limits, or try again in a minute."
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

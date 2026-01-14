/**
 * AI Provider Utility
 * Supports LM Studio (local) and OpenAI (production)
 */

interface AIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface AICompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

interface AICompletionResult {
    content: string;
    provider: "lm-studio" | "openai";
    model: string;
}

// Check if LM Studio is available
async function isLMStudioAvailable(): Promise<boolean> {
    const url = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234";
    try {
        const res = await fetch(`${url}/v1/models`, {
            signal: AbortSignal.timeout(2000)
        });
        return res.ok;
    } catch {
        return false;
    }
}

// Get completion from LM Studio
async function getLMStudioCompletion(
    messages: AIMessage[],
    options: AICompletionOptions = {}
): Promise<AICompletionResult | null> {
    const url = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234";

    try {
        // Get available model
        let modelName = options.model || "qwen2.5-coder-7b-instruct";
        const modelsRes = await fetch(`${url}/v1/models`);
        if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            if (modelsData.data?.length > 0) {
                // Prefer non-embedding models, and prefer models without version suffix if available
                const chatModel = modelsData.data.find((m: any) => 
                    !m.id.includes('embed') && !m.id.includes('embedding')
                ) || modelsData.data.find((m: any) => !m.id.includes('embed')) || modelsData.data[0];
                modelName = chatModel.id;
                console.log(`[LM Studio] Using model: ${modelName}`);
            }
        } else {
            console.warn(`[LM Studio] Failed to fetch models list (${modelsRes.status}), using default: ${modelName}`);
        }

        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelName,
                messages,
                temperature: options.temperature ?? 0.4,
                max_tokens: options.maxTokens ?? 2048,
            }),
        });

        if (res.ok) {
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || "";
            if (!content) {
                console.warn("LM Studio returned empty content:", data);
            }
            return {
                content,
                provider: "lm-studio",
                model: modelName,
            };
        } else {
            const errorText = await res.text();
            console.error(`LM Studio API error (${res.status}):`, errorText);
        }
    } catch (e) {
        console.error("LM Studio error:", e);
    }
    return null;
}

// Get completion from OpenAI
async function getOpenAICompletion(
    messages: AIMessage[],
    options: AICompletionOptions = {}
): Promise<AICompletionResult | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn("OpenAI API key not configured");
        return null;
    }

    try {
        const model = options.model || "gpt-4o-mini";
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: options.temperature ?? 0.4,
                max_tokens: options.maxTokens ?? 2048,
            }),
        });

        if (res.ok) {
            const data = await res.json();
            return {
                content: data.choices?.[0]?.message?.content || "",
                provider: "openai",
                model,
            };
        } else {
            const error = await res.text();
            console.error("OpenAI error:", error);
        }
    } catch (e) {
        console.error("OpenAI error:", e);
    }
    return null;
}

/**
 * Get AI completion with automatic fallback
 * 1. Try LM Studio (local, free)
 * 2. Fall back to OpenAI (cloud, paid)
 */
export async function getAICompletion(
    messages: AIMessage[],
    options: AICompletionOptions = {}
): Promise<AICompletionResult | null> {
    // Check if we should prefer OpenAI (Vercel deployment)
    const preferOpenAI = process.env.AI_PROVIDER === "openai";

    if (preferOpenAI) {
        const result = await getOpenAICompletion(messages, options);
        if (result) return result;
        // Fall back to LM Studio if OpenAI fails
        return getLMStudioCompletion(messages, options);
    }

    // Default: Try LM Studio first, then OpenAI
    if (await isLMStudioAvailable()) {
        const result = await getLMStudioCompletion(messages, options);
        if (result) return result;
    }

    // Fall back to OpenAI
    return getOpenAICompletion(messages, options);
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
 * Check if AI is available at all
 */
export async function isAIAvailable(): Promise<boolean> {
    if (process.env.OPENAI_API_KEY) return true;
    return isLMStudioAvailable();
}

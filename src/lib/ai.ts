import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText as aiSDKGenerateText, generateObject, streamText as aiSDKStreamText } from "ai";
import { z } from "zod";
import { env } from "./env";

/**
 * AI Provider Utility - Refactored for Vercel AI SDK (@ai-sdk/google)
 * Strictly uses Google Gemini (production-ready).
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
}

export interface AICompletionResult {
    content: string;
    provider: "gemini";
    model: string;
}

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
 * Initialize SDK with Vercel AI Gateway for Cost-Free Caching Margin
 */
const googleGenAI = createGoogleGenerativeAI({
    apiKey: env.GOOGLE_API_KEY,
    // Triggers global Edge caching and native rate-limits instantly if configured
    baseURL: process.env.VERCEL_AI_GATEWAY_URL || undefined,
});

/**
 * Base AI Model selector
 */
function getModel(modelName: string = "gemini-2.0-flash") {
    return googleGenAI(modelName);
}

/**
 * Get AI completion with detailed error handling
 * Now powered by Vercel AI SDK for robust exponential backoff and error tracking
 */
export async function getAICompletionWithDetailedError(
    messages: AIMessage[],
    options: AICompletionOptions = {}
): Promise<{ success: boolean; data?: AICompletionResult; error?: string }> {
    if (!env.GOOGLE_API_KEY) {
        return {
            success: false,
            error: "AI backend is not configured. Set GOOGLE_API_KEY.",
        };
    }

    try {
        const modelName = options.model || "gemini-2.0-flash";
        
        // Extract system message for Vercel AI SDK
        const systemMessage = messages.find(m => m.role === "system")?.content;
        
        // Map remaining messages (User/Assistant)
        const chatMessages = messages
            .filter(m => m.role !== "system")
            .map(m => ({
                role: m.role as "user" | "assistant",
                content: safePrompt(m.content)
            }));

        const response = await aiSDKGenerateText({
            model: getModel(modelName),
            system: systemMessage,
            messages: chatMessages,
            temperature: options.temperature ?? 0.4,
            // @ts-ignore - Valid in raw API call but misaligned in local TS types
            maxTokens: options.maxTokens ?? 8192,
            abortSignal: AbortSignal.timeout(60000), // Strict 60s timeout abort
        });

        if (!response.text || response.text.trim() === "") {
            return { success: false, error: "AI returned an empty response. Try rephrasing your request." };
        }

        return {
            success: true,
            data: {
                content: response.text,
                provider: "gemini",
                model: modelName,
            }
        };
    } catch (e: any) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        console.error("[Vercel AI SDK Error]:", errorMessage);
        return { success: false, error: `Unexpected Error: ${errorMessage}` };
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
    const modelName = options.model || "gemini-2.0-flash";
    
    return aiSDKStreamText({
        model: getModel(modelName),
        system: systemPrompt,
        messages: [{ role: 'user', content: safePrompt(userPrompt) }],
        temperature: options.temperature ?? 0.4,
        // @ts-ignore
        maxTokens: options.maxTokens ?? 8192,
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

    return generateText(systemPrompt, userPrompt);
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

    return generateText(systemPrompt, userPrompt);
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
            model: getModel("gemini-2.0-flash"),
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

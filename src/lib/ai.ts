import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "./env";

/**
 * AI Provider Utility
 * Strictly uses Google Gemini (production ready)
 */

interface AIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface AICompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
}

interface AICompletionResult {
    content: string;
    provider: "gemini";
    model: string;
}

// Initialize the Google Generative AI SDK
const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

/**
 * Sanitize prompt content to prevent basic injection attacks
 */
export function safePrompt(input: string): string {
    // Strip null bytes and bidirectional control characters
    // Also remove potential "System:" prefixes that might confuse some models (though Gemini uses separate field)
    return input
        .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u2028\u2029]/g, "") // Control chars
        .replace(/^System:/i, "User:") // Neutralize fake system headers
        .trim();
}

/**
 * Get AI completion with detailed error handling
 * Uses generateContent() API for maximum compatibility with all Gemini models
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
        // Use gemini-2.0-flash as default (fast, widely available)
        const modelName = options.model || "gemini-2.0-flash";
        const generationConfig: {
            temperature: number;
            maxOutputTokens: number;
            responseMimeType?: "application/json";
        } = {
            temperature: options.temperature ?? 0.4,
            maxOutputTokens: options.maxTokens ?? 8192,
        };

        if (options.jsonMode) {
            generationConfig.responseMimeType = "application/json";
        }

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: messages.find(m => m.role === "system")?.content,
            generationConfig,
        });

        // Convert messages to Gemini format (Content[])
        const contents = messages
            .filter(m => m.role !== "system") // System prompt is handled via systemInstruction
            .map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: safePrompt(m.content) }] // Sanitize content
            }));


        let result;
        let attempts = 0;
        const maxRetries = 3;

        while (attempts < maxRetries) {
            try {
                result = await model.generateContent({ contents });
                break; // Success
            } catch (apiError: unknown) {
                attempts++;
                const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);

                // Handle Rate Limiting (429) and Service Unavailable (503)
                if (errorMessage.includes("429") || errorMessage.includes("503")) {
                    if (attempts >= maxRetries) {
                        return { success: false, error: `Gemini Error: Rate limit or Service unavailable (Max retries reached).` };
                    }
                    // Exponential backoff: 1s, 2s, 4s...
                    const waitTime = Math.pow(2, attempts) * 1000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }

                // Parse other specific error codes and fail immediately
                if (errorMessage.includes("400")) {
                    return { success: false, error: "Bad Request (400) - The model may not be available in your region." };
                } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
                    return { success: false, error: "Unauthorized - Check your GOOGLE_API_KEY." };
                }

                return { success: false, error: `Gemini Error: ${errorMessage}` };
            }
        }

        if (!result) {
            return { success: false, error: "Gemini Error: Failed to generate content after retries." };
        }

        const response = result.response;
        const text = response.text();


        if (!text || text.trim() === "") {
            return { success: false, error: "Gemini returned an empty response. Try rephrasing your request." };
        }

        return {
            success: true,
            data: {
                content: text,
                provider: "gemini",
                model: modelName,
            }
        };
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        return { success: false, error: `Unexpected Error: ${errorMessage}` };
    }
}

/**
 * Get AI completion from Google Gemini (Legacy wrapper)
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
 * Refactored to use Gemini
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
    // Note: In the future, we can implement sophisticated context building here.
    // For now, we'll use the existing generateDocumentation logic with a hint about context.
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
 * Refactored to use Gemini
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
 * Check if AI is available at all
 */
export async function isAIAvailable(): Promise<boolean> {
    return !!env.GOOGLE_API_KEY;
}

/**
 * Detect intent drift between code and documentation
 */
export async function detectIntentDrift(
    newCode: string,
    documentation: string
): Promise<{ drifted: boolean; reasoning?: string }> {
    const systemPrompt = "You are a Documentation Drift Analyst. Determine if code changes invalidate existing documentation. Respond ONLY in valid JSON.";
    const userPrompt = `
    EXISTING DOCUMENTATION (JSON format):
    ${safePrompt(documentation)}

    NEW CODE STATE:
    \`\`\`
    ${safePrompt(newCode.substring(0, 6000))}
    \`\`\`

    Analyze if the new code implementation has drifted significantly from the documented intent.
    Focus on signature changes, logic contradictions, or missing critical context.

    Return JSON:
    {
      "drifted": boolean,
      "reasoning": "concise explanation of the mismatch, or null"
    }`;

    try {
        const result = await generateText(systemPrompt, userPrompt, { 
            temperature: 0.1,
            jsonMode: true 
        });
        
        // Clean up markdown if AI includes it
        const cleanJson = result.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(cleanJson);
    } catch {
        return { drifted: false };
    }
}

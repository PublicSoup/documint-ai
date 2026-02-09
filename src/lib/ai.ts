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
 * Generate mock AI responses for dev mode (no API key)
 */
function generateMockResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    // File creation requests
    if (lowerMessage.includes("create") && (lowerMessage.includes("file") || lowerMessage.includes("component"))) {
        return `# Mock Mode Active 🔧

I'm running in **mock mode** because \`GOOGLE_API_KEY\` is not configured.

**To enable full AI features:**
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Add it to your \`.env\` file:
   \`\`\`
   GOOGLE_API_KEY="your-api-key-here"
   \`\`\`
3. Restart the dev server

**For now, you can still:**
- Create files manually using the New File button
- Edit files in the editor
- Use the dashboard features

Would you like me to show you how to get an API key?`;
    }

    // Help requests
    if (lowerMessage.includes("help") || lowerMessage.includes("how")) {
        return `# DocuMint AI - Mock Mode 🤖

I'm your AI coding assistant! Currently running in **mock mode**.

**To unlock full AI capabilities:**
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a free API key
3. Add \`GOOGLE_API_KEY\` to your \`.env\` file

**Available features in mock mode:**
- ✅ File creation (manual)
- ✅ Code editing
- ✅ Dashboard navigation
- ❌ AI code generation
- ❌ AI explanations`;
    }

    // Default response
    return `# AI Mock Mode Active 🔧

Thanks for your message! I'm currently in **mock mode** because no \`GOOGLE_API_KEY\` is configured in your \`.env\` file.

**Quick Setup:**
1. Get your free key: [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Add to \`.env\`: \`GOOGLE_API_KEY="your-key"\`
3. Restart: \`npm run dev\`

The dashboard and file operations still work - only AI responses are mocked!`;
}

/**
 * Get AI completion with detailed error handling
 * Uses generateContent() API for maximum compatibility with all Gemini models
 */
export async function getAICompletionWithDetailedError(
    messages: AIMessage[],
    options: AICompletionOptions = {}
): Promise<{ success: boolean; data?: AICompletionResult; error?: string }> {
    // MOCK MODE: When no API key, provide helpful mock responses
    if (!env.GOOGLE_API_KEY) {
        console.warn("⚠️ [AI Mock Mode] GOOGLE_API_KEY not configured - using mock responses");
        const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content || "";

        const mockResponse = generateMockResponse(lastUserMessage);
        return {
            success: true,
            data: {
                content: mockResponse,
                provider: "gemini",
                model: "mock-mode"
            }
        };
    }

    try {
        // Use gemini-1.5-flash as default (free tier, widely available)
        const modelName = options.model || "gemini-1.5-flash";
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: options.temperature ?? 0.4,
                maxOutputTokens: options.maxTokens ?? 4096,
            }
        });

        // Build a single prompt from all messages
        // This approach works with ALL Gemini models (no systemInstruction dependency)
        let fullPrompt = "";
        for (const msg of messages) {
            if (msg.role === "system") {
                fullPrompt += `<system>\n${msg.content}\n</system>\n\n`;
            } else if (msg.role === "user") {
                fullPrompt += `<user>\n${msg.content}\n</user>\n\n`;
            } else if (msg.role === "assistant") {
                fullPrompt += `<assistant>\n${msg.content}\n</assistant>\n\n`;
            }
        }

        console.log(`[Gemini] Sending to ${modelName}, prompt length: ${fullPrompt.length}`);

        let result;
        try {
            result = await model.generateContent(fullPrompt);
        } catch (apiError: any) {
            console.error("[Gemini] API Error:", apiError);
            let errorMessage = apiError.message || "Unknown API Error";

            // Parse specific error codes
            if (errorMessage.includes("400")) {
                errorMessage = "Bad Request (400) - The model may not be available in your region.";
            } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
                errorMessage = "Unauthorized - Check your GOOGLE_API_KEY.";
            } else if (errorMessage.includes("429")) {
                errorMessage = "Rate limit exceeded - Try again in a few seconds.";
            } else if (errorMessage.includes("500") || errorMessage.includes("503")) {
                errorMessage = "Gemini service temporarily unavailable.";
            }

            return { success: false, error: `Gemini Error: ${errorMessage}` };
        }

        const response = result.response;
        const text = response.text();

        console.log(`[Gemini] Response received, length: ${text.length}`);

        if (!text || text.trim() === "") {
            console.warn("[Gemini] Empty response. Candidates:", JSON.stringify(response.candidates, null, 2));
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
    } catch (e: any) {
        console.error("[Gemini] Unhandled error:", e);
        return { success: false, error: `Unexpected Error: ${e.message || "Unknown error"}` };
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
    type: 'file' | 'function' | 'class' | 'complex_logic' = 'file'
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

Code:
\`\`\`${language}
${code}
\`\`\``;
    } else if (type === 'class') {
        userPrompt = `Generate documentation for this ${language} class.
Include:
- **Purpose**: What this class represents and its responsibilities
- **Key Methods**: Overview of main methods and their purposes
- **Usage**: How to instantiate and use this class

Code:
\`\`\`${language}
${code}
\`\`\``;
    } else if (type === 'complex_logic') {
        userPrompt = `Explain this complex ${language} code block clearly.
Focus on:
- What the code accomplishes
- Why it uses this particular approach
- Any important edge cases

Code:
\`\`\`${language}
${code}
\`\`\``;
    } else {
        userPrompt = `Analyze this ${language} file and provide a concise summary.
Include:
- **Purpose**: Main responsibility of this file
- **Key Exports**: Important functions, classes, or components
- **Dependencies**: Notable imports

Code:
\`\`\`${language}
${code.slice(0, 2000)}
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
    relatedFileIds: string[] = []
): Promise<string> {
    // Note: In the future, we can implement sophisticated context building here.
    // For now, we'll use the existing generateDocumentation logic with a hint about context.
    const systemPrompt = "You are DocuMint AI, an expert technical documentation assistant with full codebase awareness.";
    const userPrompt = `Contextual analysis for ${type} in ${language}.
    
File ID: ${fileId}
Related Files: ${relatedFileIds.join(", ")}

CODE:
\`\`\`${language}
${code}
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

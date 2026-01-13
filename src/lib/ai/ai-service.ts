import OpenAI from 'openai';
import { env } from '@/lib/env';

const openai = new OpenAI({
    apiKey: env.AI_PROVIDER === 'ollama' ? 'ollama' : env.OPENAI_API_KEY,
    baseURL: env.AI_PROVIDER === 'ollama' ? env.LOCAL_AI_URL : undefined,
});

export interface CodeContext {
    language: string;
    relatedFunctions: string[];
    imports: string[];
    usageExamples: string;
    complexityScore: number;
    isLegacy: boolean;
    style: 'jsdoc' | 'docstring' | 'markdown';
}

export interface Documentation {
    content: string;
    tokensUsed: number;
    processingTime: number;
}

function buildDocumentationPrompt(code: string, context: CodeContext): string {
    return `
You are an expert code documentation generator. Generate comprehensive documentation.

CODE TO DOCUMENT:
\`\`\`${context.language}
${code}
\`\`\`

CONTEXT (This makes us different from competitors):
- Related Functions: ${context.relatedFunctions.join(", ")}
- Dependencies: ${context.imports.join(", ")}
- Usage Examples: ${context.usageExamples}
- Code Complexity: ${context.complexityScore}/10
- This code is ${context.isLegacy ? "legacy" : "modern"} code

REQUIREMENTS:
1. Explain what the code does IN THE CONTEXT OF THIS CODEBASE.
2. Reference related functions, shared symbols, and architectural dependencies.
3. Document all parameters and return values with technical precision.
4. Provide realistic usage examples based on actual codebase patterns.
5. Identify why the code is structured this way (design patterns, etc.).
6. Follow ${context.language} documentation standards rigorously.
7. Make it clear for both developers and non-developers.
${context.isLegacy ? "8. Explain historical context and suggest modern alternatives." : ""}

Generate documentation in ${context.style} format.
${context.isLegacy ? "IMPORTANT: This is LEGACY code. Focus heavily on EXPLAINING the original developer's intent, identifying potential bugs, and suggesting safer modern patterns." : ""}
     `.trim();
}

/**
 * AI INTEGRATION PATTERN
 * Generates comprehensive documentation using OpenAI GPT-4.
 */
export async function generateDocumentation(code: string, context: CodeContext): Promise<Documentation> {
    const startTime = Date.now();
    try {
        const prompt = buildDocumentationPrompt(code, context);

        const response = await openai.chat.completions.create({
            model: env.AI_PROVIDER === 'ollama' ? env.LOCAL_AI_MODEL : "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3, // Lower for consistent docs
        });

        const content = response.choices[0].message.content || 'Failed to generate content.';
        const endTime = Date.now();

        return {
            content,
            tokensUsed: response.usage?.total_tokens || 0,
            processingTime: endTime - startTime,
        };
    } catch (error) {
        console.error("AI generation failed", { error, code: code.substring(0, 100) });
        throw new Error("Failed to generate documentation");
    }
}

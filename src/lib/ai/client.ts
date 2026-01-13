import OpenAI from "openai";
import { buildFullCodebaseContext, ADVANCED_SYSTEM_PROMPT } from "../context-builder";

// Configure for local LM Studio
const LM_STUDIO_URL = process.env.NEXT_PUBLIC_LM_STUDIO_URL || "http://localhost:1234/v1";

const client = new OpenAI({
    baseURL: LM_STUDIO_URL,
    apiKey: "lm-studio",
});

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
});

// Auto-detect model name (cached after first call)
let cachedModelName: string | null = null;

async function getModelName(): Promise<string> {
    if (cachedModelName) return cachedModelName;

    const envModel = process.env.NEXT_PUBLIC_LM_STUDIO_MODEL_NAME || process.env.LM_STUDIO_MODEL;
    if (envModel && envModel.toLowerCase() !== 'auto') {
        cachedModelName = envModel;
        return envModel;
    }

    try {
        const models = await client.models.list();
        if (models.data && models.data.length > 0) {
            // Filter out embedding models if possible, or just take the first one
            const chatModel = models.data.find(m => !m.id.includes('embed')) || models.data[0];
            cachedModelName = chatModel.id;
            console.log('✓ Auto-detected LM Studio model:', cachedModelName);
            return cachedModelName;
        }
    } catch (error) {
        console.warn('Could not auto-detect model, using fallback');
    }

    return "qwen2.5-coder-7b-instruct";
}

/**
 * Generate documentation with FULL CODEBASE AWARENESS
 * This function fetches the entire project context and includes it in the prompt
 */
export async function generateDocumentationWithContext(
    code: string,
    language: string,
    type: 'file' | 'function' | 'class' | 'complex_logic',
    userId: string,
    fileId: string,
    relatedFileIds: string[] = []
): Promise<string> {
    try {
        // Build full codebase context
        const codebaseContext = await buildFullCodebaseContext(userId, fileId, relatedFileIds);

        const systemPrompt = `${ADVANCED_SYSTEM_PROMPT}

CODEBASE CONTEXT:
${codebaseContext}

---
Now analyze the TARGET CODE below with full awareness of the codebase above.
`;

        let userPrompt = "";

        if (type === 'function') {
            userPrompt = `Generate comprehensive documentation for this ${language} function.

CROSS-REFERENCE: Check the codebase context above to see:
- Where this function is called from
- What modules it depends on
- How it fits into the overall architecture

Structure your response:
- **Summary**: What it does and its role in the system
- **Parameters**: Each param with type and purpose
- **Returns**: Return value and type
- **Dependencies**: Imports and modules it relies on
- **Used By**: Where this might be called (based on codebase context)
- **Example**: Practical usage

TARGET CODE:
\`\`\`${language}
${code}
\`\`\``;
        } else if (type === 'class') {
            userPrompt = `Generate documentation for this ${language} class with codebase awareness.

CROSS-REFERENCE the codebase context to understand:
- How this class is instantiated elsewhere
- Related classes or interfaces
- The design pattern being used

Include:
- **Purpose**: Role in the system architecture
- **Relationships**: How it connects to other components
- **Key Methods**: Main methods and their purposes
- **Usage Pattern**: How to use this class

TARGET CODE:
\`\`\`${language}
${code}
\`\`\``;
        } else if (type === 'complex_logic') {
            userPrompt = `Explain this complex ${language} code with full codebase context.

Use the codebase context to:
- Identify what data flows into this code
- Trace where results are used
- Explain the broader purpose

Focus on:
- What it accomplishes in the system
- Why this approach was chosen
- Edge cases and assumptions
- Impact on other components

TARGET CODE:
\`\`\`${language}
${code}
\`\`\``;
        } else {
            // File summary with full context
            userPrompt = `Analyze this ${language} file with FULL CODEBASE AWARENESS.

Using the codebase context above, explain:
1. **Purpose**: What role this file plays in the overall architecture
2. **Dependencies**: What it imports and why
3. **Exports**: What it provides to other files
4. **Integration Points**: How other files use this one
5. **Key Components**: Main classes, functions, or exports
6. **Recommendations**: Potential improvements based on codebase patterns

TARGET FILE:
\`\`\`${language}
${code.slice(0, 4000)}
\`\`\``;
        }

        const modelName = await getModelName();

        try {
            const response = await client.chat.completions.create({
                model: modelName,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 2048,
            });
            return response.choices[0]?.message?.content || "No documentation generated.";
        } catch (lmError) {
            console.warn("LM Studio failed, falling back to OpenAI", lmError);
            if (process.env.OPENAI_API_KEY) {
                const response = await openaiClient.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 2048,
                });
                return response.choices[0]?.message?.content || "No documentation generated.";
            }
            throw lmError;
        }
    } catch (error) {
        console.error("AI Generation Error:", error);
        return "⚠️ Error generating documentation. Ensure LM Studio is running or check OpenAI API Key.";
    }
}

/**
 * Legacy function for backward compatibility (no codebase context)
 */
export async function generateDocumentation(
    code: string,
    language: string,
    type: 'file' | 'function' | 'class' | 'complex_logic' = 'file'
): Promise<string> {
    try {
        let prompt = "";
        let systemPrompt = "You are DocuMint AI, an expert technical documentation assistant.";

        if (type === 'function') {
            prompt = `Generate comprehensive documentation for this ${language} function.

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
            prompt = `Generate documentation for this ${language} class.

Include:
- **Purpose**: What this class represents and its responsibilities
- **Key Methods**: Overview of main methods and their purposes
- **Usage**: How to instantiate and use this class

Code:
\`\`\`${language}
${code}
\`\`\``;
        } else if (type === 'complex_logic') {
            prompt = `Explain this complex ${language} code block clearly.

Focus on:
- What the code accomplishes
- Why it uses this particular approach
- Any important edge cases

Code:
\`\`\`${language}
${code}
\`\`\``;
        } else {
            prompt = `Analyze this ${language} file and provide a concise summary.

Include:
- **Purpose**: Main responsibility of this file
- **Key Exports**: Important functions, classes, or components
- **Dependencies**: Notable imports

Code:
\`\`\`${language}
${code.slice(0, 2000)}
\`\`\``;
        }

        const modelName = await getModelName();

        try {
            const response = await client.chat.completions.create({
                model: modelName,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 1024,
            });
            return response.choices[0]?.message?.content || "No documentation generated.";
        } catch (lmError) {
            console.warn("LM Studio failed, falling back to OpenAI", lmError);
            if (process.env.OPENAI_API_KEY) {
                const response = await openaiClient.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 1024,
                });
                return response.choices[0]?.message?.content || "No documentation generated.";
            }
            throw lmError;
        }
    } catch (error) {
        console.error("AI Generation Error:", error);
        return "⚠️ Error generating documentation. Ensure LM Studio is running or check OpenAI API Key.";
    }
}

/**
 * Analyze entire codebase and generate comprehensive report
 */
export async function analyzeFullCodebase(userId: string): Promise<string> {
    try {
        const context = await buildFullCodebaseContext(userId, "", []);

        const systemPrompt = `You are a Principal Architect performing a comprehensive codebase review.
Analyze the entire project structure and provide insights.`;

        const userPrompt = `Given this complete codebase overview, provide:

1. **Architecture Summary**: Overall structure and patterns used
2. **Key Components**: Most important files and their roles
3. **Dependency Graph**: How modules connect
4. **Code Quality**: Overall assessment and scores
5. **Recommendations**: Top 5 improvements to make
6. **Technical Debt**: Areas that need refactoring
7. **Security Considerations**: Potential vulnerabilities

CODEBASE:
${context}`;

        const modelName = await getModelName();

        const response = await client.chat.completions.create({
            model: modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 4096,
        });

        return response.choices[0]?.message?.content || "Analysis failed.";
    } catch (error) {
        console.error("Codebase Analysis Error:", error);
        return "⚠️ Error analyzing codebase.";
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import OpenAI from "openai";

// Configure for local LM Studio or OpenAI fallback
const LM_STUDIO_URL = process.env.NEXT_PUBLIC_LM_STUDIO_URL || "http://localhost:1234/v1";
const client = new OpenAI({
    baseURL: LM_STUDIO_URL,
    apiKey: "lm-studio",
});

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
});

const AI_ARCHITECT_SYSTEM_PROMPT = `You are the AI Architect, a Senior Staff Software Engineer paired with a developer.
Your goal is to provide high-level architectural advice, code refactoring, and deep technical insights.

## Core Persona
- **Expertise**: Distributed systems, clean architecture, performance optimization, and security patterns.
- **Tone**: Professional, precise, encouraging, and highly technical. Avoid fluff.
- **Thinking Process**: You MUST think step-by-step before answering. Wrap your reasoning in <thinking> tags.

## Responsibilities
- Analyze the user's code and query.
- Identify potential bugs, security flaws, or architectural violations.
- Suggest concrete, actionable improvements.
- If asked to write code, provide production-ready solutions with comments explaining the "why".

## Formatting Rules
- Use Markdown.
- Use <thinking>...</thinking> to show your internal monologue and plan.
- Use code blocks with language identifiers.
`;

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { fileId, code, chatHistory, userPrompt } = await req.json();

        if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        // Construct the messages array
        const messages: any[] = [
            { role: "system", content: AI_ARCHITECT_SYSTEM_PROMPT }
        ];

        // Add file context
        if (code) {
            messages.push({
                role: "system",
                content: `Current File Context:\n\`\`\`typescript\n${code.slice(0, 8000)}\n\`\`\``
            });
        }

        // Add chat history (last 10 messages to save context window)
        if (chatHistory && Array.isArray(chatHistory)) {
            messages.push(...chatHistory.slice(-10));
        }

        // Add user's new prompt
        messages.push({ role: "user", content: userPrompt });

        // Call AI
        let responseContent = "";
        try {
            // Try LM Studio first
            try {
                const response = await client.chat.completions.create({
                    model: process.env.LM_STUDIO_MODEL || "qwen2.5-coder-7b-instruct",
                    messages: messages,
                    temperature: 0.3, // Lower temperature for more precise architectural advice
                    max_tokens: 2048,
                });
                responseContent = response.choices[0]?.message?.content || "No response generated.";
            } catch (e) {
                console.warn("LM Studio failed, falling back to OpenAI", e);
                // Fallback to OpenAI
                const response = await openaiClient.chat.completions.create({
                    model: "gpt-4o", // Use a smart model for Architect
                    messages: messages,
                    temperature: 0.2, // Precise
                });
                responseContent = response.choices[0]?.message?.content || "No response generated.";
            }
        } catch (error) {
            console.error("AI Generation Error:", error);
            return NextResponse.json({ error: "Failed to generate response." }, { status: 500 });
        }

        return NextResponse.json({ response: responseContent });

    } catch (error) {
        console.error("AI Architect API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateText } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check feature access
    const gateResponse = await requireFeature("rulesetGenerator");
    if (gateResponse) return gateResponse;

    try {
        const { type, context, requirements } = await req.json();

        const systemPrompt = `You are an expert AI prompt engineer specializing in IDE agents like Cursor, Cline, and Gemini.
        Your task is to generate a comprehensive ruleset or system prompt (e.g., .cursorrules) based on the user's project context.
        The output should be highly technical, clear, and optimized for the specific tool requested.`;

        const userPrompt = `
        Tool: ${type}
        Project Context: ${context}
        Custom Requirements: ${requirements}

        Generate a complete ruleset. If it's for Cursor, format it as a .cursorrules file content. 
        If it's for Cline or Gemini, provide a structured system prompt.
        Include sections for:
        - Project Overview
        - Coding Standards
        - Preferred Libraries/Frameworks
        - Architecture Rules
        - Step-by-step Instructions for the AI
        
        Output ONLY the content of the ruleset/prompt.
        `.trim();

        const result = await generateText(systemPrompt, userPrompt);

        return NextResponse.json({ ruleset: result });

    } catch (error) {
        console.error("Ruleset generation error:", error);
        return NextResponse.json({ error: "Failed to generate ruleset" }, { status: 500 });
    }
}

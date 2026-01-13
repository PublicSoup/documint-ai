import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { getFileContent } from "../../../lib/files";

type Persona = "junior" | "senior" | "nontechnical" | "default";

const PERSONA_PROMPTS: Record<Persona, string> = {
    junior: `You are explaining code to a junior developer who is still learning. 
Use simple language, avoid jargon, and explain concepts step by step. 
Include analogies and real-world examples. 
Explain WHY things are done, not just WHAT they do.
Be encouraging and patient in your explanations.`,

    senior: `You are providing a technical brief for a senior engineer.
Be concise and focus on architecture, design patterns, and edge cases.
Highlight performance implications, trade-offs, and potential issues.
Assume deep familiarity with the language and frameworks.
Focus on the "interesting" parts - unusual patterns, clever solutions, or potential problems.`,

    nontechnical: `You are explaining this code to a non-technical stakeholder (product manager, executive).
Focus on WHAT the code does from a business perspective, not HOW.
Use plain English with no technical terms.
Relate functionality to business outcomes and user experience.
Keep it very brief - 2-3 sentences maximum per section.`,

    default: `You are a helpful code documentation assistant.
Provide clear, comprehensive documentation suitable for any developer.
Balance technical accuracy with accessibility.`
};

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { fileId, persona } = await request.json() as { fileId: string; persona: Persona };

        if (!fileId || !persona) {
            return NextResponse.json({ error: "fileId and persona are required" }, { status: 400 });
        }

        // Get the file
        const file = await db.file.findUnique({
            where: { id: fileId, userId: session.user.id },
            include: { documentation: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Get content (from DB or Storage)
        const content = await getFileContent(fileId);

        if (!content) {
            return NextResponse.json({ error: "File content not found" }, { status: 404 });
        }

        // Get LM Studio URL
        const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234";

        // Get model name
        let modelName = "qwen2.5-coder-7b-instruct";
        try {
            const modelsRes = await fetch(`${LM_STUDIO_URL}/v1/models`);
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                if (modelsData.data && modelsData.data.length > 0) {
                    modelName = modelsData.data[0].id;
                }
            }
        } catch { }

        const personaPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.default;

        const prompt = `${personaPrompt}

Analyze and document the following ${file.language} code:

\`\`\`${file.language}
${content.substring(0, 4000)}
\`\`\`

Provide a comprehensive explanation in this persona's style.`;

        const aiRes = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: "system", content: personaPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.4,
                max_tokens: 2048
            }),
        });

        if (!aiRes.ok) {
            return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
        }

        const aiData = await aiRes.json();
        const explanation = aiData.choices?.[0]?.message?.content || "Unable to generate explanation.";

        return NextResponse.json({
            persona,
            explanation,
            fileName: file.name,
            language: file.language,
        });
    } catch (error) {
        console.error("Persona explanation error:", error);
        return NextResponse.json({ error: "Failed to generate explanation" }, { status: 500 });
    }
}

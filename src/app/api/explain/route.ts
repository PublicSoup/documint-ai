import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../lib/db";
import { getFileContent } from "../../../lib/files";
import { getAICompletion } from "@/lib/ai";

type Persona = "junior" | "senior" | "nontechnical" | "default";

const PERSONA_PROMPTS: Record<Persona, string> = {
    junior: `You are explaining code to someone still learning programming.
Start with: "Sure! Let's break this down..."
Give short, clear explanations using simple terms.
Avoid jargon unless necessary—then briefly define it.
Use analogies if helpful.
Focus on what the code does, not theory.
Keep total response under 150 words.

Example format:
\`\`\`javascript
console.log('hello');
\`\`\`
This outputs "hello" to the console - commonly used for debugging.`,

    senior: `You are giving a quick technical overview to an experienced developer.
Start with: "Here's what this code does:"
Be concise and focus on purpose, patterns, and gotchas.
Skip basics. Assume strong programming knowledge.
Highlight anything clever, risky, or non-obvious.
Keep total response under 100 words.

Example format:
\`\`\`javascript
console.log('hello');
\`\`\`
Logs output to console for debugging/testing.`,

    nontechnical: `You're explaining this to a manager or stakeholder who isn't technical.
Start with: "In simple terms..."
Use plain English, no code terms.
Say what the code achieves, not how.
One sentence summary is enough.
Keep total response under 50 words.

Example format:
In simple terms, this code tells the computer to display the word "hello".`,

    default: `You're helping any developer understand the code quickly.
Start with: "Let me walk you through this:"
Explain clearly but don't overdo it.
Cover main logic and key functions.
Keep total response under 120 words.

Example format:
\`\`\`javascript
console.log('hello');
\`\`\`
This tiny program just prints the word "hello" to the console.
It's often used as a starting point in coding tutorials.`
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

        const personaPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.default;

        const prompt = `${personaPrompt}

Analyze and document the following ${file.language} code:

\`\`\`${file.language}
${content.substring(0, 4000)}
\`\`\`

Provide a comprehensive explanation in this persona's style.`;

        // Call centralized Gemini service
        const aiResult = await getAICompletion([
            { role: "system", content: personaPrompt },
            { role: "user", content: prompt }
        ], {
            temperature: 0.4,
            maxTokens: 2048
        });

        if (!aiResult) {
            return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
        }

        const explanation = aiResult.content || "Unable to generate explanation.";

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

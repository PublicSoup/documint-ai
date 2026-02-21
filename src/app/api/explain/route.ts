import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { getAICompletion } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireFeature } from "@/lib/feature-gate";
import { checkFilePermission } from "@/lib/permissions";

const explainSchema = z.object({
    fileId: z.string().min(1),
    persona: z.enum(["junior", "senior", "nontechnical", "default"]).default("default"),
}).strict();

type Persona = z.infer<typeof explainSchema>["persona"];

const PERSONA_PROMPTS: Record<Persona, string> = {
    junior: `You are explaining code to someone still learning programming.
Start with: "Sure! Let's break this down..."
Give short, clear explanations using simple terms.
Avoid jargon unless necessary—then briefly define it.
Use analogies if helpful.
Focus on what the code does, not theory.
Keep total response under 150 words.`,

    senior: `You are giving a quick technical overview to an experienced developer.
Start with: "Here's what this code does:"
Be concise and focus on purpose, patterns, and gotchas.
Skip basics. Assume strong programming knowledge.
Highlight anything clever, risky, or non-obvious.
Keep total response under 100 words.`,

    nontechnical: `You're explaining this to a manager or stakeholder who isn't technical.
Start with: "In simple terms..."
Use plain English, no code terms.
Say what the code achieves, not how.
One sentence summary is enough.
Keep total response under 50 words.`,

    default: `You're helping any developer understand the code quickly.
Start with: "Let me walk you through this:"
Explain clearly but don't overdo it.
Cover main logic and key functions.
Keep total response under 120 words.`,
};

export async function POST(request: NextRequest) {
    const gateResponse = await requireFeature("codeExplain");
    if (gateResponse) return gateResponse;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "free");

        const parsed = explainSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileId, persona } = parsed.data;

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { name: true, language: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return NextResponse.json({ error: "File content not found" }, { status: 404 });
        }

        const personaPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.default;
        const prompt = `${personaPrompt}

Analyze and document the following ${file.language || "code"}:

\`\`\`${file.language || "text"}
${content.slice(0, 6000)}
\`\`\`

Provide a concise explanation in this persona's style.`;

        const aiResult = await getAICompletion(
            [
                { role: "system", content: personaPrompt },
                { role: "user", content: prompt },
            ],
            {
                temperature: 0.4,
                maxTokens: 2048,
            }
        );

        if (!aiResult?.content) {
            return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "EXPLAIN_CODE",
                entity: "File",
                entityId: fileId,
                details: {
                    persona,
                    language: file.language,
                    fileName: file.name,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            persona,
            explanation: aiResult.content,
            fileName: file.name,
            language: file.language,
        });
    } catch (error) {
        console.error("Persona explanation error:", error);
        return NextResponse.json({ error: "Failed to generate explanation" }, { status: 500 });
    }
}

import { z } from "zod";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { getAICompletion } from "@/lib/ai";
import { checkFilePermission } from "@/lib/permissions";
import { createApiHandler, ApiErrors } from "@/lib/api-utils";

const explainSchema = z.object({
    fileId: z.string().trim().min(1, "File ID is required."),
    persona: z.enum(["junior", "senior", "nontechnical", "default"]).default("default"),
}).strict();

type Persona = z.infer<typeof explainSchema>["persona"];

const PERSONA_PROMPTS: Record<Persona, string> = {
    junior: `You are explaining code to someone still learning programming. Start with: "Sure! Let's break this down..." Give short, clear explanations using simple terms. Avoid jargon unless necessary—then briefly define it. Use analogies if helpful. Focus on what the code does, not theory. Keep total response under 150 words.`,
    senior: `You are giving a quick technical overview to an experienced developer. Start with: "Here's what this code does:" Be concise and focus on purpose, patterns, and gotchas. Skip basics. Assume strong programming knowledge. Highlight anything clever, risky, or non-obvious. Keep total response under 100 words.`,
    nontechnical: `You're explaining this to a manager or stakeholder who isn't technical. Start with: "In simple terms..." Use plain English, no code terms. Say what the code achieves, not how. One sentence summary is enough. Keep total response under 50 words.`,
    default: `You're helping any developer understand the code quickly. Start with: "Let me walk you through this:" Explain clearly but don't overdo it. Cover main logic and key functions. Keep total response under 120 words.`,
};

export const POST = createApiHandler({
    feature: "codeExplain",
    rateLimit: "pro",
    bodySchema: explainSchema,
    audit: {
        action: "EXPLAIN_CODE",
        entity: "File",
        entityId: (body) => body.fileId,
        details: (body) => ({ persona: body.persona }),
    },
    handler: async ({ body, session }) => {
        const { fileId, persona } = body;
        
        const hasPermission = await checkFilePermission(session.user.id, fileId, "view");
        if (!hasPermission) {
            throw ApiErrors.forbidden("You do not have permission to view this file.");
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { name: true, language: true },
        });
        if (!file) {
            throw ApiErrors.notFound("File");
        }

        const content = await getFileContent(fileId);
        if (content === null) {
            throw ApiErrors.notFound("File content");
        }

        const personaPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.default;
        const prompt = `${personaPrompt}\n\nAnalyze and document the following ${file.language || "code"}:\n\n\`\`\`${file.language || "text"}\n${content.slice(0, 6000)}\n\`\`\`\n\nProvide a concise explanation in this persona's style.`;

        const aiResult = await getAICompletion(
            [{ role: "system", content: personaPrompt }, { role: "user", content: prompt }],
            { temperature: 0.4, maxTokens: 2048 }
        );

        if (!aiResult?.content) {
            throw ApiErrors.internalError("AI generation failed.");
        }

        return {
            persona,
            explanation: aiResult.content,
            fileName: file.name,
            language: file.language,
        };
    },
});

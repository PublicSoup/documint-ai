import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { getAICompletion } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { buildProjectGraph } from "@/lib/graph/project-graph";
import { requireFeature } from "@/lib/feature-gate";
import { checkFilePermission } from "@/lib/permissions";

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

interface AIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

const chatHistoryMessageSchema = z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(10_000),
}).strict();

const architectRequestSchema = z.object({
    fileId: z.string().min(1).max(255).optional(),
    code: z.string().max(80_000).optional(),
    chatHistory: z.array(chatHistoryMessageSchema).max(30).default([]),
    userPrompt: z.string().trim().min(1).max(8_000),
}).strict();

export async function POST(req: NextRequest) {
    const gateResponse = await requireFeature("aiArchitect");
    if (gateResponse) return gateResponse;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(session.user.id, "free");

        const parsed = architectRequestSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid AI Architect payload" }, { status: 400 });
        }

        const { fileId, code, chatHistory, userPrompt } = parsed.data;

        if (fileId) {
            const canView = await checkFilePermission(session.user.id, fileId, "view");
            if (!canView) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        let projectContext = "";
        let styleGuide = "";

        try {
            if (fileId) {
                const currentFile = await db.file.findUnique({
                    where: { id: fileId },
                    select: { name: true, teamId: true, userId: true },
                });

                if (currentFile) {
                    if (currentFile.teamId) {
                        const teamConfig = await db.integration.findFirst({
                            where: { teamId: currentFile.teamId, type: "TEAM_CONFIG" },
                        });
                        styleGuide = (teamConfig?.config as { styleGuide?: string } | null)?.styleGuide || "";
                    }

                    const siblingFiles = await db.file.findMany({
                        where: currentFile.teamId
                            ? { teamId: currentFile.teamId }
                            : { userId: currentFile.userId, teamId: null },
                        select: {
                            id: true,
                            name: true,
                            content: true,
                            documentation: { select: { content: true } },
                        },
                        take: 40,
                    });

                    const graphFiles = siblingFiles.map((file) => ({ path: file.name, content: file.content || "" }));
                    const graph = await buildProjectGraph(graphFiles);

                    const relatedFileNames = new Set<string>();
                    graph.edges.forEach((edge) => {
                        if (edge.from === currentFile.name) relatedFileNames.add(edge.to);
                        if (edge.to === currentFile.name) relatedFileNames.add(edge.from);
                    });

                    const relatedSummaries = siblingFiles
                        .filter((file) => relatedFileNames.has(file.name) && file.id !== fileId)
                        .map((file) => {
                            let summary = "Documentation not yet generated.";
                            if (file.documentation?.content) {
                                try {
                                    const doc = JSON.parse(file.documentation.content) as { summary?: string };
                                    summary = typeof doc.summary === "string" && doc.summary.trim() ? doc.summary : summary;
                                } catch {
                                    // Keep default summary when malformed.
                                }
                            }
                            return `- **${file.name}**: ${summary}`;
                        });

                    if (relatedSummaries.length > 0) {
                        projectContext = `\n## Project Context (Architecture Neighbors)\nThese files are linked to the current file via imports/exports:\n${relatedSummaries.join("\n")}\n`;
                    }
                }
            }
        } catch (contextError) {
            console.warn("Failed to build project context for AI Architect:", contextError);
        }

        const messages: AIMessage[] = [{ role: "system", content: AI_ARCHITECT_SYSTEM_PROMPT }];

        if (styleGuide) {
            messages.push({
                role: "system",
                content: `TEAM STYLE GUIDE & INSTRUCTIONS:\n${styleGuide}`,
            });
        }

        if (code) {
            messages.push({
                role: "system",
                content: `Current File Context:\n\`\`\`typescript\n${code.slice(0, 8_000)}\n\`\`\`${projectContext}`,
            });
        } else if (projectContext) {
            messages.push({ role: "system", content: projectContext });
        }

        messages.push(...chatHistory.slice(-10));
        messages.push({ role: "user", content: userPrompt });

        const result = await getAICompletion(messages, {
            temperature: 0.3,
            maxTokens: 2048,
        });

        if (!result?.content) {
            return NextResponse.json({ error: "Failed to generate response." }, { status: 500 });
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "AI_ARCHITECT_QUERY",
                entity: "AI",
                entityId: fileId || "GLOBAL",
                details: {
                    promptLength: userPrompt.length,
                    hasCode: !!code,
                    historyLength: chatHistory.length,
                },
            });
        } catch {
            // Ignore audit logging errors
        }

        if (fileId) {
            try {
                const doc = await db.documentation.findUnique({ where: { fileId } });

                if (doc) {
                    const metadata =
                        doc.metadata && typeof doc.metadata === "object" && !Array.isArray(doc.metadata)
                            ? (doc.metadata as { chatHistory?: AIMessage[]; [key: string]: unknown })
                            : {};
                    const existingHistory = Array.isArray(metadata.chatHistory) ? metadata.chatHistory : [];

                    const newHistory = [
                        ...existingHistory,
                        { role: "user", content: userPrompt } as AIMessage,
                        { role: "assistant", content: result.content } as AIMessage,
                    ].slice(-20);

                    await db.documentation.update({
                        where: { id: doc.id },
                        data: {
                            metadata: {
                                ...(metadata as Record<string, Prisma.InputJsonValue>),
                                chatHistory: newHistory as unknown as Prisma.InputJsonValue,
                            },
                        },
                    });
                }
            } catch (persistError) {
                console.error("Failed to persist AI chat:", persistError);
            }
        }

        return NextResponse.json({ response: result.content });
    } catch (error) {
        console.error("AI Architect API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

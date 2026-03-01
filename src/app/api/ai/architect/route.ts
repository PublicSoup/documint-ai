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
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { getUserSubscription } from "@/lib/subscription";

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
    content: z.string().max(2000, "History message too long"), // Limit individual message history
}).strict();

const architectRequestSchema = z.object({
    fileId: z.string().min(1).max(255).optional(),
    code: z.string().max(30_000, "File content too large for architect analysis").optional(), // Reduced from 80k to 30k for safety
    chatHistory: z.array(chatHistoryMessageSchema).max(10, "History too long").default([]), // Reduced history depth
    userPrompt: z.string().trim().min(1).max(4_000, "Prompt too long"), // Reduced from 8k
}).strict();

export async function POST(req: NextRequest) {
    const gateResponse = await requireFeature("aiArchitect");
    if (gateResponse) return gateResponse;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Rate Limit based on Plan
        const subscription = await getUserSubscription(session.user.id);
        const rateLimitTier = (subscription.isPro || subscription.isTeam) ? "pro" : "free";
        await enforceRateLimit(session.user.id, rateLimitTier);

        const { fileId, code, chatHistory, userPrompt } = await validateBody(req, architectRequestSchema);

        if (fileId) {
            const canView = await checkFilePermission(session.user.id, fileId, "view");
            if (!canView) {
                throw ApiErrors.forbidden();
            }
        }

        let projectContext = "";
        let styleGuide = "";

        // Context Building (Hardened)
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

                    // Limit neighbor search to avoid token explosion
                    const siblingFiles = await db.file.findMany({
                        where: currentFile.teamId
                            ? { teamId: currentFile.teamId }
                            : { userId: currentFile.userId, teamId: null },
                        select: {
                            id: true,
                            name: true,
                            content: true, // Only needed for graph, but we should be careful
                            documentation: { select: { content: true } },
                        },
                        take: 20, // Reduced from 40
                    });

                    // Build graph safely
                    const graphFiles = siblingFiles.map((file) => ({ 
                        path: file.name, 
                        content: (file.content || "").slice(0, 5000) // Truncate content for graph build
                    }));
                    const graph = await buildProjectGraph(graphFiles);

                    const relatedFileNames = new Set<string>();
                    graph.edges.forEach((edge) => {
                        if (edge.from === currentFile.name) relatedFileNames.add(edge.to);
                        if (edge.to === currentFile.name) relatedFileNames.add(edge.from);
                    });

                    const relatedSummaries = siblingFiles
                        .filter((file) => relatedFileNames.has(file.name) && file.id !== fileId)
                        .map((file) => {
                            let summary = "No summary available.";
                            if (file.documentation?.content) {
                                try {
                                    const doc = JSON.parse(file.documentation.content) as { summary?: string };
                                    if (typeof doc.summary === "string" && doc.summary.trim()) {
                                        summary = doc.summary.slice(0, 300); // Truncate summary
                                    }
                                } catch {
                                    // Ignore malformed doc
                                }
                            }
                            return `- **${file.name}**: ${summary}`;
                        });

                    if (relatedSummaries.length > 0) {
                        projectContext = `\n## Project Context\nRelated files:\n${relatedSummaries.join("\n")}\n`;
                    }
                }
            }
        } catch (ctxError) {
            console.warn("Architect context build failed:", ctxError);
            // Non-blocking
        }

        const messages: AIMessage[] = [{ role: "system", content: AI_ARCHITECT_SYSTEM_PROMPT }];

        if (styleGuide) {
            messages.push({
                role: "system",
                content: `STYLE GUIDE:\n${styleGuide.slice(0, 2000)}`, // Truncate style guide
            });
        }

        if (code) {
            messages.push({
                role: "system",
                content: `Current File:\n\`\`\`typescript\n${code.slice(0, 20_000)}\n\`\`\`${projectContext}`,
            });
        } else if (projectContext) {
            messages.push({ role: "system", content: projectContext });
        }

        // Sanitize history roles and content
        const safeHistory = chatHistory.map(msg => ({
            role: (msg.role === "system" ? "user" : msg.role) as "user" | "assistant", // Downgrade system to user
            content: msg.content.slice(0, 2000)
        }));
        
        messages.push(...safeHistory);
        messages.push({ role: "user", content: userPrompt });

        const result = await getAICompletion(messages, {
            temperature: 0.3,
            maxTokens: 2048,
        });

        if (!result?.content) {
            throw ApiErrors.serviceUnavailable("AI Architect is temporarily unavailable.");
        }

        // Audit Logging
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
                    tier: rateLimitTier
                },
            });
        } catch {
            // Ignore
        }

        // Persist Chat History (Async)
        if (fileId) {
            (async () => {
                try {
                    const doc = await db.documentation.findUnique({ where: { fileId } });
                    if (doc) {
                        const metadata = (doc.metadata as { chatHistory?: AIMessage[] } | null) || {};
                        const existingHistory = Array.isArray(metadata.chatHistory) ? metadata.chatHistory : [];
                        
                        const newHistory = [
                            ...existingHistory,
                            { role: "user", content: userPrompt } as AIMessage,
                            { role: "assistant", content: result.content } as AIMessage,
                        ].slice(-10); // Keep last 10 turns max

                        await db.documentation.update({
                            where: { id: doc.id },
                            data: {
                                metadata: {
                                    ...metadata,
                                    chatHistory: newHistory,
                                } as unknown as Prisma.InputJsonValue,
                            },
                        });
                    }
                } catch {
                    // Ignore persistence errors
                }
            })();
        }

        return NextResponse.json({ response: result.content });
    } catch (error) {
        return errorResponse(error);
    }
}

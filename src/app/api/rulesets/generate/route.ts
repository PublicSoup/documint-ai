import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateText } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const rulesetSchema = z.object({
    type: z.enum(["cursor", "cline", "gemini"]),
    context: z.string().trim().min(1).max(6000),
    requirements: z.string().trim().max(6000).default(""),
    teamId: z.string().min(1).optional(),
}).strict();

/**
 * POST /api/rulesets/generate
 * Generates custom AI instructions (rulesets) for IDE agents like Cursor or Cline 
 * based on local project context and documentation style.
 */
export async function POST(req: NextRequest) {
    const gateError = await requireFeature("rulesetGenerator");
    if (gateError) return gateError;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const { type, context, requirements, teamId } = await validateBody(req, rulesetSchema);

        // 2. Extract local documentation styles to maintain consistency
        let documentationStyles = "";
        const docs = await db.documentation.findMany({
            where: teamId
                ? {
                      file: {
                          teamId,
                          team: {
                              members: {
                                  some: { userId: session.user.id },
                              },
                          },
                      },
                  }
                : {
                      file: {
                          userId: session.user.id,
                          teamId: null,
                      },
                  },
            take: 5,
            select: { content: true },
        });

        for (const doc of docs) {
            try {
                const parsedDoc = JSON.parse(doc.content) as { summary?: string };
                if (parsedDoc.summary) {
                    documentationStyles += `Sample Doc Summary: ${parsedDoc.summary}\n`;
                }
            } catch {
                // Non-critical parsing failure
            }
        }

        const systemPrompt = `You are an expert AI prompt engineer specializing in IDE agents like Cursor, Cline, and Gemini.
Your task is to generate a comprehensive ruleset or system prompt based on the user's project context.
The output should be highly technical, clear, and optimized for the requested tool.

LEARNED PROJECT STYLE:
${documentationStyles}`;

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

        // 3. AI Generation Call
        const result = await generateText(systemPrompt, userPrompt, {
            temperature: 0.2,
            maxTokens: 2500,
        });

        if (!result?.trim()) {
            return errorResponse(ApiErrors.internalError("Failed to generate ruleset: No output from AI."));
        }

        // 4. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GENERATE_RULESET",
                entity: "Ruleset",
                entityId: type,
                details: {
                    type,
                    teamId: teamId || null,
                    contextLength: context.length,
                    requirementsLength: requirements.length,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ ruleset: result });
    } catch (error) {
        return errorResponse(error);
    }
}

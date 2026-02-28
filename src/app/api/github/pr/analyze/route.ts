import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { getAICompletion } from "@/lib/ai";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { enforceRateLimit } from "@/lib/rate-limit";

const pullRequestAnalyzeSchema = z
    .object({
        owner: z.string().trim().min(1).max(100),
        repo: z.string().trim().min(1).max(200),
        pullNumber: z.number().int().positive(),
    })
    .strict();

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { owner, repo, pullNumber } = await validateBody(req, pullRequestAnalyzeSchema);

        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id },
            select: { accessToken: true },
        });

        if (!connection?.accessToken) {
            throw ApiErrors.unauthorized("GitHub account not connected");
        }

        const diffUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`;
        const diffRes = await fetch(diffUrl, {
            headers: {
                Authorization: `Bearer ${connection.accessToken}`,
                Accept: "application/vnd.github.v3.diff",
            },
        });

        if (!diffRes.ok) {
            throw ApiErrors.badRequest("Failed to fetch PR diff from GitHub");
        }

        const diffRaw = await diffRes.text();
        const diffTruncated = diffRaw.substring(0, 15000);

        const systemPrompt = `You are a Senior Technical Lead reviewing a Pull Request.
Output STRICT JSON only. No markdown fences. No preamble.
Format:
{
  "summary": "Concise 2-sentence summary of changes",
  "impactScore": number (0-100, where 100 is critical/high impact),
  "breakingChanges": ["List of potential breaking changes" or empty],
  "suggestions": [
     { "file": "filename", "line": number, "comment": "Actionable suggestion" }
  ],
  "securityIssues": ["Potential security risks" or empty]
}`;

        const userPrompt = `Analyze this git diff:
${diffTruncated}

Provide the structured JSON report.`;

        const aiResult = await getAICompletion(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            {
                temperature: 0.2,
                jsonMode: true,
                maxTokens: 2000,
            },
        );

        if (!aiResult?.content) {
            throw ApiErrors.internalError("AI analysis failed");
        }

        const content = aiResult.content.replace(/```json/g, "").replace(/```/g, "").trim();

        const analysis = (() => {
            try {
                return JSON.parse(content) as {
                    summary?: string;
                    impactScore?: number;
                    breakingChanges?: unknown[];
                    suggestions?: unknown[];
                    securityIssues?: unknown[];
                };
            } catch {
                return {
                    summary: "AI analysis generation failed to parse.",
                    impactScore: 0,
                    breakingChanges: [],
                    suggestions: [],
                    securityIssues: [],
                };
            }
        })();

        try {
            const { logAudit } = await import("../../../../../lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "ANALYZE_GITHUB_PR",
                entity: "PullRequest",
                entityId: `${owner}/${repo}/${pullNumber}`,
                details: {
                    owner,
                    repo,
                    pullNumber,
                    impactScore: analysis.impactScore,
                    issueCount: (analysis.securityIssues?.length || 0) + (analysis.suggestions?.length || 0),
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            owner,
            repo,
            pullNumber,
            analysis,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

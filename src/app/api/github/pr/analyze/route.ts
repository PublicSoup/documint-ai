import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { decrypt } from "@/lib/security/encryption";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { enforceRateLimit } from "@/lib/rate-limit";
import { analyzeDiff, evaluateGate, normalizePolicy, toLegacyAnalysis } from "@/lib/code-review";
import { logAudit } from "@/lib/audit-logger";

export const maxDuration = 300;

const pullRequestAnalyzeSchema = z
    .object({
        owner: z.string().trim().min(1).max(100),
        repo: z.string().trim().min(1).max(200),
        pullNumber: z.number().int().positive(),
    })
    .strict();

/**
 * POST /api/github/pr/analyze
 * Manual, on-demand AI review of a pull request from the dashboard. Shares the
 * same review brain as the automatic pipeline (`lib/code-review`) so results
 * are identical; persists a MANUAL CodeReview record but does not post back to
 * GitHub (that is reserved for the automatic, policy-driven path).
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { owner, repo, pullNumber } = await validateBody(req, pullRequestAnalyzeSchema);
        const repoFullName = `${owner}/${repo}`;

        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id },
            select: { accessToken: true },
        });

        if (!connection?.accessToken) {
            throw ApiErrors.unauthorized("GitHub account not connected");
        }

        let token: string;
        try {
            token = decrypt(connection.accessToken);
        } catch {
            throw ApiErrors.internalError("Failed to access GitHub credentials");
        }

        const diffRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3.diff",
                "User-Agent": "documint-ai-code-review",
            },
        });

        if (!diffRes.ok) {
            throw ApiErrors.badRequest("Failed to fetch PR diff from GitHub");
        }

        const diff = await diffRes.text();

        // Honour the repo's saved policy (checks/instructions) if one exists.
        const savedPolicy = await db.reviewPolicy.findUnique({ where: { repoFullName } });
        const policy = normalizePolicy(
            savedPolicy
                ? {
                      enabled: savedPolicy.enabled,
                      autoReview: savedPolicy.autoReview,
                      postComments: savedPolicy.postComments,
                      postStatus: savedPolicy.postStatus,
                      blockingSeverity: savedPolicy.blockingSeverity,
                      checks: savedPolicy.checks,
                      ignorePaths: savedPolicy.ignorePaths,
                      instructions: savedPolicy.instructions,
                  }
                : undefined,
        );

        const result = await analyzeDiff(diff, policy, { userId: session.user.id });
        const gate = evaluateGate(result.findings, policy.blockingSeverity);

        await db.codeReview.create({
            data: {
                kind: "PR",
                repoFullName,
                prNumber: pullNumber,
                title: `PR #${pullNumber}`,
                status: "COMPLETED",
                verdict: gate.verdict,
                summary: result.summary,
                impactScore: result.impactScore,
                riskLevel: result.riskLevel,
                findings: result.findings as unknown as object,
                blocking: gate.blocking,
                source: "MANUAL",
                userId: session.user.id,
                teamId: savedPolicy?.teamId ?? null,
            },
        }).catch(() => undefined);

        try {
            await logAudit({
                userId: session.user.id,
                action: "ANALYZE_GITHUB_PR",
                entity: "PullRequest",
                entityId: `${repoFullName}#${pullNumber}`,
                details: {
                    impactScore: result.impactScore,
                    riskLevel: result.riskLevel,
                    findingCount: result.findings.length,
                    verdict: gate.verdict,
                },
            });
        } catch {
            // Non-blocking
        }

        // Preserve the legacy response shape consumed by <PrAnalysisView />.
        return NextResponse.json({
            owner,
            repo,
            pullNumber,
            analysis: toLegacyAnalysis(result),
            review: {
                riskLevel: result.riskLevel,
                verdict: gate.verdict,
                blocking: gate.blocking,
                findings: result.findings,
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}

import { NextRequest, NextResponse } from \"next/server\";
import { getServerSession } from \"next-auth\";
import { authOptions } from \"@/lib/auth\";
import { db } from \"@/lib/db\";
import { checkTeamPermission } from \"@/lib/permissions\";
import { getAICompletion } from \"@/lib/ai\";
import { enforceRateLimit } from \"@/lib/rate-limit\";
import { sendNotification } from \"@/lib/notifications\";
import { errorResponse, ApiErrors } from \"@/lib/api-utils\";
import { z } from \"zod\";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const auditResponseSchema = z.object({
    score: z.number().int().min(0).max(100),
    consistency: z.string(),
    completeness: z.string(),
    apiDesignCompliance: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    recommendation: z.string(),
}).strict();

/**
 * POST /api/teams/[teamId]/audit
 * Perform an AI-powered documentation audit for the whole project.
 * Analyzes consistency, tone, and completeness.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Validate Params
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest(\"Invalid team ID\"));
        }
        const { teamId } = parsedParams.data;

        // 2. RBAC Check: Only admins/owners can trigger full audit
        const hasPermission = await checkTeamPermission(session.user.id, teamId, \"manage\");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden(\"Admin access required to trigger a project-wide audit.\"));
        }

        // 3. Rate Limit (Audit is expensive)
        await enforceRateLimit(session.user.id, \"api\");

        // 4. Fetch documentation samples and team config
        const [docs, teamConfig] = await Promise.all([
            db.documentation.findMany({
                where: { file: { teamId } },
                select: { 
                    content: true,
                    file: { select: { name: true, language: true } }
                },
                take: 15, // Sample for audit to avoid context overflow
                orderBy: { updatedAt: 'desc' }
            }),
            db.integration.findFirst({
                where: { teamId, type: \"TEAM_CONFIG\" }
            })
        ]);

        if (docs.length === 0) {
            return errorResponse(ApiErrors.badRequest(\"No documentation found to audit. Generate some documentation first.\"));
        }

        const config = (teamConfig?.config && typeof teamConfig.config === \"object\" ? teamConfig.config : {}) as { apiGuidelines?: string };
        const apiGuidelines = config.apiGuidelines || \"\";

        // 5. Construct Audit Prompt
        const docSummaries = docs.map(d => {
            try {
                const parsed = JSON.parse(d.content);
                return `File: ${d.file.name} (${d.file.language})\nSummary: ${parsed.summary?.slice(0, 200)}...`;
            } catch {
                return `File: ${d.file.name}\nContent: ${d.content.slice(0, 200)}...`;
            }
        }).join(\"\n\n---\n\n\");

        const prompt = `You are a Technical Documentation Auditor. 
Analyze the following documentation samples from a project and provide a Project Health Audit.

${apiGuidelines ? `IMPORTANT: Evaluate these samples against the team's API DESIGN GUIDELINES:\n\"${apiGuidelines}\"\n` : \"\"}

SAMPLES:
${docSummaries}

Provide your assessment in JSON format:
{
  \"score\": 0-100,
  \"consistency\": \"Assessment of tone and style consistency\",
  \"completeness\": \"Assessment of how thorough the docs are\",
  \"apiDesignCompliance\": \"${apiGuidelines ? \"Assessment of compliance with API Design Guidelines\" : \"N/A\"}\",
  \"strengths\": [\"list of positive findings\"],
  \"weaknesses\": [\"list of areas for improvement\"],
  \"recommendation\": \"One actionable high-level advice\"
}`;

        // 6. Run AI Audit
        const aiResult = await getAICompletion([
            { role: \"system\", content: \"You are a senior documentation lead. Respond only in valid JSON.\" },
            { role: \"user\", content: prompt }
        ], {
            temperature: 0.2,
            jsonMode: true
        });

        if (!aiResult?.content) {
            return errorResponse(ApiErrors.internalError(\"AI Audit failed: No response from AI.\"));
        }

        let auditContent;
        try {
            auditContent = JSON.parse(aiResult.content);
        } catch (e) {
            return errorResponse(ApiErrors.internalError(\"AI Audit failed: AI returned invalid JSON.\"));
        }

        const validatedAudit = auditResponseSchema.safeParse(auditContent);
        if (!validatedAudit.success) {
            return errorResponse(ApiErrors.internalError(\"AI Audit failed: AI output did not match expected schema.\"));
        }

        const finalAudit = validatedAudit.data;

        // 7. Audit Log
        try {
            const { logAudit } = await import(\"@/lib/audit-logger\");
            await logAudit({
                userId: session.user.id,
                action: \"PROJECT_AUDIT\",
                entity: \"Team\",
                entityId: teamId,
                details: { 
                    score: finalAudit.score,
                    docsAudited: docs.length
                }
            });
        } catch {
            // Non-blocking
        }

        // 8. Critical Issue Announcement
        if (finalAudit.score < 60) {
            try {
                await sendNotification({
                    teamId,
                    type: \"CRITICAL_AUDIT\",
                    title: \"Low Project Health Score ⚠️\",
                    message: `AI Project Audit finished with a score of **${finalAudit.score}%**. Recommendation: \"${finalAudit.recommendation}\"`,
                });
            } catch {
                // Non-blocking
            }
        }

        return NextResponse.json(finalAudit);

    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * GET /api/teams/[teamId]/audit
 * Fetch historical audit scores for trend visualization.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Validate Params
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest(\"Invalid team ID\"));
        }
        const { teamId } = parsedParams.data;

        // 2. Enforce Rate Limit
        await enforceRateLimit(session.user.id, \"api\");

        // 3. Check permissions
        const hasPermission = await checkTeamPermission(session.user.id, teamId, \"view\");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden());
        }

        // 4. Fetch historical scores from AuditLog
        const logs = await db.auditLog.findMany({
            where: {
                entity: \"Team\",
                entityId: teamId,
                action: \"PROJECT_AUDIT\"
            },
            select: {
                createdAt: true,
                details: true
            },
            orderBy: { createdAt: \"asc\" },
            take: 20
        });

        const history = logs.map(l => ({
            date: l.createdAt.toISOString().split(\"T\")[0],
            score: (l.details as { score?: number } | null)?.score || 0
        }));

        return NextResponse.json({ history });

    } catch (error) {
        return errorResponse(error);
    }
}

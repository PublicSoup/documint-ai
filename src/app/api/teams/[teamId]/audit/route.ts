import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { getAICompletion } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";

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
        const { teamId } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 1. RBAC Check: Only admins/owners can trigger full audit
        const hasPermission = await checkTeamPermission(session.user.id, teamId, "manage");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 2. Rate Limit (Audit is expensive)
        await enforceRateLimit(session.user.id, "api");

        // 3. Fetch documentation samples and team config
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
                where: { teamId, type: "TEAM_CONFIG" }
            })
        ]);

        if (docs.length === 0) {
            return NextResponse.json({ error: "No documentation found to audit" }, { status: 400 });
        }

        const config = (teamConfig?.config as { apiGuidelines?: string } | null) || {};
        const apiGuidelines = config.apiGuidelines || "";

        // 4. Construct Audit Prompt
        const docSummaries = docs.map(d => {
            try {
                const parsed = JSON.parse(d.content);
                return `File: ${d.file.name} (${d.file.language})\nSummary: ${parsed.summary?.slice(0, 200)}...`;
            } catch {
                return `File: ${d.file.name}\nContent: ${d.content.slice(0, 200)}...`;
            }
        }).join("\n\n---\n\n");

        const prompt = `You are a Technical Documentation Auditor. 
Analyze the following documentation samples from a project and provide a Project Health Audit.

${apiGuidelines ? `IMPORTANT: Evaluate these samples against the team's API DESIGN GUIDELINES:\n"${apiGuidelines}"\n` : ""}

SAMPLES:
${docSummaries}

Provide your assessment in JSON format:
{
  "score": 0-100,
  "consistency": "Assessment of tone and style consistency",
  "completeness": "Assessment of how thorough the docs are",
  "apiDesignCompliance": "${apiGuidelines ? "Assessment of compliance with API Design Guidelines" : "N/A"}",
  "strengths": ["list of positive findings"],
  "weaknesses": ["list of areas for improvement"],
  "recommendation": "One actionable high-level advice"
}`;

        // 5. Run AI Audit
        const aiResult = await getAICompletion([
            { role: "system", content: "You are a senior documentation lead. Respond only in valid JSON." },
            { role: "user", content: prompt }
        ], {
            temperature: 0.2,
            jsonMode: true
        });

        if (!aiResult) {
            return NextResponse.json({ error: "AI Audit failed" }, { status: 500 });
        }

        const auditContent = JSON.parse(aiResult.content);

        // 6. Audit Log (High Integrity)
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "PROJECT_AUDIT",
                entity: "Team",
                entityId: teamId,
                details: { 
                    score: auditContent.score,
                    docsAudited: docs.length
                }
            });
        } catch (e) {}

        // 7. Critical Issue Announcement
        if (auditContent.score < 60) {
            try {
                await sendNotification({
                    teamId,
                    type: "CRITICAL_AUDIT",
                    title: "Low Project Health Score ⚠️",
                    message: `AI Project Audit finished with a score of **${auditContent.score}%**. Recommendation: "${auditContent.recommendation}"`,
                });
            } catch (e) {}
        }

        return NextResponse.json(auditContent);

    } catch (error) {
        console.error("[ProjectAudit_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
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
        const { teamId } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Fetch logs with action "PROJECT_AUDIT" for this team
        const logs = await db.auditLog.findMany({
            where: {
                entity: "Team",
                entityId: teamId,
                action: "PROJECT_AUDIT"
            },
            select: {
                createdAt: true,
                details: true
            },
            orderBy: { createdAt: "asc" },
            take: 10
        });

        const history = logs.map(l => ({
            date: l.createdAt.toISOString().split("T")[0],
            score: (l.details as { score?: number } | null)?.score || 0
        }));

        return NextResponse.json({ history });

    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch audit history" }, { status: 500 });
    }
}

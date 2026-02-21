import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subDays } from "date-fns";
import { sendNotification } from "@/lib/notifications";

/**
 * GET /api/cron/retention-check
 * System-level cron job to enforce documentation retention policies.
 * Flags or archives documentation that hasn't been verified within the team's policy window.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        console.log("🚀 [Cron] Starting documentation retention check...");
        
        // 1. Get all teams with a retention policy
        const integrations = await db.integration.findMany({
            where: { 
                type: "TEAM_CONFIG",
                isActive: true
            },
            include: { team: true }
        });

        const results = [];

        for (const integration of integrations) {
            const config = integration.config as any;
            const retentionDays = config?.retentionDays;
            
            if (!retentionDays || retentionDays <= 0) continue;

            const expirationDate = subDays(new Date(), retentionDays);

            // 2. Find documentation that was verified before the expiration date
            // or created before and never verified.
            const expiredDocs = await db.documentation.findMany({
                where: {
                    file: { teamId: integration.teamId },
                    status: "APPROVED",
                    OR: [
                        { verifiedAt: { lt: expirationDate } },
                        { 
                            verifiedAt: null,
                            updatedAt: { lt: expirationDate }
                        }
                    ]
                },
                select: { id: true, fileId: true }
            });

            if (expiredDocs.length > 0) {
                // 3. Action based on policy (default is to demote to DRAFT)
                await db.documentation.updateMany({
                    where: {
                        id: { in: expiredDocs.map(d => d.id) }
                    },
                    data: {
                        status: "DRAFT",
                        verifiedAt: null,
                        verifiedById: null
                    }
                });

                // 4. Audit Log for the team
                try {
                    const { logAudit } = await import("@/lib/audit-logger");
                    await logAudit({
                        action: "POLICY_ENFORCEMENT",
                        entity: "Team",
                        entityId: integration.teamId,
                        userId: "SYSTEM",
                        details: {
                            policy: "RETENTION",
                            expiredCount: expiredDocs.length,
                            retentionDays
                        }
                    });
                } catch (e) {}

                // 5. Trigger notification
                try {
                    await sendNotification({
                        teamId: integration.teamId,
                        type: "POLICY_EXPIRE",
                        title: "Documentation Retention Alert",
                        message: `**${expiredDocs.length}** documentation files have exceeded the **${retentionDays} day** verification window and have been moved to DRAFT for review.`,
                    });
                } catch (e) {}
            }

            results.push({
                teamId: integration.teamId,
                teamName: integration.team.name,
                expiredCount: expiredDocs.length
            });
        }

        return NextResponse.json({
            success: true,
            processedTeams: results.length,
            details: results
        });

    } catch (error) {
        console.error("[Cron_Retention] Error:", error);
        return NextResponse.json({ error: "Retention check failed" }, { status: 500 });
    }
}

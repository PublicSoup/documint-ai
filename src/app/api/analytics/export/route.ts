import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasFeatureAccess } from "@/lib/subscription";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateQuery, ApiErrors } from "@/lib/api-utils";

const querySchema = z.object({
    type: z.enum(["overview", "files", "usage"]).default("overview"),
}).strict();

/**
 * GET /api/analytics/export
 * Exports analytics data in CSV format. Premium feature.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Feature Gate check
        const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
        if (!hasAccess) {
            return errorResponse(ApiErrors.forbidden("Analytics export requires a Pro plan subscription."));
        }

        // 2. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const { searchParams } = new URL(request.url);
        const { type } = validateQuery(searchParams, querySchema);

        let csv = "";

        // 3. Process Export based on type
        if (type === "files") {
            const files = await db.file.findMany({
                where: { userId: session.user.id },
                include: {
                    documentation: {
                        select: { status: true, updatedAt: true }
                    },
                    _count: { select: { views: true, comments: true } }
                }
            });

            csv = "File Name,Language,Size,Doc Status,Last Updated,Views,Comments\n";
            files.forEach(f => {
                csv += [
                    `"${f.name}"`,
                    f.language,
                    f.size,
                    f.documentation?.status || "None",
                    f.documentation?.updatedAt?.toISOString() || "N/A",
                    f._count.views,
                    f._count.comments
                ].join(",") + "\n";
            });

        } else if (type === "usage") {
            const logs = await db.auditLog.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: 'desc' },
                take: 1000 // Performance bound
            });

            csv = "Date,Action,Entity,Details\n";
            logs.forEach(log => {
                csv += [
                    log.createdAt.toISOString(),
                    log.action,
                    log.entity,
                    `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
                ].join(",") + "\n";
            });

        } else {
            // Overview export
            const [fileCount, docCount, viewCount, reviewCount, docs] = await Promise.all([
                db.file.count({ where: { userId: session.user.id } }),
                db.documentation.count({ where: { file: { userId: session.user.id } } }),
                db.docView.count({ where: { file: { userId: session.user.id } } }),
                db.reviewRequest.count({ where: { requesterId: session.user.id } }),
                db.documentation.findMany({
                    where: { file: { userId: session.user.id } },
                    select: { content: true }
                })
            ]);

            let totalScore = 0;
            let scoreCount = 0;
            docs.forEach(d => {
                try {
                    const parsed = JSON.parse(d.content);
                    if (parsed.qualityScore) {
                        totalScore += parsed.qualityScore;
                        scoreCount++;
                    }
                } catch { 
                    // Non-critical parsing failure
                }
            });

            const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

            csv = "Metric,Value\n";
            csv += `Total Files,${fileCount}\n`;
            csv += `Documented Files,${docCount}\n`;
            csv += `Documentation Coverage,${fileCount > 0 ? Math.round((docCount / fileCount) * 100) : 0}%\n`;
            csv += `Total Views,${viewCount}\n`;
            csv += `Review Requests,${reviewCount}\n`;
            csv += `Avg Quality Score,${avgScore}\n`;
            csv += `Export Date,${new Date().toISOString()}\n`;
        }

        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="documint-${type}-${new Date().toISOString().split('T')[0]}.csv"`
            }
        });

    } catch (error) {
        return errorResponse(error);
    }
}

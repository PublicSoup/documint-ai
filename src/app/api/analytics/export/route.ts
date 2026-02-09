import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasFeatureAccess } from "@/lib/subscription";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check feature access
        const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
        if (!hasAccess) {
            return NextResponse.json({ error: "Pro required" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") || "overview"; // overview, files, usage

        let csv = "";

        if (type === "files") {
            // Export file analytics
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
            // Export usage data
            const logs = await db.auditLog.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: 'desc' },
                take: 500
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
            const fileCount = await db.file.count({ where: { userId: session.user.id } });
            const docCount = await db.documentation.count({
                where: { file: { userId: session.user.id } }
            });
            const viewCount = await db.docView.count({
                where: { file: { userId: session.user.id } }
            });
            const reviewCount = await db.reviewRequest.count({
                where: { requesterId: session.user.id }
            });

            // Get quality scores
            const docs = await db.documentation.findMany({
                where: { file: { userId: session.user.id } },
                select: { content: true }
            });

            let totalScore = 0;
            let scoreCount = 0;
            docs.forEach(d => {
                try {
                    const parsed = JSON.parse(d.content);
                    if (parsed.qualityScore) {
                        totalScore += parsed.qualityScore;
                        scoreCount++;
                    }
                } catch { }
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
        console.error("Analytics Export Error:", error);
        return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subDays } from "date-fns";

/**
 * GET /api/cron/prune-versions
 * Maintenance task to prune old documentation versions.
 * Prevents database bloat while keeping recent history.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        console.log("🚀 [Maintenance] Starting documentation version pruning...");
        
        // 1. Retention Rules
        const MAX_VERSIONS_PER_DOC = 50;
        const MAX_AGE_DAYS = 90;
        const expirationDate = subDays(new Date(), MAX_AGE_DAYS);

        // 2. Prune by Age (Older than 90 days)
        const prunedByAge = await db.docVersion.deleteMany({
            where: {
                createdAt: { lt: expirationDate }
            }
        });

        console.log(`🧹 Pruned ${prunedByAge.count} versions older than ${MAX_AGE_DAYS} days.`);

        // 3. Prune by Count (Keep only latest 50 per document)
        // This is more complex and needs to be done per documentation
        const allDocs = await db.documentation.findMany({
            select: { id: true }
        });

        let prunedByCount = 0;
        for (const doc of allDocs) {
            const versions = await db.docVersion.findMany({
                where: { documentationId: doc.id },
                orderBy: { version: 'desc' },
                select: { id: true },
                skip: MAX_VERSIONS_PER_DOC
            });

            if (versions.length > 0) {
                const idsToDelete = versions.map(v => v.id);
                const result = await db.docVersion.deleteMany({
                    where: { id: { in: idsToDelete } }
                });
                prunedByCount += result.count;
            }
        }

        console.log(`🧹 Pruned ${prunedByCount} versions exceeding depth limit of ${MAX_VERSIONS_PER_DOC}.`);

        return NextResponse.json({
            success: true,
            pruned: {
                byAge: prunedByAge.count,
                byCount: prunedByCount,
                total: prunedByAge.count + prunedByCount
            }
        });

    } catch (error) {
        console.error("[Maintenance_Prune] Error:", error);
        return NextResponse.json({ error: "Pruning failed" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/cron/ai-audit
 * System-level cron job to trigger weekly AI Documentation Audits for all teams.
 * Secured by CRON_SECRET environment variable.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        console.log("🚀 [Cron] Starting weekly team AI audits...");
        
        // 1. Get all teams
        const teams = await db.team.findMany({
            select: { id: true, name: true }
        });

        const results = [];
        const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
        const host = request.headers.get("host") || 'localhost:3000';

        // 2. Trigger audit for each team
        for (const team of teams) {
            try {
                const res = await fetch(`${protocol}://${host}/api/teams/${team.id}/audit`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.CRON_SECRET}`,
                        "Content-Type": "application/json"
                    }
                });
                
                results.push({
                    teamId: team.id,
                    name: team.name,
                    success: res.ok,
                    status: res.status
                });
            } catch (teamError) {
                results.push({
                    teamId: team.id,
                    name: team.name,
                    success: false,
                    error: String(teamError)
                });
            }
        }

        console.log(`✅ [Cron] AI audits completed. Processed ${teams.length} teams.`);

        return NextResponse.json({
            success: true,
            processedCount: teams.length,
            results
        });

    } catch (error) {
        console.error("[Cron_AIAudit] Fatal Error:", error);
        return NextResponse.json({ error: "Internal Cron Error" }, { status: 500 });
    }
}

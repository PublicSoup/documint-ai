import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { analyzeFullCodebase } from "../../../../lib/ai";
import { hasFeatureAccess } from "../../../../lib/subscription";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // This is a premium feature
        const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
        if (!hasAccess) {
            return NextResponse.json({
                error: "This feature requires a Pro subscription",
                upgradeUrl: "/dashboard/settings?tab=billing"
            }, { status: 403 });
        }

        // Perform full codebase analysis
        const analysis = await analyzeFullCodebase(session.user.id);

        return NextResponse.json({
            analysis,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error("Full Analysis Error:", error);
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
}

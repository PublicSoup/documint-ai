import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const reviews = await db.documentation.findMany({
            where: {
                status: "REVIEW",
                file: { teamId },
            },
            include: {
                file: {
                    select: { name: true, language: true, userId: true },
                },
                reviews: {
                    where: { status: "PENDING" },
                    include: {
                        requester: { select: { name: true, image: true } },
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
        });

        return NextResponse.json({ reviews });
    } catch (error) {
        console.error("[TeamReviews_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

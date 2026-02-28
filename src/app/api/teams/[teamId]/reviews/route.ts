import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const { teamId } = parsedParams.data;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            throw ApiErrors.forbidden();
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
        return errorResponse(error);
    }
}

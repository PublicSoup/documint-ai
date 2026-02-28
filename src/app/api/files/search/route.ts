import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const fileSearchSchema = z
    .object({
        q: z.string().trim().min(2).max(200),
        teamId: z.string().trim().min(1).max(100).optional(),
    })
    .strict();

/**
 * GET /api/files/search?q=...&teamId=...
 * Search for files by name or content while enforcing ownership/team membership.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { q: query, teamId } = validateQuery(req.nextUrl.searchParams, fileSearchSchema);

        const where: Prisma.FileWhereInput = {
            OR: [
                { name: { contains: query, mode: "insensitive" } },
                { content: { contains: query, mode: "insensitive" } },
                {
                    documentation: {
                        content: { contains: query, mode: "insensitive" },
                    },
                },
            ],
        };

        if (teamId) {
            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: {
                        teamId,
                        userId: session.user.id,
                    },
                },
                select: { id: true },
            });

            if (!membership) {
                throw ApiErrors.forbidden("Not a team member");
            }

            where.teamId = teamId;
        } else {
            where.userId = session.user.id;
            where.teamId = null;
        }

        const files = await db.file.findMany({
            where,
            select: {
                id: true,
                name: true,
                language: true,
                updatedAt: true,
                documentation: {
                    select: {
                        status: true,
                    },
                },
            },
            take: 20,
            orderBy: { updatedAt: "desc" },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "SEARCH_FILES",
                entity: "File",
                entityId: teamId || "PERSONAL",
                details: { query, resultCount: files.length },
            });
        } catch {
            // Non-blocking audit logging.
        }

        return NextResponse.json({ results: files });
    } catch (error) {
        return errorResponse(error);
    }
}

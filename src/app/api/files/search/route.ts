import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";
import { checkTeamPermission } from "@/lib/permissions";

const fileSearchSchema = z
    .object({
        q: z.string().trim().min(2).max(200),
        teamId: z.string().trim().min(1).max(100).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
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

        const { searchParams } = new URL(req.url);
        const { q: query, teamId, limit } = validateQuery(searchParams, fileSearchSchema);

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
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
            if (!hasPermission) {
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
            take: limit,
            orderBy: { updatedAt: "desc" },
        });

        // Audit Logging (Sampled or lightweight)
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            // Only log if results found or specific criteria to avoid noise?
            // Actually search audit is useful for compliance.
            await logAudit({
                userId: session.user.id,
                action: "SEARCH_FILES",
                entity: "File",
                entityId: teamId || "PERSONAL",
                details: { query, resultCount: files.length },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ results: files });
    } catch (error) {
        return errorResponse(error);
    }
}

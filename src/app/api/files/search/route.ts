import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

const fileSearchSchema = z.object({
    q: z.string().trim().min(2).max(200),
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

/**
 * GET /api/files/search?q=...&teamId=...
 * Search for files by name or content while enforcing ownership/team membership.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const searchParams = new URL(req.url).searchParams;
        const parsed = fileSearchSchema.safeParse({
            q: searchParams.get("q") ?? "",
            teamId: searchParams.get("teamId") ?? undefined,
        });

        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
        }

        const { q: query, teamId } = parsed.data;

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
                return NextResponse.json({ error: "Forbidden: Not a team member" }, { status: 403 });
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
        console.error("[FileSearch_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

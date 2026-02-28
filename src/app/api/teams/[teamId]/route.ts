import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

const updateTeamSchema = z
    .object({
        name: z.string().trim().min(2).max(100).optional(),
        slug: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
            .optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one field is required",
    });

function isKnownPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError;
}

function isSlugUniqueConflict(error: unknown): boolean {
    if (!isKnownPrismaError(error) || error.code !== "P2002") {
        return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
        return target.includes("slug");
    }

    return typeof target === "string" && target.includes("slug");
}

async function assertOwnerAccess(teamId: string, userId: string): Promise<void> {
    const [team, membership] = await Promise.all([
        db.team.findUnique({ where: { id: teamId }, select: { id: true } }),
        db.teamMember.findUnique({
            where: {
                teamId_userId: { teamId, userId },
            },
            select: { role: true },
        }),
    ]);

    if (!team) {
        throw ApiErrors.notFound("Team");
    }

    if (membership?.role !== "OWNER") {
        throw ApiErrors.forbidden("Only team owners can change team settings");
    }
}

/**
 * PATCH /api/teams/[teamId]
 * Update team general settings (name, slug). Requires OWNER role.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { teamId } = parsedParams.data;
        const payload = await validateBody(req, updateTeamSchema);

        await assertOwnerAccess(teamId, session.user.id);

        if (payload.slug) {
            const slugConflict = await db.team.findFirst({
                where: {
                    slug: payload.slug,
                    id: { not: teamId },
                },
                select: { id: true },
            });

            if (slugConflict) {
                throw ApiErrors.conflict("Slug already in use");
            }
        }

        const updatedTeam = await db.team.update({
            where: { id: teamId },
            data: {
                ...(payload.name !== undefined ? { name: payload.name } : {}),
                ...(payload.slug !== undefined ? { slug: payload.slug } : {}),
            },
            select: {
                id: true,
                name: true,
                slug: true,
                updatedAt: true,
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "UPDATE_TEAM",
                entity: "Team",
                entityId: teamId,
                details: {
                    updatedFields: Object.keys(payload),
                },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ team: updatedTeam });
    } catch (error) {
        if (isSlugUniqueConflict(error)) {
            return errorResponse(ApiErrors.conflict("Slug already in use"));
        }

        return errorResponse(error);
    }
}

/**
 * DELETE /api/teams/[teamId]
 * Delete a team and all associated data. Requires OWNER role.
 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { teamId } = parsedParams.data;

        await assertOwnerAccess(teamId, session.user.id);

        await db.team.delete({
            where: { id: teamId },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "DELETE_TEAM",
                entity: "Team",
                entityId: teamId,
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}

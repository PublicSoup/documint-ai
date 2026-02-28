import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody, validateQuery } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

const deleteQuerySchema = z
    .object({
        userId: z.string().trim().min(1).max(100),
    })
    .strict();

const teamMemberRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

const updateMemberSchema = z
    .object({
        userId: z.string().trim().min(1).max(100),
        role: teamMemberRoleSchema,
    })
    .strict();

async function getMembership(teamId: string, userId: string) {
    return db.teamMember.findUnique({
        where: {
            teamId_userId: {
                teamId,
                userId,
            },
        },
        select: {
            role: true,
        },
    });
}

async function assertTeamAccess(teamId: string, userId: string) {
    const [teamExists, membership] = await Promise.all([
        db.team.findUnique({ where: { id: teamId }, select: { id: true } }),
        getMembership(teamId, userId),
    ]);

    if (!teamExists) {
        throw ApiErrors.notFound("Team");
    }

    if (!membership) {
        throw ApiErrors.forbidden("Access denied");
    }

    return membership;
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const { teamId } = parsedParams.data;

        await assertTeamAccess(teamId, session.user.id);

        const members = await db.teamMember.findMany({
            where: { teamId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
            },
            orderBy: { joinedAt: "asc" },
        });

        return NextResponse.json({ members });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const { userId: targetUserId } = validateQuery(req.nextUrl.searchParams, deleteQuerySchema);
        const { teamId } = parsedParams.data;

        const requesterMembership = await assertTeamAccess(teamId, session.user.id);
        const targetMembership = await getMembership(teamId, targetUserId);

        if (!targetMembership) {
            throw ApiErrors.notFound("Team member");
        }

        const isSelf = session.user.id === targetUserId;

        if (isSelf && targetMembership.role === "OWNER") {
            const ownerCount = await db.teamMember.count({
                where: { teamId, role: "OWNER" },
            });

            if (ownerCount === 1) {
                throw ApiErrors.badRequest("Cannot leave as the last owner. Delete the team instead.");
            }
        }

        if (!isSelf) {
            if (requesterMembership.role !== "ADMIN" && requesterMembership.role !== "OWNER") {
                throw ApiErrors.forbidden("You don't have permission to remove members");
            }

            if (requesterMembership.role === "ADMIN" && targetMembership.role === "OWNER") {
                throw ApiErrors.forbidden("Admins cannot remove owners");
            }
        }

        await db.teamMember.delete({
            where: {
                teamId_userId: {
                    teamId,
                    userId: targetUserId,
                },
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: isSelf ? "LEAVE_TEAM" : "REMOVE_MEMBER",
                entity: "Team",
                entityId: teamId,
                details: {
                    targetUserId,
                    isSelf,
                    role: targetMembership.role,
                },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * PATCH /api/teams/[teamId]/members
 * Update a member's role within the team.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce Security Rate Limit for role updates
        await enforceRateLimit(session.user.id, "security");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const { userId: targetUserId, role: newRole } = await validateBody(req, updateMemberSchema);
        const { teamId } = parsedParams.data;

        const requesterMembership = await assertTeamAccess(teamId, session.user.id);
        const targetMembership = await getMembership(teamId, targetUserId);

        if (!targetMembership) {
            throw ApiErrors.notFound("Team member");
        }

        // 2. Authz: Only OWNER or ADMIN can change roles
        if (requesterMembership.role !== "OWNER" && requesterMembership.role !== "ADMIN") {
            throw ApiErrors.forbidden("Insufficient permissions to update roles");
        }

        // 3. Authz: Only OWNER can promote/demote other OWNERs
        if (newRole === "OWNER" || targetMembership.role === "OWNER") {
            if (requesterMembership.role !== "OWNER") {
                throw ApiErrors.forbidden("Only team owners can manage owner roles");
            }
        }

        // 4. Authz: ADMIN cannot manage other ADMINs
        if (
            requesterMembership.role === "ADMIN" &&
            targetMembership.role === "ADMIN" &&
            session.user.id !== targetUserId
        ) {
            throw ApiErrors.forbidden("Admins cannot manage other admin roles");
        }

        // 5. Validation: Cannot remove the last owner
        if (targetMembership.role === "OWNER" && newRole !== "OWNER") {
            const ownerCount = await db.teamMember.count({
                where: { teamId, role: "OWNER" },
            });

            if (ownerCount === 1) {
                throw ApiErrors.badRequest("Cannot reassign the last team owner. Add another owner first.");
            }
        }

        if (targetMembership.role === newRole) {
            return NextResponse.json({ success: true, message: "Role unchanged" });
        }

        const updatedMembership = await db.teamMember.update({
            where: { teamId_userId: { teamId, userId: targetUserId } },
            data: { role: newRole },
            select: {
                teamId: true,
                userId: true,
                role: true,
                joinedAt: true,
            },
        });

        // 6. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "UPDATE_MEMBER_ROLE",
                entity: "Team",
                entityId: teamId,
                details: {
                    targetUserId,
                    oldRole: targetMembership.role,
                    newRole,
                },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true, membership: updatedMembership });
    } catch (error) {
        return errorResponse(error);
    }
}

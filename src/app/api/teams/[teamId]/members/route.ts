import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const deleteQuerySchema = z.object({
    userId: z.string().trim().min(1).max(100),
}).strict();

const updateMemberSchema = z.object({
    userId: z.string().trim().min(1).max(100),
    role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER", "MEMBER"]),
}).strict();

async function ensureTeamExists(teamId: string) {
    const team = await db.team.findUnique({
        where: { id: teamId },
        select: { id: true },
    });

    return Boolean(team);
}

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

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const isTeamMember = await getMembership(teamId, session.user.id);
        if (!isTeamMember) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

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
        console.error("List members error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const parsedQuery = deleteQuerySchema.safeParse({
            userId: req.nextUrl.searchParams.get("userId") ?? undefined,
        });
        if (!parsedQuery.success) {
            return NextResponse.json({ error: "User ID is required" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;
        const { userId: targetUserId } = parsedQuery.data;

        const requesterMembership = await getMembership(teamId, session.user.id);
        if (!requesterMembership) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const targetMembership = await getMembership(teamId, targetUserId);
        if (!targetMembership) {
            return NextResponse.json({ error: "Member not found" }, { status: 404 });
        }

        const isSelf = session.user.id === targetUserId;

        if (isSelf && targetMembership.role === "OWNER") {
            const ownerCount = await db.teamMember.count({
                where: { teamId, role: "OWNER" },
            });

            if (ownerCount === 1) {
                return NextResponse.json(
                    { error: "Cannot leave as the last owner. Delete the team instead." },
                    { status: 400 },
                );
            }
        }

        if (!isSelf) {
            if (requesterMembership.role !== "ADMIN" && requesterMembership.role !== "OWNER") {
                return NextResponse.json(
                    { error: "You don't have permission to remove members" },
                    { status: 403 },
                );
            }

            if (requesterMembership.role === "ADMIN" && targetMembership.role === "OWNER") {
                return NextResponse.json({ error: "Admins cannot remove Owners" }, { status: 403 });
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
        console.error("Remove member error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const parsedBody = updateMemberSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;
        const { userId: targetUserId, role: newRole } = parsedBody.data;

        const teamExists = await ensureTeamExists(teamId);
        if (!teamExists) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
        }

        const requesterMembership = await getMembership(teamId, session.user.id);
        if (!requesterMembership) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const targetMembership = await getMembership(teamId, targetUserId);
        if (!targetMembership) {
            return NextResponse.json({ error: "Member not found" }, { status: 404 });
        }

        if (requesterMembership.role !== "OWNER" && requesterMembership.role !== "ADMIN") {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }

        if (newRole === "OWNER" || targetMembership.role === "OWNER") {
            if (requesterMembership.role !== "OWNER") {
                return NextResponse.json(
                    { error: "Only team owners can manage other owner roles" },
                    { status: 403 },
                );
            }
        }

        if (
            requesterMembership.role === "ADMIN" &&
            targetMembership.role === "ADMIN" &&
            session.user.id !== targetUserId
        ) {
            return NextResponse.json({ error: "Admins cannot manage other admin roles" }, { status: 403 });
        }

        const updatedMembership = await db.teamMember.update({
            where: { teamId_userId: { teamId, userId: targetUserId } },
            data: { role: newRole },
        });

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
        console.error("Update member role error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

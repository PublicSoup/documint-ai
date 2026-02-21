import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const querySchema = z.object({
    inviteId: z.string().trim().min(1).max(100),
}).strict();

/**
 * DELETE /api/teams/invite/revoke?inviteId=xxx
 * Revoke a pending team invitation. Requires Team ADMIN or OWNER role.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = querySchema.safeParse({
            inviteId: req.nextUrl.searchParams.get("inviteId") ?? undefined,
        });

        if (!parsedQuery.success) {
            return NextResponse.json({ error: "inviteId is required" }, { status: 400 });
        }

        const { inviteId } = parsedQuery.data;

        const invite = await db.teamInvite.findUnique({
            where: { id: inviteId },
            include: {
                team: {
                    select: { name: true },
                },
            },
        });

        if (!invite) {
            return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
        }

        const canManageTeam = await checkTeamPermission(session.user.id, invite.teamId, "manage");
        if (!canManageTeam) {
            return NextResponse.json({ error: "Forbidden: Team Admin access required" }, { status: 403 });
        }

        await db.teamInvite.delete({
            where: { id: inviteId },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "REVOKE_INVITE",
                entity: "Team",
                entityId: invite.teamId,
                details: {
                    revokedEmail: invite.email,
                    revokedRole: invite.role,
                    teamName: invite.team.name,
                },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true, message: "Invitation revoked" });
    } catch (error) {
        console.error("[RevokeInvite_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

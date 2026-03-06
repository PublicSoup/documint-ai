import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const querySchema = z
    .object({
        inviteId: z.string().trim().min(1).max(100),
    })
    .strict();

/**
 * DELETE /api/teams/invite/revoke?inviteId=xxx
 * Revoke a pending team invitation. Requires Team ADMIN or OWNER role.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { inviteId } = validateQuery(req.nextUrl.searchParams, querySchema);

        const invite = await db.teamInvite.findUnique({
            where: { id: inviteId },
            include: {
                team: {
                    select: { name: true, slug: true },
                },
            },
        });

        if (!invite) {
            throw ApiErrors.notFound("Invitation");
        }

        const canManageTeam = await checkTeamPermission(session.user.id, invite.teamId, "manage");
        if (!canManageTeam) {
            throw ApiErrors.forbidden("Team admin access required");
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
                    teamSlug: invite.team.slug,
                },
            });
        } catch (auditError) {
            console.error("Failed to log audit event:", auditError);
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true, message: "Invitation revoked" });
    } catch (error) {
        return errorResponse(error);
    }
}

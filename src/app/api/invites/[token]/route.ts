import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

const paramsSchema = z.object({
    token: z.string().min(10).max(255),
}).strict();

/**
 * GET /api/invites/[token]
 * Validates a team invitation token and returns basic team info.
 * Accessible publicly for invitation context.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const clientIp = await getClientIP(request);
        // Generic IP-based rate limit for public token lookup
        await enforceRateLimit(clientIp, "auth");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid invitation token"));
        }

        const { token } = parsedParams.data;

        const invite = await db.teamInvite.findUnique({
            where: { token },
            include: { team: { select: { name: true } } },
        });

        if (!invite) {
            return errorResponse(ApiErrors.notFound("Invitation"));
        }

        if (invite.expiresAt < new Date()) {
            return errorResponse(ApiErrors.badRequest("Invitation has expired"));
        }

        return NextResponse.json({
            teamName: invite.team.name,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * POST /api/invites/[token]
 * Accepts a team invitation. User must be logged in with the matching email.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session?.user?.email) {
            return errorResponse(ApiErrors.unauthorized("Please log in first."));
        }

        // Rate limit by User ID
        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid invitation token"));
        }

        const { token } = parsedParams.data;

        // 1. Fetch Invite
        const invite = await db.teamInvite.findUnique({
            where: { token },
            include: { team: { select: { id: true, name: true } } },
        });

        if (!invite) {
            return errorResponse(ApiErrors.notFound("Invitation"));
        }

        // 2. Validate Expiry
        if (invite.expiresAt < new Date()) {
            return errorResponse(ApiErrors.badRequest("Invitation has expired."));
        }

        // 3. Match Email (Strict Security)
        if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
            return errorResponse(ApiErrors.forbidden(`This invitation was sent to ${invite.email}. Please log in with that account to accept.`));
        }

        const userId = session.user.id;

        // 4. Check for existing membership
        const existingMember = await db.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId: invite.teamId,
                    userId: userId,
                },
            },
            select: { id: true }
        });

        if (existingMember) {
            // Clean up stale invite if already a member
            await db.teamInvite.delete({ where: { id: invite.id } }).catch(() => {});
            
            return NextResponse.json({
                success: true,
                message: "You are already a member of this team.",
                teamId: invite.teamId,
                teamName: invite.team.name,
            });
        }

        // 5. Accept invite in a transaction
        await db.$transaction([
            db.teamMember.create({
                data: {
                    teamId: invite.teamId,
                    userId: userId,
                    role: invite.role,
                },
            }),
            db.teamInvite.delete({ where: { id: invite.id } })
        ]);

        // 6. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: userId,
                action: "ACCEPT_INVITE",
                entity: "Team",
                entityId: invite.teamId,
                details: {
                    role: invite.role,
                    teamName: invite.team.name,
                },
            });
        } catch {
            // Non-blocking
        }

        // 7. Push Notification
        await sendNotification({
            userId: userId,
            type: "TEAM_JOIN",
            title: "Welcome to the Team! 🎉",
            message: `You have successfully joined **${invite.team.name}** as ${invite.role}.`,
            teamId: invite.teamId,
        });

        return NextResponse.json({
            success: true,
            teamId: invite.teamId,
            teamName: invite.team.name,
            role: invite.role,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

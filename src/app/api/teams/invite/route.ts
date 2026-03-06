import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendNotification } from "@/lib/notifications";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUserSubscription } from "@/lib/subscription";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";

const inviteSchema = z
    .object({
        email: z.string().trim().email().max(255),
        teamId: z.string().trim().min(1).max(100),
        role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
    })
    .strict();

function getAcceptUrl(req: NextRequest, token: string): string {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || req.nextUrl.origin;
    return `${appBaseUrl.replace(/\/$/, "")}/invite/${token}`;
}

function isDuplicateInviteError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
        return target.includes("teamId") && target.includes("email");
    }

    return typeof target === "string" && target.includes("teamId_email");
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const body = await validateBody(req, inviteSchema);
        const teamId = body.teamId;
        const role = body.role;
        const email = body.email.trim().toLowerCase();

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "manage");
        if (!hasPermission) {
            throw ApiErrors.forbidden("You do not have permission to invite members");
        }

        const [team, inviter] = await Promise.all([
            db.team.findUnique({
                where: { id: teamId },
                select: { id: true, name: true, slug: true },
            }),
            db.user.findUnique({
                where: { id: session.user.id },
                select: { id: true, name: true, email: true },
            }),
        ]);

        if (!team) {
            throw ApiErrors.notFound("Team");
        }

        if (!inviter) {
            throw ApiErrors.notFound("User");
        }

        if (inviter.email && inviter.email.toLowerCase() === email) {
            throw ApiErrors.badRequest("You are already a member of this workspace");
        }

        const subscription = await getUserSubscription(inviter.id);
        const [currentMemberCount, pendingInviteCount] = await Promise.all([
            db.teamMember.count({ where: { teamId } }),
            db.teamInvite.count({
                where: {
                    teamId,
                    expiresAt: { gte: new Date() },
                }
            }),
        ]);

        if (
            subscription.limits.teamMembers !== -1 &&
            currentMemberCount + pendingInviteCount >= subscription.limits.teamMembers
        ) {
            throw ApiErrors.forbidden(
                `Team seat limit reached. Your current plan allows up to ${subscription.limits.teamMembers} members. Please upgrade to add more.`,
            );
        }

        const existingMember = await db.teamMember.findFirst({
            where: {
                teamId,
                user: { email },
            },
            select: { userId: true },
        });

        if (existingMember) {
            throw ApiErrors.conflict("User is already a member of this team");
        }

        const existingInvite = await db.teamInvite.findUnique({
            where: {
                teamId_email: { teamId, email },
            },
            select: { id: true, expiresAt: true },
        });

        if (existingInvite) {
            if (existingInvite.expiresAt >= new Date()) {
                throw ApiErrors.conflict("A valid invitation has already been sent to this email");
            }

            // Clean up expired invite before creating a new one
            await db.teamInvite.delete({
                where: { id: existingInvite.id },
            });
        }

        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const invite = await db.teamInvite.create({
            data: {
                email,
                teamId,
                role,
                token,
                expiresAt,
            },
            select: {
                id: true,
                email: true,
                role: true,
                teamId: true,
                expiresAt: true,
                createdAt: true,
            },
        });

        const acceptUrl = getAcceptUrl(req, token);

        try {
            await sendEmail({
                to: email,
                subject: `You've been invited to join ${team.name} on DocuMint AI`,
                html: emailTemplates.teamInvite(inviter.name || inviter.email || "Someone", team.name, acceptUrl),
            });
        } catch (emailError) {
            console.error("Failed to send invite email:", emailError);
            // Invitation remains valid even if email delivery fails.
        }

        try {
            const invitedUser = await db.user.findUnique({
                where: { email },
                select: { id: true },
            });

            if (invitedUser) {
                await sendNotification({
                    userId: invitedUser.id,
                    type: "INVITE",
                    title: "New Team Invitation",
                    message: `**${inviter.name || "Someone"}** invited you to join **${team.name}**`,
                    link: acceptUrl,
                });
            }
        } catch (notificationError) {
            console.error("Failed to send invite notification:", notificationError);
            // Non-blocking channel notification.
        }

        try {
            await logAudit({
                userId: inviter.id,
                action: "INVITE_MEMBER",
                entity: "Team",
                entityId: teamId,
                details: {
                    invitedEmail: email,
                    role,
                    teamName: team.name,
                    teamSlug: team.slug,
                },
            });
        } catch (auditError) {
            console.error("Failed to log audit event:", auditError);
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true, invite }, { status: 201 });
    } catch (error) {
        if (isDuplicateInviteError(error)) {
            return errorResponse(ApiErrors.conflict("Invite already sent"));
        }

        return errorResponse(error);
    }
}

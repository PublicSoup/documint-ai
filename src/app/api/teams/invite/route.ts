import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendNotification } from "@/lib/notifications";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUserSubscription } from "@/lib/subscription";

const inviteSchema = z.object({
    email: z.string().trim().email().max(255),
    teamId: z.string().trim().min(1).max(100),
    role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
}).strict();

function getAcceptUrl(req: NextRequest, token: string): string {
    const appBaseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXTAUTH_URL ||
        req.nextUrl.origin;

    return `${appBaseUrl.replace(/\/$/, "")}/invite/${token}`;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedBody = inviteSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid invitation payload" }, { status: 400 });
        }

        const { email, teamId, role } = parsedBody.data;

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "manage");
        if (!hasPermission) {
            return NextResponse.json(
                { error: "You do not have permission to invite members" },
                { status: 403 },
            );
        }

        const team = await db.team.findUnique({
            where: { id: teamId },
            select: { id: true, name: true },
        });

        if (!team) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
        }

        const inviter = await db.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, name: true, email: true },
        });

        if (!inviter) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const subscription = await getUserSubscription(inviter.id);
        const currentMemberCount = await db.teamMember.count({ where: { teamId } });
        const pendingInviteCount = await db.teamInvite.count({ where: { teamId } });

        if (
            subscription.limits.teamMembers !== -1 &&
            currentMemberCount + pendingInviteCount >= subscription.limits.teamMembers
        ) {
            return NextResponse.json(
                {
                    error: "Team seat limit reached",
                    message: `Your current plan allows up to ${subscription.limits.teamMembers} members. Please upgrade to add more.`,
                },
                { status: 403 },
            );
        }

        const existingMember = await db.teamMember.findFirst({
            where: {
                teamId,
                user: {
                    email,
                },
            },
            select: { userId: true },
        });

        if (existingMember) {
            return NextResponse.json(
                { error: "User is already a member of this team" },
                { status: 400 },
            );
        }

        const existingInvite = await db.teamInvite.findUnique({
            where: {
                teamId_email: {
                    teamId,
                    email,
                },
            },
            select: { id: true },
        });

        if (existingInvite) {
            return NextResponse.json({ error: "Invite already sent" }, { status: 400 });
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
        });

        const acceptUrl = getAcceptUrl(req, token);

        try {
            await sendEmail({
                to: email,
                subject: `You've been invited to join ${team.name} on DocuMint AI`,
                html: emailTemplates.teamInvite(
                    inviter.name || inviter.email || "Someone",
                    team.name,
                    acceptUrl,
                ),
            });
        } catch (emailError) {
            console.error("Failed to send invitation email:", emailError);
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
            console.error("Failed to create invitation notification:", notificationError);
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: inviter.id,
                action: "INVITE_MEMBER",
                entity: "Team",
                entityId: teamId,
                details: {
                    invitedEmail: email,
                    role,
                    teamName: team.name,
                },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true, invite }, { status: 201 });
    } catch (error) {
        console.error("Invite error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

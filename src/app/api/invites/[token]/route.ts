import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

const paramsSchema = z.object({
    token: z.string().min(10).max(255),
}).strict();

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const clientIp = await getClientIP(req);
        await enforceRateLimit(clientIp, "auth");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid invitation token" }, { status: 400 });
        }

        const { token } = parsedParams.data;

        const invite = await db.teamInvite.findUnique({
            where: { token },
            include: { team: true },
        });

        if (!invite) {
            return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
        }

        if (invite.expiresAt < new Date()) {
            return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
        }

        return NextResponse.json({
            teamName: invite.team.name,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt,
        });
    } catch (error) {
        console.error("Get invite error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session?.user?.email) {
            return NextResponse.json({ error: "Please login first" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid invitation token" }, { status: 400 });
        }

        const { token } = parsedParams.data;

        const invite = await db.teamInvite.findUnique({
            where: { token },
            include: { team: true },
        });

        if (!invite) {
            return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
        }

        if (invite.expiresAt < new Date()) {
            return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
        }

        if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
            return NextResponse.json(
                { error: `This invitation was sent to ${invite.email}. Please login with that email.` },
                { status: 403 }
            );
        }

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, name: true, email: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const existingMember = await db.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId: invite.teamId,
                    userId: user.id,
                },
            },
        });

        if (existingMember) {
            await db.teamInvite.delete({ where: { id: invite.id } });
            return NextResponse.json({
                success: true,
                message: "You're already a member of this team",
                teamId: invite.teamId,
                teamName: invite.team.name,
            });
        }

        await db.$transaction(async (tx) => {
            await tx.teamMember.create({
                data: {
                    teamId: invite.teamId,
                    userId: user.id,
                    role: invite.role,
                },
            });

            await tx.teamInvite.delete({ where: { id: invite.id } });
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: user.id,
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

        await sendNotification({
            userId: user.id,
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
        console.error("Accept invite error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

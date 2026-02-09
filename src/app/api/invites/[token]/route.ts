import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        // Find the invite
        const invite = await db.teamInvite.findUnique({
            where: { token },
            include: { team: true }
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
            expiresAt: invite.expiresAt
        });

    } catch (error) {
        console.error("Get invite error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Please login first" }, { status: 401 });
        }

        const { token } = await params;

        // Find and validate the invite
        const invite = await db.teamInvite.findUnique({
            where: { token },
            include: { team: true }
        });

        if (!invite) {
            return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
        }

        if (invite.expiresAt < new Date()) {
            return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
        }

        // Verify email matches
        if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
            return NextResponse.json({
                error: `This invitation was sent to ${invite.email}. Please login with that email.`
            }, { status: 403 });
        }

        // Get user
        const user = await db.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Check if already a member
        const existingMember = await db.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId: invite.teamId,
                    userId: user.id
                }
            }
        });

        if (existingMember) {
            // Already a member, just delete invite and redirect
            await db.teamInvite.delete({ where: { id: invite.id } });
            return NextResponse.json({
                success: true,
                message: "You're already a member of this team",
                teamId: invite.teamId,
                teamName: invite.team.name
            });
        }

        // Add user to team
        await db.teamMember.create({
            data: {
                teamId: invite.teamId,
                userId: user.id,
                role: invite.role
            }
        });

        // Delete the invite
        await db.teamInvite.delete({ where: { id: invite.id } });

        // Create notification for the new member
        await db.notification.create({
            data: {
                userId: user.id,
                type: "INVITE",
                message: `Welcome to ${invite.team.name}! You've joined as ${invite.role}.`,
                link: `/dashboard?team=${invite.teamId}`
            }
        });

        return NextResponse.json({
            success: true,
            teamId: invite.teamId,
            teamName: invite.team.name,
            role: invite.role
        });

    } catch (error) {
        console.error("Accept invite error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

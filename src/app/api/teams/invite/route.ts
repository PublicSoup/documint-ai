import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Assuming authOptions is exported here, need to verify
import { db } from "@/lib/db";
import { z } from "zod";
import { randomBytes } from "crypto";
import { sendEmail, emailTemplates } from "@/lib/email";

const inviteSchema = z.object({
    email: z.string().email(),
    teamId: z.string(),
    role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { email, teamId, role } = inviteSchema.parse(body);

        // 1. Verify currentUser is an admin/owner of the team
        // First, get the user ID from the email (since session might not have ID populated in some setups, but assuming db query is safer)
        const currentUser = await db.user.findUnique({
            where: { email: session.user.email },
        });

        if (!currentUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const teamMember = await db.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId,
                    userId: currentUser.id,
                },
            },
        });

        if (!teamMember || (teamMember.role !== "OWNER" && teamMember.role !== "ADMIN")) {
            return NextResponse.json(
                { error: "You do not have permission to invite members" },
                { status: 403 }
            );
        }

        // 2. Check if user is already in the team
        const existingMember = await db.teamMember.findFirst({
            where: {
                teamId,
                user: {
                    email,
                }
            }
        });

        if (existingMember) {
            return NextResponse.json({ error: "User is already a member of this team" }, { status: 400 });
        }

        // 3. Check for pending invites
        const existingInvite = await db.teamInvite.findUnique({
            where: {
                teamId_email: {
                    teamId,
                    email,
                },
            },
        });

        if (existingInvite) {
            // Logic to resend invite or error
            // For now, we'll error
            return NextResponse.json({ error: "Invite already sent" }, { status: 400 });
        }

        // 4. Create Invite
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invite = await db.teamInvite.create({
            data: {
                email,
                teamId,
                role,
                token,
                expiresAt,
            },
            include: {
                team: true
            }
        });

        // Send invitation email
        const acceptUrl = `http://localhost:3000/invite/${token}`;

        try {
            await sendEmail({
                to: email,
                subject: `You've been invited to join ${invite.team.name} on DocuMint AI`,
                html: emailTemplates.teamInvite(
                    currentUser.name || currentUser.email || 'Someone',
                    invite.team.name,
                    acceptUrl
                ),
            });
            console.log(`Sent team invitation email to ${email}`);
        } catch (emailError) {
            console.error("Failed to send invitation email:", emailError);
            // Continue anyway, email is non-critical
        }

        // 5. Create in-app notification if user exists
        const invitedUser = await db.user.findUnique({ where: { email } });
        if (invitedUser) {
            await db.notification.create({
                data: {
                    userId: invitedUser.id,
                    type: "INVITE",
                    message: `${currentUser.name || "Someone"} invited you to join ${invite.team.name}`,
                    link: acceptUrl, // In real app, this might be a dashboard link to invites
                }
            });
        }

        return NextResponse.json({ success: true, invite });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error("Invite error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

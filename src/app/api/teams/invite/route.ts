import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Assuming authOptions is exported here, need to verify
import { db } from "@/lib/db";
import { z } from "zod";
import { randomBytes } from "crypto";

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

        // TODO: Send email
        console.log(`[INVITE] Link for ${email}: http://localhost:3000/invite/${token}`);

        return NextResponse.json({ success: true, invite });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error("Invite error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

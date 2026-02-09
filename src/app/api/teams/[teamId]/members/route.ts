import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id && !session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { teamId } = await params;

        // Verify user is in the team
        const currentUserEmail = session.user.email!;
        const currentUser = await db.user.findUnique({ where: { email: currentUserEmail } });

        if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const membership = await db.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId,
                    userId: currentUser.id
                }
            }
        });

        if (!membership) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Fetch members
        const members = await db.teamMember.findMany({
            where: { teamId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true
                    }
                }
            },
            orderBy: { joinedAt: 'asc' }
        });

        return NextResponse.json({ members });

    } catch (error) {
        console.error("List members error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { teamId } = await params;
        const { searchParams } = new URL(req.url);
        const targetUserId = searchParams.get("userId");

        if (!targetUserId) {
            return NextResponse.json({ error: "User ID is required" }, { status: 400 });
        }

        // Get current user (requester)
        const requester = await db.user.findUnique({ where: { email: session.user.email } });
        if (!requester) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Get requester's role
        const requesterMembership = await db.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId,
                    userId: requester.id
                }
            }
        });

        if (!requesterMembership) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Self-leave logic (allow anyone to leave, except last owner?)
        const isSelf = requester.id === targetUserId;

        // Get target member to check their role
        const targetMembership = await db.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId,
                    userId: targetUserId
                }
            }
        });

        if (!targetMembership) {
            return NextResponse.json({ error: "Member not found" }, { status: 404 });
        }

        if (isSelf) {
            // Check if last owner
            if (targetMembership.role === "OWNER") {
                const ownerCount = await db.teamMember.count({
                    where: { teamId, role: "OWNER" }
                });
                if (ownerCount === 1) {
                    return NextResponse.json({ error: "Cannot leave as the last owner. Delete the team instead." }, { status: 400 });
                }
            }
        } else {
            // Removing someone else
            // Rule: Only ADMIN or OWNER can remove others
            if (requesterMembership.role !== "ADMIN" && requesterMembership.role !== "OWNER") {
                return NextResponse.json({ error: "You don't have permission to remove members" }, { status: 403 });
            }

            // Rule: ADMINs cannot remove OWNERs
            if (requesterMembership.role === "ADMIN" && targetMembership.role === "OWNER") {
                return NextResponse.json({ error: "Admins cannot remove Owners" }, { status: 403 });
            }
        }

        // Perform removal
        await db.teamMember.delete({
            where: {
                teamId_userId: {
                    teamId,
                    userId: targetUserId
                }
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Remove member error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

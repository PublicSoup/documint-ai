import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

/**
 * GET /api/teams
 * Returns a list of teams the current user is a member of.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const teamMemberships = await db.teamMember.findMany({
            where: { userId: session.user.id },
            include: {
                team: {
                    include: {
                        _count: {
                            select: { members: true },
                        },
                        members: {
                            include: {
                                user: {
                                    select: {
                                        name: true,
                                        email: true,
                                        image: true,
                                    },
                                },
                            },
                            orderBy: { joinedAt: "asc" },
                        },
                        invites: {
                            orderBy: { createdAt: "desc" },
                        },
                    },
                },
            },
            orderBy: { joinedAt: "asc" },
        });

        const teams = teamMemberships.map((membership) => ({
            id: membership.team.id,
            name: membership.team.name,
            role: membership.role,
            memberCount: membership.team._count.members,
            members: membership.team.members.map((member) => ({
                userId: member.userId,
                role: member.role,
                user: {
                    name: member.user.name,
                    email: member.user.email,
                    image: member.user.image,
                },
            })),
            invites: (membership.role === "OWNER" || membership.role === "ADMIN")
                ? membership.team.invites.map((invite) => ({
                    id: invite.id,
                    email: invite.email,
                    role: invite.role,
                    createdAt: invite.createdAt,
                }))
                : [],
            joinedAt: membership.joinedAt,
            slug: membership.team.slug,
        }));

        return NextResponse.json({ teams });
    } catch (error) {
        return errorResponse(error);
    }
}

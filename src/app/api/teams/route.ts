import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

interface TeamListResponse {
    teams: Array<{
        id: string;
        name: string;
        role: string;
        memberCount: number;
        members: Array<{
            userId: string;
            role: string;
            user: {
                name: string | null;
                email: string | null;
                image: string | null;
            };
        }>;
        invites: Array<{
            id: string;
            email: string;
            role: string;
            createdAt: Date;
        }>;
        joinedAt: Date;
        slug: string;
    }>;
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

        const teams: TeamListResponse["teams"] = teamMemberships.map((membership) => ({
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
            invites: membership.team.invites.map((invite) => ({
                id: invite.id,
                email: invite.email,
                role: invite.role,
                createdAt: invite.createdAt,
            })),
            joinedAt: membership.joinedAt,
            slug: membership.team.slug,
        }));

        return NextResponse.json({ teams });
    } catch (error) {
        console.error("[Teams_GET] Error:", error);
        return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
    }
}

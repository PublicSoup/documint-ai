import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: {
                teamMembers: {
                    include: {
                        team: {
                            include: {
                                _count: {
                                    select: { members: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Transform to return list of teams with role
        const teams = user.teamMembers.map(tm => ({
            id: tm.team.id,
            name: tm.team.name,
            role: tm.role,
            memberCount: tm.team._count.members,
            joinedAt: tm.joinedAt,
            slug: tm.team.slug
        }));

        return NextResponse.json({ teams });

    } catch (error) {
        console.error("List teams error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

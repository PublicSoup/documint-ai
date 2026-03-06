import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/teams
 * Returns a paginated list of teams the current user is a member of.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = querySchema.safeParse({
            page: req.nextUrl.searchParams.get("page"),
            limit: req.nextUrl.searchParams.get("limit"),
        });

        if (!parsedQuery.success) {
            throw ApiErrors.badRequest("Invalid query parameters", parsedQuery.error.flatten());
        }

        const { page, limit } = parsedQuery.data;
        const skip = (page - 1) * limit;

        const [totalMemberships, teamMemberships] = await db.$transaction([
            db.teamMember.count({
                where: { userId: session.user.id },
            }),
            db.teamMember.findMany({
                where: { userId: session.user.id },
                include: {
                    team: {
                        include: {
                            _count: {
                                select: { members: true },
                            },
                            members: {
                                select: {
                                    userId: true,
                                    role: true,
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
                                select: {
                                    id: true,
                                    email: true,
                                    role: true,
                                    createdAt: true,
                                },
                                orderBy: { createdAt: "desc" },
                            },
                        },
                    },
                },
                orderBy: {
                    team: {
                        updatedAt: "desc"
                    }
                },
                take: limit,
                skip,
            }),
        ]);

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
            updatedAt: membership.team.updatedAt,
            joinedAt: membership.joinedAt,
            slug: membership.team.slug,
        }));

        const totalPages = Math.ceil(totalMemberships / limit);

        return NextResponse.json({
            teams,
            pagination: {
                page,
                limit,
                totalPages,
                totalResults: totalMemberships,
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}

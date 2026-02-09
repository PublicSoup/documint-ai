import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guards";
import { errorResponse, successResponse, ApiErrors } from "@/lib/api-utils";

export async function GET() {
    try {
        const user = await requireAuth();

        if (!user.email) {
            throw ApiErrors.badRequest("User email is required");
        }

        const dbUser = await db.user.findUnique({
            where: { email: user.email },
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

        if (!dbUser) {
            throw ApiErrors.notFound("User");
        }

        // Transform to return list of teams with role
        const teams = dbUser.teamMembers.map(tm => ({
            id: tm.team.id,
            name: tm.team.name,
            role: tm.role,
            memberCount: tm.team._count.members,
            joinedAt: tm.joinedAt,
            slug: tm.team.slug
        }));

        return successResponse({ teams });

    } catch (error) {
        return errorResponse(error);
    }
}

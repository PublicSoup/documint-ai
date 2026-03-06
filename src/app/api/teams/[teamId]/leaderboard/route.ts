
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";

// Define action types and their corresponding points
const ACTION_POINTS: Record<string, number> = {
  VERIFY_DOCS: 15, // For approvals
  CREATE_DOCS: 10, // For new documentation
  UPDATE_DOCS: 5,  // For updates
};

const routeContextSchema = z.object({
  params: z.object({
    teamId: z.string(),
  }),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ teamId: string }> }
) {
  try {
    // 1. Await and Validate Input
    const resolvedParams = await context.params;
    const { params } = routeContextSchema.parse({ params: resolvedParams });
    const { teamId } = params;

    // 2. Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 3. Rate Limiting
    const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const limit = await rateLimit(ip);
    if (limit && !limit.success) {
      return new NextResponse("Too many requests", { status: 429 });
    }

    // 4. Authorize: Check if user is a member of the team
    const membership = await db.teamMember.findFirst({
      where: {
        teamId: teamId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 5. Fetch team members to build the base for the leaderboard
    const teamMembers = await db.teamMember.findMany({
        where: { teamId: teamId },
        include: { user: { select: { id: true, name: true, image: true } } }
    });

    // 6. Fetch and process audit logs to calculate points
    const auditLogs = await db.auditLog.groupBy({
        by: ['userId', 'action'],
        where: {
            userId: { in: teamMembers.map(tm => tm.userId) },
            action: { in: Object.keys(ACTION_POINTS) },
        },
        _count: {
            action: true,
        },
    });

    // 7. Calculate scores for each user
    const userScores: Record<string, { points: number; approvals: number; updates: number; creations: number }> = {};

    for (const log of auditLogs) {
        if (log.userId) {
            if (!userScores[log.userId]) {
                userScores[log.userId] = { points: 0, approvals: 0, updates: 0, creations: 0 };
            }
            const points = ACTION_POINTS[log.action] || 0;
            const count = log._count.action;
            
            userScores[log.userId].points += points * count;

            if (log.action === 'VERIFY_DOCS') userScores[log.userId].approvals += count;
            if (log.action === 'CREATE_DOCS') userScores[log.userId].creations += count;
            if (log.action === 'UPDATE_DOCS') userScores[log.userId].updates += count;
        }
    }

    // 8. Construct the final leaderboard data
    const leaderboard = teamMembers.map(member => {
        const scores = userScores[member.userId] || { points: 0, approvals: 0, updates: 0, creations: 0 };
        return {
            userId: member.user.id,
            name: member.user.name || 'Anonymous',
            image: member.user.image || null,
            role: member.role,
            points: scores.points,
            approvals: scores.approvals,
            updates: scores.updates,
            creations: scores.creations,
        };
    })
    .filter(member => member.points > 0)
    .sort((a, b) => b.points - a.points);


    return NextResponse.json({ leaderboard });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.issues), { status: 422 });
    }

    console.error("[LEADERBOARD_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

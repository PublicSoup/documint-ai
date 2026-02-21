import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const updateTeamSchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
});

async function ensureOwner(teamId: string, userId: string) {
    const membership = await db.teamMember.findUnique({
        where: {
            teamId_userId: { teamId, userId },
        },
        select: { role: true },
    });

    return membership?.role === "OWNER";
}

/**
 * PATCH /api/teams/[teamId]
 * Update team general settings (name, slug). Requires OWNER role.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedBody = updateTeamSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "Invalid payload" }, { status: 400 });
        }

        const isOwner = await ensureOwner(teamId, session.user.id);
        if (!isOwner) {
            return NextResponse.json({ error: "Forbidden: Only team owners can change team settings" }, { status: 403 });
        }

        const existingTeam = await db.team.findUnique({
            where: { id: teamId },
            select: { id: true },
        });

        if (!existingTeam) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
        }

        const { name, slug } = parsedBody.data;

        if (slug) {
            const slugConflict = await db.team.findFirst({
                where: { slug, id: { not: teamId } },
                select: { id: true },
            });

            if (slugConflict) {
                return NextResponse.json({ error: "Slug already in use" }, { status: 400 });
            }
        }

        const team = await db.team.update({
            where: { id: teamId },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(slug !== undefined ? { slug } : {}),
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "UPDATE_TEAM",
                entity: "Team",
                entityId: teamId,
                details: {
                    updatedFields: Object.keys(parsedBody.data),
                },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ team });
    } catch (error) {
        console.error("[Team_PATCH] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * DELETE /api/teams/[teamId]
 * Delete a team and all associated data. Requires OWNER role.
 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const isOwner = await ensureOwner(teamId, session.user.id);
        if (!isOwner) {
            return NextResponse.json({ error: "Forbidden: Only team owners can delete teams" }, { status: 403 });
        }

        const existingTeam = await db.team.findUnique({
            where: { id: teamId },
            select: { id: true },
        });

        if (!existingTeam) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
        }

        await db.team.delete({
            where: { id: teamId },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "DELETE_TEAM",
                entity: "Team",
                entityId: teamId,
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Team_DELETE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

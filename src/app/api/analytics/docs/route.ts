import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { getAnalyticsData } from "@/lib/analytics";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const analyticsQuerySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
    days: z.coerce.number().int().min(7).max(365).default(30),
}).strict();

const trackViewSchema = z.object({
    fileId: z.string().trim().min(1).max(100),
    duration: z.coerce.number().int().min(0).max(60 * 60 * 12).default(0),
}).strict();

type TeamConfig = {
    coverageGoal?: number;
};

const sessionIdPattern = /^[A-Za-z0-9:_-]{8,255}$/;

function sanitizeSessionId(value: string | null | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    const capped = trimmed.slice(0, 255);
    if (!sessionIdPattern.test(capped)) {
        return null;
    }

    return capped;
}

async function parseTrackViewBody(request: NextRequest): Promise<z.infer<typeof trackViewSchema> | null> {
    let rawBody: unknown;

    try {
        rawBody = await request.json();
    } catch {
        return null;
    }

    const parsedBody = trackViewSchema.safeParse(rawBody);
    return parsedBody.success ? parsedBody.data : null;
}

export async function GET(request: NextRequest) {
    try {
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = analyticsQuerySchema.safeParse({
            teamId: request.nextUrl.searchParams.get("teamId") ?? undefined,
            days: request.nextUrl.searchParams.get("days") ?? undefined,
        });

        if (!parsedQuery.success) {
            throw ApiErrors.badRequest("Invalid query parameters", parsedQuery.error.flatten());
        }

        const { teamId, days } = parsedQuery.data;

        let teamInfo: { name: string; memberCount: number; coverageGoal: number } | undefined;

        if (teamId) {
            const team = await db.team.findUnique({
                where: { id: teamId },
                include: {
                    _count: { select: { members: true } },
                    members: {
                        where: { userId: session.user.id },
                        select: { role: true }
                    },
                    integrations: {
                        where: { type: "TEAM_CONFIG" },
                        take: 1,
                        select: { config: true },
                    },
                },
            });

            if (!team || team.members.length === 0) {
                throw ApiErrors.forbidden();
            }

            const rawConfig = team.integrations[0]?.config;
            const config = (rawConfig && typeof rawConfig === "object" ? rawConfig : {}) as TeamConfig;

            teamInfo = {
                name: team.name,
                memberCount: team._count.members,
                coverageGoal: config.coverageGoal ?? 80,
            };
        }

        const data = await getAnalyticsData(session.user.id, teamId, days);

        return NextResponse.json({ ...data, teamInfo });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const gateError = await requireFeature("analytics");
        if (gateError) {
            return gateError;
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const body = await parseTrackViewBody(request);
        if (!body) {
            throw ApiErrors.badRequest("Invalid payload");
        }

        const { fileId, duration } = body;

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, userId: true, teamId: true },
        });

        if (!file) {
            throw ApiErrors.notFound("File");
        }

        if (file.teamId) {
            const canView = await checkTeamPermission(session.user.id, file.teamId, "view");
            if (!canView) {
                throw ApiErrors.forbidden();
            }
        } else if (file.userId !== session.user.id) {
            throw ApiErrors.forbidden();
        }

        const ip = await getClientIP(request);
        const sessionId = sanitizeSessionId(request.headers.get("x-session-id")) ?? ip;

        await db.docView.create({
            data: {
                fileId,
                userId: session.user.id,
                sessionId,
                duration,
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "TRACK_DOC_VIEW",
                entity: "DocView",
                entityId: fileId,
                details: {
                    duration,
                    teamId: file.teamId ?? null,
                },
            });
        } catch {
            // Keep analytics ingestion non-blocking if audit persistence fails.
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}

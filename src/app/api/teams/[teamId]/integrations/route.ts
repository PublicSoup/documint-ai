import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const jsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(jsonValueSchema),
        z.record(z.string(), jsonValueSchema),
    ]),
);

const teamConfigSchema = z.object({
    coverageGoal: z.number().int().min(0).max(100).optional(),
    requireApproval: z.boolean().optional(),
    lockApproved: z.boolean().optional(),
    driftAlerts: z.boolean().optional(),
    autoGithubSync: z.boolean().optional(),
    githubRepo: z.string().trim().max(200).optional(),
    retentionDays: z.number().int().min(0).max(365).optional(),
    styleGuide: z.string().max(10_000).optional(),
    apiGuidelines: z.string().max(10_000).optional(),
}).strict();

const webhookIntegrationSchema = z.object({
    type: z.enum(["SLACK", "DISCORD"]),
    config: z.object({
        webhookUrl: z.string().trim().url().max(2048),
    }).strict(),
}).strict();

const teamConfigIntegrationSchema = z.object({
    type: z.literal("TEAM_CONFIG"),
    config: teamConfigSchema,
}).strict();

const postBodySchema = z.discriminatedUnion("type", [
    teamConfigIntegrationSchema,
    webhookIntegrationSchema,
]);

function isValidWebhookForType(type: "SLACK" | "DISCORD", webhookUrl: string): boolean {
    if (type === "SLACK") {
        return webhookUrl.startsWith("https://hooks.slack.com/");
    }

    return webhookUrl.startsWith("https://discord.com/api/webhooks/");
}

/**
 * GET /api/teams/[teamId]/integrations
 * List all integrations for a team.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const hasPermission = await checkTeamPermission(session.user.id, parsedParams.data.teamId, "view");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const integrations = await db.integration.findMany({
            where: { teamId: parsedParams.data.teamId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                type: true,
                config: true,
                isActive: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ integrations });
    } catch (error) {
        console.error("[TeamIntegrations_GET] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * POST /api/teams/[teamId]/integrations
 * Create or update a team integration.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const hasPermission = await checkTeamPermission(session.user.id, parsedParams.data.teamId, "manage");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const parsedBody = postBodySchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid integration payload" }, { status: 400 });
        }

        const { type, config } = parsedBody.data;

        if (type === "TEAM_CONFIG") {
            const existing = await db.integration.findFirst({
                where: { teamId: parsedParams.data.teamId, type: "TEAM_CONFIG" },
                select: { id: true },
            });

            const payloadConfig = config as Prisma.InputJsonObject;

            const integration = existing
                ? await db.integration.update({
                    where: { id: existing.id },
                    data: { config: payloadConfig },
                })
                : await db.integration.create({
                    data: {
                        teamId: parsedParams.data.teamId,
                        type: "TEAM_CONFIG",
                        config: payloadConfig,
                        isActive: true,
                    },
                });

            try {
                const { logAudit } = await import("@/lib/audit-logger");
                await logAudit({
                    userId: session.user.id,
                    action: "UPDATE_TEAM_CONFIG",
                    entity: "Team",
                    entityId: parsedParams.data.teamId,
                    details: {
                        keys: Object.keys(config),
                    },
                });
            } catch {
                // Keep mutation non-blocking when audit logging fails.
            }

            return NextResponse.json({ integration });
        }

        if (!isValidWebhookForType(type, config.webhookUrl)) {
            return NextResponse.json({ error: "Invalid webhook URL for selected provider" }, { status: 400 });
        }

        const integration = await db.integration.create({
            data: {
                teamId: parsedParams.data.teamId,
                type,
                config: { webhookUrl: config.webhookUrl },
                isActive: true,
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_INTEGRATION",
                entity: "Team",
                entityId: parsedParams.data.teamId,
                details: {
                    type,
                    integrationId: integration.id,
                },
            });
        } catch {
            // Keep mutation non-blocking when audit logging fails.
        }

        return NextResponse.json({ integration }, { status: 201 });
    } catch (error) {
        console.error("[TeamIntegrations_POST] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

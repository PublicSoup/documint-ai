import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma, Integration } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

const teamConfigSchema = z
    .object({
        coverageGoal: z.number().int().min(0).max(100).optional(),
        requireApproval: z.boolean().optional(),
        lockApproved: z.boolean().optional(),
        driftAlerts: z.boolean().optional(),
        autoGithubSync: z.boolean().optional(),
        githubRepo: z.string().trim().max(200).optional(),
        retentionDays: z.number().int().min(0).max(365).optional(),
        styleGuide: z.string().max(10_000).optional(),
        apiGuidelines: z.string().max(10_000).optional(),
    })
    .strict();

const webhookIntegrationSchema = z
    .object({
        type: z.enum(["SLACK", "DISCORD"]),
        config: z
            .object({
                webhookUrl: z.string().trim().url().max(2048),
            })
            .strict(),
    })
    .strict();

const teamConfigIntegrationSchema = z
    .object({
        type: z.literal("TEAM_CONFIG"),
        config: teamConfigSchema,
    })
    .strict();

const postBodySchema = z.discriminatedUnion("type", [
    teamConfigIntegrationSchema,
    webhookIntegrationSchema,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidWebhookForType(type: "SLACK" | "DISCORD", webhookUrl: string): boolean {
    if (type === "SLACK") {
        return webhookUrl.startsWith("https://hooks.slack.com/");
    }

    return webhookUrl.startsWith("https://discord.com/api/webhooks/");
}

function maskWebhookUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const tail = parsed.pathname.split("/").filter(Boolean).slice(-2).join("/");
        return `${parsed.origin}/.../${tail || "hidden"}`;
    } catch {
        return "Webhook URL unavailable";
    }
}

function sanitizeConfigForRead(type: string, config: Prisma.JsonValue, canManage: boolean): Prisma.JsonValue {
    if (canManage) {
        return config;
    }

    if ((type === "SLACK" || type === "DISCORD") && isRecord(config)) {
        const webhookUrl = config.webhookUrl;
        const maskedWebhook = typeof webhookUrl === "string" ? maskWebhookUrl(webhookUrl) : "Webhook URL unavailable";

        return {
            ...config,
            webhookUrl: maskedWebhook,
        } as Prisma.JsonObject;
    }

    return config;
}

async function parseTeamId(params: Promise<{ teamId: string }>): Promise<string> {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
        throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
    }

    return parsedParams.data.teamId;
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
        const teamId = await parseTeamId(params);

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const [canView, canManage] = await Promise.all([
            checkTeamPermission(session.user.id, teamId, "view"),
            checkTeamPermission(session.user.id, teamId, "manage"),
        ]);

        if (!canView) {
            throw ApiErrors.forbidden();
        }

        const integrations = await db.integration.findMany({
            where: { teamId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                type: true,
                config: true,
                isActive: true,
                createdAt: true,
            },
        });

        const sanitizedIntegrations = integrations.map((integration: Integration) => ({
            ...integration,
            config: sanitizeConfigForRead(integration.type, integration.config, canManage),
        }));

        return NextResponse.json({ integrations: sanitizedIntegrations, permissions: { canManage } });
    } catch (error) {
        return errorResponse(error);
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
        const teamId = await parseTeamId(params);

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const canManage = await checkTeamPermission(session.user.id, teamId, "manage");
        if (!canManage) {
            throw ApiErrors.forbidden("Team manager access required");
        }

        const payload = await validateBody(request, postBodySchema);

        if (payload.type === "TEAM_CONFIG") {
            const existing = await db.integration.findFirst({
                where: { teamId, type: "TEAM_CONFIG" },
                select: { id: true },
            });

            const config = payload.config as Prisma.InputJsonValue;

            const integration = existing
                ? await db.integration.update({
                      where: { id: existing.id },
                      data: { config },
                  })
                : await db.integration.create({
                      data: {
                          teamId,
                          type: "TEAM_CONFIG",
                          config,
                          isActive: true,
                      },
                  });

            try {
                const { logAudit } = await import("@/lib/audit-logger");
                await logAudit({
                    userId: session.user.id,
                    action: "UPDATE_TEAM_CONFIG",
                    entity: "Team",
                    entityId: teamId,
                    details: {
                        keys: Object.keys(payload.config),
                    },
                });
            } catch {
                // Keep mutation non-blocking when audit logging fails.
            }

            return NextResponse.json({ integration });
        }

        const { type, config } = payload;
        if (!isValidWebhookForType(type, config.webhookUrl)) {
            throw ApiErrors.badRequest("Invalid webhook URL for selected provider");
        }

        const existingWebhookIntegration = await db.integration.findFirst({
            where: { teamId, type },
            select: { id: true },
        });

        const integration = existingWebhookIntegration
            ? await db.integration.update({
                  where: { id: existingWebhookIntegration.id },
                  data: {
                      config: { webhookUrl: config.webhookUrl },
                      isActive: true,
                  },
              })
            : await db.integration.create({
                  data: {
                      teamId,
                      type,
                      config: { webhookUrl: config.webhookUrl },
                      isActive: true,
                  },
              });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: existingWebhookIntegration ? "UPDATE_INTEGRATION" : "CREATE_INTEGRATION",
                entity: "Team",
                entityId: teamId,
                details: {
                    type,
                    integrationId: integration.id,
                },
            });
        } catch {
            // Keep mutation non-blocking when audit logging fails.
        }

        return NextResponse.json(
            { integration },
            { status: existingWebhookIntegration ? 200 : 201 },
        );
    } catch (error) {
        return errorResponse(error);
    }
}

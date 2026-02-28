import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification, NotificationType } from "@/lib/notifications";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const notificationTypes = [
    "DOC_DRIFT",
    "BATCH_DRIFT",
    "INTENT_DRIFT",
    "REVIEW_REQUESTED",
    "NEW_COMMENT",
    "MENTION",
    "TEAM_HEALTH",
    "TEAM_HEALTH_ALERT",
    "DOC_APPROVED",
    "POLICY_EXPIRE",
    "CRITICAL_AUDIT",
    "INVITE",
    "TEAM_JOIN",
    "SYSTEM",
] as const;

const storedSettingsSchema = z
    .object({
        slackWebhook: z.string().url().max(2048).nullable().optional(),
        discordWebhook: z.string().url().max(2048).nullable().optional(),
        notifyOnDocChange: z.boolean().optional(),
        notifyOnReview: z.boolean().optional(),
        notifyOnComment: z.boolean().optional(),
        notifyOnMention: z.boolean().optional(),
        notifyOnScheduledRun: z.boolean().optional(),
        autoRegenerate: z.boolean().optional(),
        marketingEmails: z.boolean().optional(),
    })
    .passthrough();

const webhookFieldSchema = z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().url().max(2048).nullable().optional(),
);

const putBodySchema = z
    .object({
        slackWebhook: webhookFieldSchema,
        discordWebhook: webhookFieldSchema,
        notifications: z
            .object({
                notifyOnDocChange: z.boolean().optional(),
                notifyOnReview: z.boolean().optional(),
                notifyOnComment: z.boolean().optional(),
                notifyOnMention: z.boolean().optional(),
                notifyOnScheduledRun: z.boolean().optional(),
                autoRegenerate: z.boolean().optional(),
                marketingEmails: z.boolean().optional(),
            })
            .partial()
            .optional(),
    })
    .strict();

const postBodySchema = z
    .object({
        userId: z.string().trim().min(1).max(100).optional(),
        teamId: z.string().trim().min(1).max(100).optional(),
        type: z.enum(notificationTypes),
        title: z.string().trim().min(1).max(180),
        message: z.string().trim().min(1).max(4000),
        fileId: z.string().trim().min(1).max(100).optional(),
        fileName: z.string().trim().min(1).max(255).optional(),
        link: z.string().trim().url().max(2048).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.userId || value.teamId), {
        message: "Either userId or teamId is required",
    });

type StoredSettings = z.infer<typeof storedSettingsSchema>;

function parseStoredSettings(value: unknown): StoredSettings {
    const parsed = storedSettingsSchema.safeParse(value);
    return parsed.success ? parsed.data : {};
}

function toNotificationType(type: z.infer<typeof postBodySchema>["type"]): NotificationType {
    return type;
}

function hasValidSystemToken(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return false;
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return false;
    }

    const providedToken = authHeader.slice("Bearer ".length);
    const expectedBuffer = Buffer.from(cronSecret);
    const providedBuffer = Buffer.from(providedToken);

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
}

async function logNotificationDispatchAudit(params: {
    actorUserId: string | null;
    isSystemAction: boolean;
    targetUserId: string | null;
    targetTeamId: string | null;
    notificationType: NotificationType;
    deliveryCount: number;
}): Promise<void> {
    try {
        const { logAudit } = await import("@/lib/audit-logger");
        await logAudit({
            userId: params.actorUserId ?? undefined,
            action: "DISPATCH_NOTIFICATION",
            entity: "Notification",
            entityId: params.targetTeamId ?? params.targetUserId ?? "unknown",
            details: {
                actorType: params.isSystemAction ? "system" : "user",
                targetUserId: params.targetUserId,
                targetTeamId: params.targetTeamId,
                notificationType: params.notificationType,
                deliveryCount: params.deliveryCount,
            },
        });
    } catch {
        // Keep notification dispatch non-blocking when audit storage is degraded.
    }
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const settings = parseStoredSettings(user?.settings);

        return NextResponse.json({
            webhooks: {
                slack: settings.slackWebhook ?? null,
                discord: settings.discordWebhook ?? null,
            },
            notifications: {
                onDocChange: settings.notifyOnDocChange ?? true,
                notifyOnDocChange: settings.notifyOnDocChange ?? true,
                onReview: settings.notifyOnReview ?? true,
                notifyOnReview: settings.notifyOnReview ?? true,
                onComment: settings.notifyOnComment ?? true,
                notifyOnComment: settings.notifyOnComment ?? true,
                onMention: settings.notifyOnMention ?? true,
                notifyOnMention: settings.notifyOnMention ?? true,
                onScheduledRun: settings.notifyOnScheduledRun ?? true,
                notifyOnScheduledRun: settings.notifyOnScheduledRun ?? true,
                autoRegenerate: settings.autoRegenerate ?? false,
                marketingEmails: settings.marketingEmails ?? false,
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function PUT(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { slackWebhook, discordWebhook, notifications } = await validateBody(request, putBodySchema);

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const currentSettings = parseStoredSettings(user?.settings);

        const nextSettings: StoredSettings = {
            ...currentSettings,
            ...(notifications ?? {}),
        };

        if (slackWebhook !== undefined) {
            nextSettings.slackWebhook = slackWebhook;
        }

        if (discordWebhook !== undefined) {
            nextSettings.discordWebhook = discordWebhook;
        }

        await db.user.update({
            where: { id: session.user.id },
            data: {
                settings: nextSettings as Prisma.InputJsonValue,
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "UPDATE_NOTIFICATION_SETTINGS",
                entity: "User",
                entityId: session.user.id,
                details: {
                    updatedSlack: slackWebhook !== undefined,
                    updatedDiscord: discordWebhook !== undefined,
                    notificationChanges: notifications ? Object.keys(notifications) : [],
                },
            });
        } catch {
            // Keep mutation non-blocking if audit persistence fails.
        }

        return NextResponse.json({ message: "Settings updated" });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const isSystemAction = hasValidSystemToken(request);

        let currentUserId: string | undefined;

        if (!isSystemAction) {
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                throw ApiErrors.unauthorized();
            }

            currentUserId = session.user.id;
            await enforceRateLimit(currentUserId, "api");
        }

        const { userId, teamId, type, title, message, fileId, fileName, link } = await validateBody(request, postBodySchema);

        if (!isSystemAction && currentUserId) {
            if (userId && userId !== currentUserId) {
                throw ApiErrors.forbidden("Cannot notify other users directly");
            }

            if (teamId) {
                const canManageTeam = await checkTeamPermission(currentUserId, teamId, "manage");
                if (!canManageTeam) {
                    throw ApiErrors.forbidden("Team manager access required");
                }
            }
        }

        const notificationType = toNotificationType(type);
        const resolvedUserId = userId ?? currentUserId;

        const result = await sendNotification({
            userId: resolvedUserId,
            teamId,
            type: notificationType,
            title,
            message,
            fileId,
            fileName,
            link,
        });

        await logNotificationDispatchAudit({
            actorUserId: currentUserId ?? null,
            isSystemAction,
            targetUserId: resolvedUserId ?? null,
            targetTeamId: teamId ?? null,
            notificationType,
            deliveryCount: Array.isArray(result) ? result.length : 1,
        });

        return NextResponse.json({ success: true, result, results: result });
    } catch (error) {
        return errorResponse(error);
    }
}

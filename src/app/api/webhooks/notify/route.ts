import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification, NotificationType } from "@/lib/notifications";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

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

const storedSettingsSchema = z.object({
    slackWebhook: z.string().url().max(2048).nullable().optional(),
    discordWebhook: z.string().url().max(2048).nullable().optional(),
    notifyOnDocChange: z.boolean().optional(),
    notifyOnReview: z.boolean().optional(),
    notifyOnComment: z.boolean().optional(),
    notifyOnMention: z.boolean().optional(),
    notifyOnScheduledRun: z.boolean().optional(),
    autoRegenerate: z.boolean().optional(),
    marketingEmails: z.boolean().optional(),
}).passthrough();

const webhookFieldSchema = z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().url().max(2048).nullable().optional(),
);

const putBodySchema = z.object({
    slackWebhook: webhookFieldSchema,
    discordWebhook: webhookFieldSchema,
    notifications: z.object({
        notifyOnDocChange: z.boolean().optional(),
        notifyOnReview: z.boolean().optional(),
        notifyOnComment: z.boolean().optional(),
        notifyOnMention: z.boolean().optional(),
        notifyOnScheduledRun: z.boolean().optional(),
        autoRegenerate: z.boolean().optional(),
        marketingEmails: z.boolean().optional(),
    }).partial().optional(),
}).strict();

const postBodySchema = z.object({
    userId: z.string().trim().min(1).max(100).optional(),
    teamId: z.string().trim().min(1).max(100).optional(),
    type: z.enum(notificationTypes),
    title: z.string().trim().min(1).max(180),
    message: z.string().trim().min(1).max(4000),
    fileId: z.string().trim().min(1).max(100).optional(),
    fileName: z.string().trim().min(1).max(255).optional(),
    link: z.string().trim().url().max(2048).optional(),
}).strict();

type StoredSettings = z.infer<typeof storedSettingsSchema>;

function parseStoredSettings(value: unknown): StoredSettings {
    const parsed = storedSettingsSchema.safeParse(value);
    return parsed.success ? parsed.data : {};
}

function toNotificationType(type: z.infer<typeof postBodySchema>["type"]): NotificationType {
    return type;
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
                onReview: settings.notifyOnReview ?? true,
                onComment: settings.notifyOnComment ?? true,
                onMention: settings.notifyOnMention ?? true,
                onScheduledRun: settings.notifyOnScheduledRun ?? true,
                autoRegenerate: settings.autoRegenerate ?? false,
            },
        });
    } catch (error) {
        console.error("Get Webhooks Error:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedBody = putBodySchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
        }

        const { slackWebhook, discordWebhook, notifications } = parsedBody.data;

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
            // Ignore audit write failures to keep settings updates non-blocking
        }

        return NextResponse.json({ message: "Settings updated" });
    } catch (error) {
        console.error("Update Webhooks Error:", error);
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization");
        const isSystemAction = authHeader === `Bearer ${process.env.CRON_SECRET}`;

        let currentUserId: string | undefined;

        if (!isSystemAction) {
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }

            currentUserId = session.user.id;
            await enforceRateLimit(currentUserId, "api");
        }

        const parsedBody = postBodySchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
        }

        const { userId, teamId, type, title, message, fileId, fileName, link } = parsedBody.data;

        if (!isSystemAction && currentUserId) {
            if (userId && userId !== currentUserId) {
                return NextResponse.json({ error: "Forbidden: Cannot notify other users directly" }, { status: 403 });
            }

            if (teamId) {
                const canManageTeam = await checkTeamPermission(currentUserId, teamId, "manage");
                if (!canManageTeam) {
                    return NextResponse.json({ error: "Forbidden: Team manager access required" }, { status: 403 });
                }
            }
        }

        const results = await sendNotification({
            userId: userId ?? currentUserId,
            teamId,
            type: toNotificationType(type),
            title,
            message,
            fileId,
            fileName,
            link,
        });

        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error("Notify Relay Error:", error);
        return NextResponse.json({ error: "Failed to process notification" }, { status: 500 });
    }
}

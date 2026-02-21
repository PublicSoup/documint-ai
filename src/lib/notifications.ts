import { db } from "./db";
import { env } from "./env";

export type NotificationType = 
    | "DOC_DRIFT" 
    | "BATCH_DRIFT" 
    | "INTENT_DRIFT" 
    | "REVIEW_REQUESTED" 
    | "NEW_COMMENT" 
    | "MENTION" 
    | "TEAM_HEALTH" 
    | "TEAM_HEALTH_ALERT" 
    | "DOC_APPROVED"
    | "POLICY_EXPIRE"
    | "CRITICAL_AUDIT"
    | "INVITE"
    | "TEAM_JOIN"
    | "SYSTEM";

interface SendNotificationOptions {
    userId?: string;     // Targeted user
    teamId?: string;     // Targeted team (notifies team webhooks)
    type: NotificationType;
    title: string;
    message: string;
    fileId?: string;
    fileName?: string;
    link?: string;
}

/**
 * Centralized Notification Service
 * Handles In-App notifications, Slack/Discord webhooks, and Email.
 */
export async function sendNotification({
    userId,
    teamId,
    type,
    title,
    message,
    fileId,
    fileName,
    link
}: SendNotificationOptions) {
    try {
        const results = {
            inApp: false,
            webhooks: [] as { platform: string; success: boolean; target: string }[]
        };

        // 1. In-App Notification
        if (userId && userId !== "SYSTEM") {
            try {
                await db.notification.create({
                    data: {
                        userId,
                        type,
                        message: title ? `**${title}**: ${message}` : message,
                        link: link || (fileId ? `/dashboard?docId=${fileId}${teamId ? `&teamId=${teamId}` : ""}` : undefined)
                    }
                });
                results.inApp = true;
            } catch (e) {
                console.error("In-app notification failed:", e);
            }
        }

        // 2. Webhook Notifications
        const webhookTargets: { url: string; platform: "slack" | "discord"; type: "user" | "team" }[] = [];

        // 2a. User Webhooks
        if (userId) {
            const user = await db.user.findUnique({
                where: { id: userId },
                select: { settings: true }
            });
            const settings = (user?.settings ?? {}) as {
                notifyOnDocChange?: boolean;
                notifyOnReview?: boolean;
                notifyOnComment?: boolean;
                notifyOnMention?: boolean;
                notifyOnScheduledRun?: boolean;
                slackWebhook?: string;
                discordWebhook?: string;
            };

            // Check preference toggles
            const shouldSend = 
                (["DOC_DRIFT", "BATCH_DRIFT", "INTENT_DRIFT"].includes(type) && (settings.notifyOnDocChange !== false)) ||
                (type === "REVIEW_REQUESTED" && (settings.notifyOnReview !== false)) ||
                (type === "NEW_COMMENT" && (settings.notifyOnComment !== false)) ||
                (type === "MENTION" && (settings.notifyOnMention !== false)) ||
                (["TEAM_HEALTH", "TEAM_HEALTH_ALERT"].includes(type) && (settings.notifyOnScheduledRun !== false)) ||
                (!["DOC_DRIFT", "BATCH_DRIFT", "INTENT_DRIFT", "REVIEW_REQUESTED", "TEAM_HEALTH", "TEAM_HEALTH_ALERT", "NEW_COMMENT", "MENTION"].includes(type));

            if (shouldSend) {
                if (settings.slackWebhook) webhookTargets.push({ url: settings.slackWebhook, platform: "slack", type: "user" });
                if (settings.discordWebhook) webhookTargets.push({ url: settings.discordWebhook, platform: "discord", type: "user" });
            }
        }

        // 2b. Team Webhooks
        if (teamId) {
            const teamConfig = await db.integration.findFirst({
                where: { teamId, type: "TEAM_CONFIG", isActive: true }
            });
            const config = (teamConfig?.config ?? {}) as { driftAlerts?: boolean };

            const isDrift = ["DOC_DRIFT", "BATCH_DRIFT", "INTENT_DRIFT"].includes(type);
            const shouldSendTeam = !isDrift || config.driftAlerts !== false;

            if (shouldSendTeam) {
                const teamIntegrations = await db.integration.findMany({
                    where: { 
                        teamId, 
                        isActive: true,
                        type: { in: ["SLACK", "DISCORD"] }
                    }
                });

                for (const integration of teamIntegrations) {
                    const iConfig = integration.config as { webhookUrl?: string } | null;
                    if (iConfig?.webhookUrl) {
                        webhookTargets.push({ 
                            url: iConfig.webhookUrl, 
                            platform: integration.type.toLowerCase() as "slack" | "discord", 
                            type: "team" 
                        });
                    }
                }
            }
        }

        // Send all webhooks
        for (const target of webhookTargets) {
            try {
                const res = await sendToPlatform(target.platform, target.url, title, message, fileName, type, target.type, fileId, teamId);
                results.webhooks.push({ platform: target.platform, success: res.success, target: target.type });
            } catch (e) {
                results.webhooks.push({ platform: target.platform, success: false, target: target.type });
            }
        }

        // 3. Audit Log
        try {
            const { logAudit } = await import("./audit-logger");
            await logAudit({
                userId: userId || "SYSTEM",
                action: "SEND_NOTIFICATION",
                entity: teamId ? "Team" : "Notification",
                entityId: teamId || userId || "SYSTEM",
                details: { type, title, targets: results.webhooks.map(w => `${w.platform}:${w.target}`) }
            });
        } catch (e) {}

        return results;

    } catch (error) {
        console.error("Central Notification Error:", error);
        throw error;
    }
}

async function sendToPlatform(
    platform: "slack" | "discord", 
    url: string, 
    title: string, 
    message: string, 
    fileName: string | undefined, 
    type: string,
    targetType: "user" | "team",
    fileId?: string,
    teamId?: string
) {
    const dashboardUrl = fileId 
        ? `${env.NEXT_PUBLIC_APP_URL}/dashboard?docId=${fileId}${teamId ? `&teamId=${teamId}` : ""}`
        : `${env.NEXT_PUBLIC_APP_URL}/dashboard`;

    let body;
    if (platform === "slack") {
        body = {
            blocks: [
                {
                    type: "header",
                    text: { type: "plain_text", text: `📝 ${title}` }
                },
                {
                    type: "section",
                    text: { type: "mrkdwn", text: message }
                },
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: { type: "plain_text", text: "View Documentation" },
                            url: dashboardUrl,
                            style: "primary"
                        }
                    ]
                },
                {
                    type: "context",
                    elements: [
                        { type: "mrkdwn", text: `Source: *${targetType}* | File: *${fileName || "N/A"}* | Type: ${type}` }
                    ]
                }
            ]
        };
    } else {
        body = {
            embeds: [{
                title: `📝 ${title}`,
                description: `${message}\n\n[**View in Dashboard**](${dashboardUrl})`,
                color: targetType === "user" ? 0x7C3AED : 0x4F46E5,
                footer: {
                    text: `DocuMint AI • ${type} • ${targetType}`
                },
                timestamp: new Date().toISOString()
            }]
        };
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    return { success: res.ok };
}

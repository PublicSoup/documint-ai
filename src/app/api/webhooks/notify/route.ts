import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET: Get notification settings
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true }
        });

        const settings = (user?.settings as any) || {};

        return NextResponse.json({
            webhooks: {
                slack: settings.slackWebhook || null,
                discord: settings.discordWebhook || null
            },
            notifications: {
                onDocChange: settings.notifyOnDocChange ?? true,
                onReview: settings.notifyOnReview ?? true,
                onMention: settings.notifyOnMention ?? true,
                onScheduledRun: settings.notifyOnScheduledRun ?? true
            }
        });

    } catch (error) {
        console.error("Get Webhooks Error:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

// PUT: Update webhook settings
export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { slackWebhook, discordWebhook, notifications } = await req.json();

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true }
        });

        const currentSettings = (user?.settings as any) || {};

        await db.user.update({
            where: { id: session.user.id },
            data: {
                settings: {
                    ...currentSettings,
                    slackWebhook: slackWebhook || currentSettings.slackWebhook,
                    discordWebhook: discordWebhook || currentSettings.discordWebhook,
                    ...notifications
                }
            }
        });

        return NextResponse.json({ message: "Settings updated" });

    } catch (error) {
        console.error("Update Webhooks Error:", error);
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}

// POST: Send notification to webhooks
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { type, title, message, fileId, fileName } = await req.json();

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true }
        });

        const settings = (user?.settings as any) || {};
        const results: { platform: string; success: boolean; error?: string }[] = [];

        // Send to Slack
        if (settings.slackWebhook) {
            try {
                const res = await fetch(settings.slackWebhook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
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
                                type: "context",
                                elements: [
                                    { type: "mrkdwn", text: `File: *${fileName || "N/A"}* | Type: ${type}` }
                                ]
                            }
                        ]
                    })
                });
                results.push({ platform: "slack", success: res.ok });
            } catch (e) {
                results.push({ platform: "slack", success: false, error: String(e) });
            }
        }

        // Send to Discord
        if (settings.discordWebhook) {
            try {
                const res = await fetch(settings.discordWebhook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        embeds: [{
                            title: `📝 ${title}`,
                            description: message,
                            color: 0x7C3AED, // Purple
                            footer: {
                                text: `DocuMint AI • ${type}`
                            },
                            timestamp: new Date().toISOString()
                        }]
                    })
                });
                results.push({ platform: "discord", success: res.ok });
            } catch (e) {
                results.push({ platform: "discord", success: false, error: String(e) });
            }
        }

        return NextResponse.json({ sent: results });

    } catch (error) {
        console.error("Send Notification Error:", error);
        return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Configuration for scheduled jobs
interface ScheduleConfig {
    id: string;
    userId: string;
    type: "daily" | "weekly" | "monthly";
    enabled: boolean;
    lastRun: Date | null;
    nextRun: Date;
    options: {
        regenerateAll: boolean;
        staleThresholdDays: number;
        notifyOnComplete: boolean;
    };
}

// GET: Get user's schedule configuration
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // For MVP, we store schedule in user settings (metadata)
        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true }
        });

        const settings = (user?.settings as any) || {};
        const schedule = settings.docSchedule || {
            enabled: false,
            type: "weekly",
            lastRun: null,
            options: {
                regenerateAll: false,
                staleThresholdDays: 7,
                notifyOnComplete: true
            }
        };

        return NextResponse.json({ schedule });

    } catch (error) {
        console.error("Get Schedule Error:", error);
        return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
    }
}

// PUT: Update schedule configuration
export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { enabled, type, options } = await req.json();

        // Calculate next run time
        const nextRun = calculateNextRun(type);

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
                    docSchedule: {
                        enabled,
                        type,
                        lastRun: currentSettings.docSchedule?.lastRun || null,
                        nextRun: nextRun.toISOString(),
                        options
                    }
                }
            }
        });

        return NextResponse.json({
            message: "Schedule updated",
            nextRun: nextRun.toISOString()
        });

    } catch (error) {
        console.error("Update Schedule Error:", error);
        return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }
}

// POST: Manually trigger scheduled regeneration
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get files that need regeneration (stale docs)
        const staleThreshold = new Date();
        staleThreshold.setDate(staleThreshold.getDate() - 7);

        const staleFiles = await db.file.findMany({
            where: {
                userId: session.user.id,
                documentation: {
                    updatedAt: { lt: staleThreshold }
                }
            },
            select: { id: true, name: true }
        });

        // Queue regeneration (In production, this would use a job queue)
        // For MVP, we return the list of stale files
        return NextResponse.json({
            message: "Regeneration queued",
            staleFiles: staleFiles.length,
            files: staleFiles.map(f => f.name)
        });

    } catch (error) {
        console.error("Trigger Regeneration Error:", error);
        return NextResponse.json({ error: "Failed to trigger regeneration" }, { status: 500 });
    }
}

function calculateNextRun(type: string): Date {
    const now = new Date();
    switch (type) {
        case "daily":
            now.setDate(now.getDate() + 1);
            now.setHours(3, 0, 0, 0); // 3 AM
            break;
        case "weekly":
            now.setDate(now.getDate() + 7);
            now.setHours(3, 0, 0, 0);
            break;
        case "monthly":
            now.setMonth(now.getMonth() + 1);
            now.setHours(3, 0, 0, 0);
            break;
        default:
            now.setDate(now.getDate() + 7);
    }
    return now;
}

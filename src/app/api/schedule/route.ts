import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const scheduleTypeSchema = z.enum(["daily", "weekly", "monthly"]);

const scheduleOptionsSchema = z.object({
    regenerateAll: z.boolean().default(false),
    staleThresholdDays: z.number().int().min(1).max(365).default(7),
    notifyOnComplete: z.boolean().default(true),
});

const updateScheduleSchema = z.object({
    enabled: z.boolean(),
    type: scheduleTypeSchema,
    options: scheduleOptionsSchema,
}).strict();

interface UserSchedule {
    enabled: boolean;
    type: "daily" | "weekly" | "monthly";
    lastRun: string | null;
    nextRun: string;
    options: {
        regenerateAll: boolean;
        staleThresholdDays: number;
        notifyOnComplete: boolean;
    };
}

const defaultSchedule: UserSchedule = {
    enabled: false,
    type: "weekly",
    lastRun: null,
    nextRun: calculateNextRun("weekly").toISOString(),
    options: {
        regenerateAll: false,
        staleThresholdDays: 7,
        notifyOnComplete: true,
    },
};

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const settings = (user?.settings ?? {}) as { docSchedule?: Partial<UserSchedule> };
        const schedule = {
            ...defaultSchedule,
            ...(settings.docSchedule || {}),
            options: {
                ...defaultSchedule.options,
                ...(settings.docSchedule?.options || {}),
            },
        } satisfies UserSchedule;

        return NextResponse.json({ schedule });
    } catch (error) {
        console.error("Get Schedule Error:", error);
        return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = updateScheduleSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid schedule payload" }, { status: 400 });
        }

        const { enabled, type, options } = parsed.data;
        const nextRun = calculateNextRun(type);

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const currentSettings = (user?.settings ?? {}) as { docSchedule?: UserSchedule };

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
                        options,
                    } satisfies UserSchedule,
                },
            },
        });

        return NextResponse.json({
            message: "Schedule updated",
            nextRun: nextRun.toISOString(),
        });
    } catch (error) {
        console.error("Update Schedule Error:", error);
        return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }
}

// POST: trigger regeneration now based on current schedule settings
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const settings = (user?.settings ?? {}) as { docSchedule?: UserSchedule };
        const config = settings.docSchedule || defaultSchedule;

        const staleThreshold = new Date();
        staleThreshold.setDate(staleThreshold.getDate() - config.options.staleThresholdDays);

        const files = await db.file.findMany({
            where: {
                userId: session.user.id,
                ...(config.options.regenerateAll ? {} : {
                    documentation: {
                        updatedAt: { lt: staleThreshold },
                    },
                }),
            },
            select: { id: true, name: true },
            take: 50,
            orderBy: { updatedAt: "asc" },
        });

        const host = req.headers.get("host");
        if (!host) {
            return NextResponse.json({ error: "Missing request host" }, { status: 400 });
        }

        const protocol = host.includes("localhost") ? "http" : "https";
        const baseUrl = `${protocol}://${host}`;

        const results = await Promise.allSettled(
            files.map((file) =>
                fetch(`${baseUrl}/api/regenerate/${file.id}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: req.headers.get("cookie") || "",
                    },
                    body: JSON.stringify({ draft: true }),
                })
            )
        );

        const succeeded = results.filter((r) => r.status === "fulfilled").length;

        await db.user.update({
            where: { id: session.user.id },
            data: {
                settings: {
                    ...(settings || {}),
                    docSchedule: {
                        ...config,
                        lastRun: new Date().toISOString(),
                        nextRun: calculateNextRun(config.type).toISOString(),
                    },
                },
            },
        });

        return NextResponse.json({
            message: "Regeneration triggered",
            queued: files.length,
            succeeded,
            files: files.map((f) => f.name),
        });
    } catch (error) {
        console.error("Trigger Regeneration Error:", error);
        return NextResponse.json({ error: "Failed to trigger regeneration" }, { status: 500 });
    }
}

function calculateNextRun(type: "daily" | "weekly" | "monthly"): Date {
    const now = new Date();
    switch (type) {
        case "daily":
            now.setDate(now.getDate() + 1);
            break;
        case "weekly":
            now.setDate(now.getDate() + 7);
            break;
        case "monthly":
            now.setMonth(now.getMonth() + 1);
            break;
    }
    now.setHours(3, 0, 0, 0);
    return now;
}

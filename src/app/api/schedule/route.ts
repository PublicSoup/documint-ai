import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";
import { Prisma, File } from "@prisma/client";

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

/**
 * GET /api/schedule
 * Returns the documentation update schedule settings for the current user.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const settings = (user?.settings && typeof user.settings === "object" ? user.settings : {}) as { docSchedule?: Partial<UserSchedule> };
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
        return errorResponse(error);
    }
}

/**
 * PUT /api/schedule
 * Updates the documentation update schedule settings.
 */
export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Body
        const { enabled, type, options } = await validateBody(req, updateScheduleSchema);
        const nextRun = calculateNextRun(type);

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const currentSettings = (user?.settings && typeof user.settings === "object" ? user.settings : {}) as Record<string, unknown>;
        const currentSchedule = (currentSettings.docSchedule || {}) as Partial<UserSchedule>;

        const updatedSchedule: UserSchedule = {
            enabled,
            type,
            lastRun: currentSchedule.lastRun || null,
            nextRun: nextRun.toISOString(),
            options,
        };

        // 3. Update DB
        const nextSettings: Prisma.JsonObject = {
            ...currentSettings,
            docSchedule: updatedSchedule as unknown as Prisma.JsonObject,
        };

        await db.user.update({
            where: { id: session.user.id },
            data: {
                settings: nextSettings,
            },
        });

        // 4. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "UPDATE_DOC_SCHEDULE",
                entity: "User",
                entityId: session.user.id,
                details: { enabled, type },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            message: "Schedule updated",
            nextRun: nextRun.toISOString(),
        });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * POST /api/schedule
 * Manually triggers a documentation update run based on current settings.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const settings = (user?.settings && typeof user.settings === "object" ? user.settings : {}) as Record<string, unknown>;
        const config = (settings.docSchedule || defaultSchedule) as UserSchedule;

        const staleThreshold = new Date();
        staleThreshold.setDate(staleThreshold.getDate() - config.options.staleThresholdDays);

        // 2. Fetch target files
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

        if (files.length === 0) {
            return NextResponse.json({ message: "No files require regeneration based on settings.", queued: 0 });
        }

        const host = req.headers.get("host");
        if (!host) {
            throw ApiErrors.badRequest("Missing request host.");
        }

        const protocol = host.includes("localhost") ? "http" : "https";
        const baseUrl = `${protocol}://${host}`;

        // 3. Trigger regeneration (Background)
        const results = await Promise.allSettled(
            files.map((file: File) =>
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

        const succeeded = results.filter((r: PromiseSettledResult<any>) => r.status === "fulfilled").length;

        // 4. Update status in settings
        await db.user.update({
            where: { id: session.user.id },
            data: {
                settings: {
                    ...settings,
                    docSchedule: {
                        ...config,
                        lastRun: new Date().toISOString(),
                        nextRun: calculateNextRun(config.type).toISOString(),
                    },
                } as Prisma.InputJsonValue,
            },
        });

        // 5. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "TRIGGER_SCHEDULE_RUN",
                entity: "User",
                entityId: session.user.id,
                details: { filesCount: files.length, succeededCount: succeeded },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            message: "Regeneration triggered",
            queued: files.length,
            succeeded,
            files: files.map((f: File) => f.name),
        });
    } catch (error) {
        return errorResponse(error);
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

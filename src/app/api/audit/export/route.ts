import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const auditExportQuerySchema = z
    .object({
        format: z.enum(["json", "csv"]).default("json"),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        action: z.string().trim().min(1).max(120).optional(),
        userId: z.string().trim().min(1).max(100).optional(),
    })
    .strict();

// GET: Export audit logs as CSV or JSON
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const gate = await requireFeature("auditLog");
        if (gate) return gate;

        const adminCheck = await validateAdmin();
        const isAdmin = adminCheck.authorized;

        const { format, start: startDate, end: endDate, action, userId: targetUserId } = validateQuery(
            req.nextUrl.searchParams,
            auditExportQuerySchema,
        );

        const where: Prisma.AuditLogWhereInput = {};

        if (!isAdmin) {
            where.userId = session.user.id;
        } else if (targetUserId) {
            where.userId = targetUserId;
        }

        if (startDate || endDate) {
            const createdAt: Prisma.DateTimeFilter = {};
            if (startDate) createdAt.gte = new Date(startDate);
            if (endDate) createdAt.lte = new Date(endDate);
            where.createdAt = createdAt;
        }

        if (action) {
            where.action = action;
        }

        const logs = await db.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 5000,
        });

        if (format === "csv") {
            const headers = ["ID", "Action", "Entity", "EntityID", "Details", "IP", "User", "Timestamp"];
            const rows = logs.map((log: any) => [
                log.id,
                log.action,
                log.entity,
                log.entityId,
                JSON.stringify(log.details || {}),
                log.ip || "",
                log.userId || "SYSTEM",
                log.createdAt.toISOString(),
            ]);

            const csv = [
                headers.join(","),
                ...rows.map((row: any[]) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
            ].join("\n");

            return new NextResponse(csv, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().split("T")[0]}.csv"`,
                },
            });
        }

        return NextResponse.json({
            logs,
            meta: {
                total: logs.length,
                exportedAt: new Date().toISOString(),
                filters: { startDate, endDate, action, targetUserId },
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}

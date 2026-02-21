import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateQuery, validateBody } from "@/lib/api-utils";

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    action: z.string().optional(),
    entity: z.string().optional(),
    userId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

const exportSchema = z.object({
    format: z.enum(["csv", "json"]).default("csv"),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    userId: z.string().optional(),
});

/**
 * GET /api/audit
 * Returns paginated audit logs for the authenticated user or all users if admin.
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Check feature access
        const gateError = await requireFeature("auditLog");
        if (gateError) return gateError;

        // 2. Check Authentication
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 3. Rate Limiting
        await enforceRateLimit(session.user.id, "api");

        // 4. Validate Query Params
        const { searchParams } = new URL(request.url);
        const { page, limit, action, entity, userId: filterUserId, startDate, endDate } = validateQuery(searchParams, querySchema);

        // 5. Determine permissions
        const adminCheck = await validateAdmin();
        const isAdmin = adminCheck.authorized;

        // 6. Build access-controlled query
        const where: Prisma.AuditLogWhereInput = {};

        if (!isAdmin) {
            where.userId = session.user.id;
        } else if (filterUserId) {
            where.userId = filterUserId;
        }

        if (action) where.action = action;
        if (entity) where.entity = entity;
        if (startDate || endDate) {
            where.createdAt = {
                ...(startDate && { gte: new Date(startDate) }),
                ...(endDate && { lte: new Date(endDate) }),
            };
        }

        // 7. Execute paginated transaction
        const [logs, total] = await db.$transaction([
            db.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: {
                        select: { name: true, email: true }
                    }
                }
            }),
            db.auditLog.count({ where })
        ]);

        return NextResponse.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * POST /api/audit
 * Exports audit logs in CSV or JSON format.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const adminCheck = await validateAdmin();
        const isAdmin = adminCheck.authorized;

        const { format, startDate, endDate, userId: targetUserId } = await validateBody(request, exportSchema);

        // Build where clause
        const where: Prisma.AuditLogWhereInput = {};
        if (!isAdmin) {
            where.userId = session.user.id;
        } else if (targetUserId) {
            where.userId = targetUserId;
        }

        if (startDate || endDate) {
            where.createdAt = {
                ...(startDate && { gte: new Date(startDate) }),
                ...(endDate && { lte: new Date(endDate) }),
            };
        }

        const logs = await db.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10000 // Performance bound
        });

        if (format === "csv") {
            const header = "Timestamp,Action,Entity,EntityID,Details,IP,User\n";
            const rows = logs.map(log => {
                const details = JSON.stringify(log.details || {}).replace(/"/g, '""');
                return `"${log.createdAt.toISOString()}","${log.action}","${log.entity}","${log.entityId}","${details}","${log.ip || ''}","${log.userId || 'SYSTEM'}"`;
            }).join("\n");

            return new NextResponse(header + rows, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename=audit-export-${new Date().toISOString().split("T")[0]}.csv`
                }
            });
        }

        return NextResponse.json({ logs });
    } catch (error) {
        return errorResponse(error);
    }
}

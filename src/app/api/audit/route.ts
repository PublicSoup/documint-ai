import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { validateAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
    try {
        // 1. Check feature access (Standard Schema enforcement)
        const gateError = await requireFeature("auditLog");
        if (gateError) return gateError;

        // 2. Check Authentication
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const action = searchParams.get("action");
        const entity = searchParams.get("entity");
        const filterUserId = searchParams.get("userId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        // 3. Determine permissions via unified validator
        const adminCheck = await validateAdmin();
        const isAdmin = adminCheck.authorized;

        // 4. Build access-controlled query
        const where: Prisma.AuditLogWhereInput = {};

        if (!isAdmin) {
            // Non-admins can strictly only see their own logs
            where.userId = session.user.id;
        } else if (filterUserId) {
            // Admins can filter by specific user
            where.userId = filterUserId;
        }

        if (action) where.action = action;
        if (entity) where.entity = entity;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // 5. Execute paginated transaction
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
        console.error("[AuditLog_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// POST: Standard export with access control
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const adminCheck = await validateAdmin();
        const isAdmin = adminCheck.authorized;

        const body = await request.json().catch(() => ({}));
        const { format = "csv", startDate, endDate, userId: targetUserId } = body;

        // Build where clause
        const where: Prisma.AuditLogWhereInput = {};
        if (!isAdmin) {
            where.userId = session.user.id;
        } else if (targetUserId) {
            where.userId = targetUserId;
        }

        if (startDate) where.createdAt = { ...where.createdAt, gte: new Date(startDate) };
        if (endDate) where.createdAt = { ...where.createdAt, lte: new Date(endDate) };

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
        console.error("[AuditExport_API] Error:", error);
        return NextResponse.json({ error: "Export Failed" }, { status: 500 });
    }
}

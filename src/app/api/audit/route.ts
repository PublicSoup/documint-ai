import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";

export async function GET(request: NextRequest) {
    try {
        // Check feature access
        const gateError = await requireFeature("auditLog");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const action = searchParams.get("action");
        const entity = searchParams.get("entity");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        // Build where clause
        const where: any = { userId: session.user.id };

        if (action) where.action = action;
        if (entity) where.entity = entity;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // Get total count
        const total = await db.auditLog.count({ where });

        // Get paginated logs
        const logs = await db.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        });

        // Enrich with user info if needed
        const enrichedLogs = logs.map(log => ({
            id: log.id,
            action: log.action,
            entity: log.entity,
            entityId: log.entityId,
            details: log.details,
            ip: log.ip,
            createdAt: log.createdAt,
        }));

        return NextResponse.json({
            logs: enrichedLogs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Audit log error:", error);
        return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
    }
}

// Export audit logs as CSV
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { format = "csv", startDate, endDate } = await request.json();

        const where: any = { userId: session.user.id };
        if (startDate) where.createdAt = { ...where.createdAt, gte: new Date(startDate) };
        if (endDate) where.createdAt = { ...where.createdAt, lte: new Date(endDate) };

        const logs = await db.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10000 // Max export
        });

        if (format === "csv") {
            const header = "Timestamp,Action,Entity,EntityID,Details,IP\n";
            const rows = logs.map(log => {
                const details = JSON.stringify(log.details || {}).replace(/"/g, '""');
                return `"${log.createdAt.toISOString()}","${log.action}","${log.entity}","${log.entityId}","${details}","${log.ip || ''}"`;
            }).join("\n");

            return new NextResponse(header + rows, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename=audit-log-${new Date().toISOString().split("T")[0]}.csv`
                }
            });
        }

        return NextResponse.json({ logs });
    } catch (error) {
        console.error("Export error:", error);
        return NextResponse.json({ error: "Failed to export" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { validateAdmin } from "@/lib/admin-auth";

// GET: Export audit logs as CSV or JSON
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check feature access
        const gate = await requireFeature("auditLog");
        if (gate) return gate;

        const adminCheck = await validateAdmin();
        const isAdmin = adminCheck.authorized;

        const { searchParams } = new URL(req.url);
        const format = searchParams.get("format") || "json"; // json, csv
        const startDate = searchParams.get("start");
        const endDate = searchParams.get("end");
        const action = searchParams.get("action");
        const targetUserId = searchParams.get("userId");

        // Build query filters with strict ownership enforcement
        const where: any = {};
        
        if (!isAdmin) {
            where.userId = session.user.id;
        } else if (targetUserId) {
            where.userId = targetUserId;
        }

        if (startDate) {
            where.createdAt = { ...where.createdAt, gte: new Date(startDate) };
        }
        if (endDate) {
            where.createdAt = { ...where.createdAt, lte: new Date(endDate) };
        }
        if (action) {
            where.action = action;
        }

        const logs = await db.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 5000 // Performance ceiling for synchronous export
        });

        if (format === "csv") {
            // Generate CSV
            const headers = ["ID", "Action", "Entity", "EntityID", "Details", "IP", "User", "Timestamp"];
            const rows = logs.map(log => [
                log.id,
                log.action,
                log.entity,
                log.entityId,
                JSON.stringify(log.details || {}),
                log.ip || "",
                log.userId || "SYSTEM",
                log.createdAt.toISOString()
            ]);

            const csv = [
                headers.join(","),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
            ].join("\n");

            return new NextResponse(csv, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().split('T')[0]}.csv"`
                }
            });
        }

        // JSON format
        return NextResponse.json({
            logs,
            meta: {
                total: logs.length,
                exportedAt: new Date().toISOString(),
                filters: { startDate, endDate, action, targetUserId }
            }
        });

    } catch (error) {
        console.error("[AuditExport_Admin_API] Error:", error);
        return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
}

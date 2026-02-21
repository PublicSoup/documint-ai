import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

/**
 * DELETE /api/integrations/[id]
 * Remove an integration from a team.
 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 });
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const integration = await db.integration.findUnique({
            where: { id: parsedParams.data.id },
        });

        if (!integration) {
            return NextResponse.json({ error: "Integration not found" }, { status: 404 });
        }

        const canManageIntegration = await checkTeamPermission(session.user.id, integration.teamId, "manage");
        if (!canManageIntegration) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await db.integration.delete({
            where: { id: parsedParams.data.id },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "DELETE_INTEGRATION",
                entity: "Team",
                entityId: integration.teamId,
                details: {
                    type: integration.type,
                    integrationId: parsedParams.data.id,
                },
            });
        } catch {
            // Keep mutation resilient if audit logging fails.
        }

        return NextResponse.json({ success: true, message: "Integration removed" });
    } catch (error) {
        console.error("[Integration_DELETE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

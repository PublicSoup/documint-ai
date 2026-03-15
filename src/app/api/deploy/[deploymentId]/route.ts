import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

interface RouteContext {
    params: {
        deploymentId: string;
    };
}

/**
 * GET /api/deploy/[deploymentId]
 * Fetches the status and logs of a specific deployment.
 */
export async function GET(
    req: NextRequest,
    context: { params: Promise<{ deploymentId: string }> }
) {
    try {
        const { params } = { params: await context.params };
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();

        const { deploymentId } = params;

        const deployment = await db.deployment.findUnique({
            where: { id: deploymentId },
            select: {
                id: true,
                status: true,
                url: true,
                config: true,
                createdAt: true,
                updatedAt: true,
                userId: true,
                teamId: true
            }
        });

        if (!deployment) {
            return errorResponse(ApiErrors.notFound("Deployment not found"));
        }

        // Project ownership check (User or Team)
        if (deployment.userId !== session.user.id) {
            // Check team access if applicable
            // For now, simple user check
            return errorResponse(ApiErrors.forbidden());
        }

        interface DeploymentConfig {
            logs?: string;
            error?: string | null;
        }

        return NextResponse.json({
            success: true,
            deployment: {
                id: deployment.id,
                status: deployment.status,
                url: deployment.url,
                logs: (deployment.config as unknown as DeploymentConfig)?.logs || "",
                error: (deployment.config as unknown as DeploymentConfig)?.error || null,
                createdAt: deployment.createdAt,
                updatedAt: deployment.updatedAt
            }
        });

    } catch (error) {
        return errorResponse(error);
    }
}

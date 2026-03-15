import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { AuditLogSeverity } from "@prisma/client";
import { syncUserWorkspaceToWebContainer } from "@/lib/files";
import { WebContainerManager } from "@/lib/web-container";

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        result += decoder.decode(value, { stream: true });
    }
    return result;
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const userWorkspacePath = await syncUserWorkspaceToWebContainer(session.user.id);

        const gitProcess = await WebContainerManager.spawn('git', {
            args: ['status', '--short', '--branch'],
            cwd: userWorkspacePath,
        });

        const reader = gitProcess.output.getReader();
        let output = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            output += value;
        }

        const exitCode = await gitProcess.exit;

        if (exitCode !== 0) {
            throw new Error(`Git status failed with exit code ${exitCode}: ${output}`);
        }
        
        const status = output.trim();

        await logAudit({
            userId: session.user.id,
            action: "git.status_webcontainer",
            entity: "git",
            entityId: session.user.id,
            severity: AuditLogSeverity.INFO,
            details: {
                message: "Successfully retrieved git status from WebContainer workspace.",
                status: status,
                cwd: userWorkspacePath,
            },
        });

        return NextResponse.json({ status });

    } catch (error) {
        const userId = (await getServerSession(authOptions))?.user?.id;
        await logAudit({
            userId: userId || "anonymous",
            action: "git.status_webcontainer",
            entity: "git",
            entityId: userId || "anonymous",
            severity: AuditLogSeverity.ERROR,
            details: {
                message: "Failed to retrieve git status from WebContainer workspace.",
                error: (error as Error).message,
            },
        });
        return errorResponse(error);
    }
}

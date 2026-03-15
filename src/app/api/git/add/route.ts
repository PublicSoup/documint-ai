import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { AuditLogSeverity } from "@prisma/client";
import { syncUserWorkspaceToWebContainer } from "@/lib/files";
import { WebContainerManager } from "@/lib/web-container";
import { streamToString } from "@/lib/utils"; // Assuming streamToString is extracted to utils

const GitAddBodySchema = z.object({
    filePath: z.string().min(1, "File path is required."),
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const body = await req.json();
        const validation = GitAddBodySchema.safeParse(body);
        if (!validation.success) {
            throw ApiErrors.validationError(validation.error.issues);
        }

        const { filePath } = validation.data;
        const userWorkspacePath = await syncUserWorkspaceToWebContainer(session.user.id);

        const gitProcess = await WebContainerManager.spawn('git', {
            args: ['add', filePath],
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
            throw new Error(`Git add failed with exit code ${exitCode}: ${output}`);
        }

        await logAudit({
            userId: session.user.id,
            action: "git.add_webcontainer",
            entity: "git",
            entityId: filePath,
            severity: AuditLogSeverity.INFO,
            details: {
                message: `Successfully staged file in WebContainer workspace.`,
                filePath,
                cwd: userWorkspacePath,
            },
        });

        return NextResponse.json({ success: true, filePath });

    } catch (error) {
        const userId = (await getServerSession(authOptions))?.user?.id;
        await logAudit({
            userId: userId || "anonymous",
            action: "git.add_webcontainer",
            entity: "git",
            entityId: "unknown",
            severity: AuditLogSeverity.ERROR,
            details: {
                message: "Failed to stage file in WebContainer workspace.",
                error: (error as Error).message,
            },
        });
        return errorResponse(error);
    }
}

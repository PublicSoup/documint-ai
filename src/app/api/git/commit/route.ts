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
import { streamToString } from "@/lib/utils";

const GitCommitBodySchema = z.object({
  message: z.string().min(1, "Commit message cannot be empty."),
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const body = await req.json();
        const validation = GitCommitBodySchema.safeParse(body);
        if (!validation.success) {
            throw ApiErrors.validationError(validation.error.issues);
        }

        const { message } = validation.data;
        const userWorkspacePath = await syncUserWorkspaceToWebContainer(session.user.id);

        // It's good practice to set user name and email before committing
        // This won't persist across container resets but is good for the commit log
        const email = session.user.email || 'user@documint.ai';
        const name = session.user.name || 'DocuMint User';
        
        // It's good practice to set user name and email before committing
        // This won't persist across container resets but is good for the commit log
        let configProcess = await WebContainerManager.spawn('git', { args: ['config', 'user.email', `"${email}"`], cwd: userWorkspacePath });
        await configProcess.exit;
        
        configProcess = await WebContainerManager.spawn('git', { args: ['config', 'user.name', `"${name}"`], cwd: userWorkspacePath });
        await configProcess.exit;


        const gitProcess = await WebContainerManager.spawn('git', {
            args: ['commit', '-m', message],
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
            // "nothing to commit" is not a failure in this context.
            if (output.includes('nothing to commit')) {
                return NextResponse.json({ success: true, message: 'nothing to commit', output: output });
            }
            throw new Error(`Git commit failed with exit code ${exitCode}: ${output}`);
        }

        await logAudit({
            userId: session.user.id,
            action: "git.commit_webcontainer",
            entity: "git",
            entityId: session.user.id, // Commit is against the user's repo state
            severity: AuditLogSeverity.INFO,
            details: {
                message: `Successfully committed changes in WebContainer workspace.`,
                commitMessage: message,
                output: output.trim(),
                cwd: userWorkspacePath,
            },
        });

        return NextResponse.json({ success: true, message: 'commit successful', output: output.trim() });

    } catch (error) {
        const userId = (await getServerSession(authOptions))?.user?.id;
        await logAudit({
            userId: userId || "anonymous",
            action: "git.commit_webcontainer",
            entity: "git",
            entityId: "unknown",
            severity: AuditLogSeverity.ERROR,
            details: {
                message: "Failed to commit changes in WebContainer workspace.",
                error: (error as Error).message,
            },
        });
        return errorResponse(error);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const execFileAsync = promisify(execFile);
const emptySchema = z.object({}).strict();

async function runGit(args: string[]) {
    const { stdout, stderr } = await execFileAsync("git", args, {
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 3 * 1024 * 1024,
    });
    return { stdout, stderr };
}

/**
 * POST /api/git/sync
 * Non-destructive sync: fetch remotes and return status overview.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await validateBody(req, emptySchema);
        await enforceRateLimit(session.user.id, "api");

        const fetch = await runGit(["fetch", "--all", "--prune"]);
        const branch = await runGit(["branch", "--show-current"]);
        const status = await runGit(["status", "--short", "--branch"]);

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GIT_SYNC",
                entity: "Repository",
                entityId: "workspace",
                details: {
                    branch: branch.stdout.trim(),
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            success: true,
            branch: branch.stdout.trim(),
            status: status.stdout.trim(),
            fetch: fetch.stdout.trim() || fetch.stderr.trim() || "Fetched",
        });
    } catch (error) {
        return errorResponse(error);
    }
}

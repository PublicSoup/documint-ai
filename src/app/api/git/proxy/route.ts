import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const execFileAsync = promisify(execFile);

const proxySchema = z
    .object({
        action: z.enum(["status", "branch", "log", "diff"]),
        limit: z.number().int().min(1).max(100).optional(),
    })
    .strict();

async function runGit(args: string[]) {
    const { stdout, stderr } = await execFileAsync("git", args, {
        cwd: process.cwd(),
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
    });
    return { stdout, stderr };
}

/**
 * POST /api/git/proxy
 * Safe git read proxy for IDE integrations.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { action, limit = 20 } = await validateBody(req, proxySchema);

        const args: string[] = (() => {
            switch (action) {
                case "status":
                    return ["status", "--short", "--branch"];
                case "branch":
                    return ["branch", "--show-current"];
                case "log":
                    return ["log", `-n${limit}`, "--date=iso", "--pretty=format:%H\t%ad\t%an\t%s"];
                case "diff":
                    return ["diff", "--stat"];
            }
        })();

        const result = await runGit(args);

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GIT_PROXY",
                entity: "Repository",
                entityId: "workspace",
                details: { action },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            success: true,
            action,
            output: result.stdout.trim(),
            stderr: result.stderr.trim(),
        });
    } catch (error) {
        return errorResponse(error);
    }
}

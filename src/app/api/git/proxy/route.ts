import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

const execFileAsync = promisify(execFile);

const proxySchema = z.object({
    action: z.enum(["status", "branch", "log", "diff"]),
    limit: z.number().int().min(1).max(100).optional(),
}).strict();

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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = proxySchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { action, limit = 20 } = parsed.data;

        let args: string[];
        switch (action) {
            case "status":
                args = ["status", "--short", "--branch"];
                break;
            case "branch":
                args = ["branch", "--show-current"];
                break;
            case "log":
                args = ["log", `-n${limit}`, "--date=iso", "--pretty=format:%H\t%ad\t%an\t%s"];
                break;
            case "diff":
                args = ["diff", "--stat"];
                break;
            default:
                return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
        }

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
        } catch {}

        return NextResponse.json({ success: true, action, output: result.stdout.trim(), stderr: result.stderr.trim() });
    } catch (error) {
        console.error("[GitProxy_API] Error:", error);
        return NextResponse.json({ error: "Git command failed" }, { status: 500 });
    }
}

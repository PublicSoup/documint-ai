import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getServerSession } from "next-auth";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { AuditLogSeverity } from "@prisma/client";
import { materializeUserWorkspace, cleanupUserWorkspace } from "@/lib/files";

const execFileAsync = promisify(execFile);

const GitStatusQuerySchema = z.object({});

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        // Validate query parameters, even if none are currently expected, to adhere to Zod validation standard.
        // In a real scenario with query params, you'd extract them from `req.nextUrl.searchParams`.
        try {
            GitStatusQuerySchema.parse({}); // Validate an empty object as no query params are expected for now
        } catch (error) {
            throw ApiErrors.badRequest(JSON.stringify((error as ZodError).issues));
        }

        console.log("Starting git status retrieval for user:", session.user.id);
        let tempUserWorkspacePath: string | undefined;
        try {
            // Use the application's current working directory as the base project root
            // This assumes the DocuMint AI application itself is the Git repository being managed
            const baseProjectRoot = process.cwd();
            console.log("Base project root:", baseProjectRoot);
            tempUserWorkspacePath = await materializeUserWorkspace(session.user.id, baseProjectRoot);
            console.log("User workspace materialized at:", tempUserWorkspacePath);


            const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], {
                cwd: tempUserWorkspacePath,
                timeout: 15_000,
                maxBuffer: 1024 * 1024,
            });

            await logAudit({
                userId: session.user.id,
                action: "git.status",
                entity: "git",
                entityId: session.user.id,
                severity: AuditLogSeverity.INFO,
                details: {
                    message: "Successfully retrieved git status from isolated workspace.",
                    status: stdout.trim(),
                },
            });

            return NextResponse.json({ status: stdout.trim() });
        } finally {
            if (tempUserWorkspacePath) {
                console.log("Cleaning up user workspace at:", tempUserWorkspacePath);
                try {
                    await cleanupUserWorkspace(tempUserWorkspacePath);
                    console.log("User workspace cleanup completed successfully.");
                } catch (cleanupError: unknown) {
                    const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                    console.error("Failed to cleanup user workspace:", message);
                }
            }
        }
    } catch (error) {
        const userId = (await getServerSession(authOptions))?.user?.id;
        await logAudit({
            userId: userId || "anonymous",
            action: "git.status",
            entity: "git",
            entityId: userId || "anonymous",
            severity: AuditLogSeverity.ERROR,
            details: {
                message: "Failed to retrieve git status from isolated workspace.",
                error: (error as Error).message,
            },
        });
        return errorResponse(error);
    }
}

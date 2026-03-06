import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { SandboxSession } from "@/lib/sandbox";

const deploySchema = z.object({
    name: z.string().min(1).max(100),
    files: z.array(z.object({
        name: z.string(),
        content: z.string()
    })),
    teamId: z.string().optional()
});

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();

        await enforceRateLimit(session.user.id, "api");

        const body = await req.json();
        const { name, files, teamId } = deploySchema.parse(body);

        // 1. Create a pending deployment record
        const deployment = await db.deployment.create({
            data: {
                userId: session.user.id,
                teamId: teamId || null,
                name: name,
                url: `https://${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substring(7)}.documint.live`,
                status: "BUILDING",
                files: files as Prisma.InputJsonValue
            }
        });

        // 2. Perform real build process in sandbox (Async)
        (async () => {
            const sandboxSession = new SandboxSession();
            try {
                console.log(`[Deploy] Starting real build for ${deployment.id}`);
                await sandboxSession.init();

                // Write files to sandbox
                for (const file of files) {
                    await sandboxSession.writeFile(file.name, file.content);
                }

                // Check if npm install is needed
                const hasPackageJson = files.some(f => f.name === "package.json");
                if (hasPackageJson) {
                    // Try to include package-lock.json if not provided to avoid ENOLOCK
                    const hasLockfile = files.some(f => f.name === "package-lock.json");
                    if (!hasLockfile) {
                        try {
                            const rootLockfile = await fs.readFile(path.join(process.cwd(), "package-lock.json"), "utf-8");
                            await sandboxSession.writeFile("package-lock.json", rootLockfile);
                        } catch (e) {
                            console.warn("[Deploy] Could not find root package-lock.json to sync to sandbox");
                        }
                    }
                    await sandboxSession.runCommand("npm", ["install"]);
                }

                // Run build command
                const buildResult = await sandboxSession.runCommand("npm", ["run", "build"]);

                if (buildResult.success) {
                    await db.deployment.update({
                        where: { id: deployment.id },
                        data: {
                            status: "DEPLOYED",
                            config: { logs: sandboxSession.getLogs() } as Prisma.InputJsonValue
                        }
                    });

                    await logAudit({
                        userId: session.user.id,
                        action: "DEPLOY_SITE",
                        entity: "Deployment",
                        entityId: deployment.id,
                        details: { url: deployment.url, success: true }
                    });
                } else {
                    throw new Error(buildResult.error || "Build failed");
                }
            } catch (error) {
                console.error(`[Deploy] Build failed for ${deployment.id}:`, error);
                await db.deployment.update({
                    where: { id: deployment.id },
                    data: {
                        status: "FAILED",
                        config: {
                            error: error instanceof Error ? error.message : String(error),
                            logs: sandboxSession.getLogs()
                        } as Prisma.InputJsonValue
                    }
                });
            } finally {
                await sandboxSession.stop();
            }
        })();

        return NextResponse.json({
            success: true,
            deploymentId: deployment.id,
            url: deployment.url
        });

    } catch (error) {
        return errorResponse(error);
    }
}

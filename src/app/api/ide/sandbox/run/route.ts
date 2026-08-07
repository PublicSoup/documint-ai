import { AuditLogSeverity } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSandboxCommandPlan, getSandboxRuntime } from "@/lib/ide/sandbox-runtime";
import type { RuntimeKind } from "@/components/ide/shared/types";

export const maxDuration = 60;

const runtimeKindSchema = z.enum(["node", "static", "python", "rust", "go", "java", "php", "shell", "docker", "unknown"]);
const workspaceFileSchema = z.object({
    name: z.string().trim().min(1).max(512).refine((name) => !name.includes("..") && !name.startsWith("/"), "Unsafe file path"),
    content: z.string().max(1024 * 1024),
}).strict();

const sandboxRunSchema = z.object({
    files: z.array(workspaceFileSchema).min(1).max(80),
    runtimeKind: runtimeKindSchema,
    entryFile: z.string().trim().min(1).max(512).optional(),
    port: z.number().int().min(1024).max(65_535).default(3000),
}).strict();

type SandboxModule = typeof import("@vercel/sandbox");

async function loadSandbox(): Promise<SandboxModule["Sandbox"] | null> {
    try {
        const mod = await import("@vercel/sandbox");
        return mod.Sandbox;
    } catch (error) {
        console.warn("[IDE Sandbox] @vercel/sandbox unavailable", error);
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();

        await enforceRateLimit(session.user.id, "api");
        const body = await validateBody(req, sandboxRunSchema);
        const Sandbox = await loadSandbox();

        if (!Sandbox) {
            return NextResponse.json({
                code: "SANDBOX_UNAVAILABLE",
                message: "Vercel Sandbox runtime is not available in this deployment.",
            }, { status: 503 });
        }

        const commandPlan = getSandboxCommandPlan({
            runtimeKind: body.runtimeKind as RuntimeKind,
            entryFile: body.entryFile,
            files: body.files,
            port: body.port,
        });

        const sandbox = await Sandbox.create({
            ports: commandPlan.port ? [commandPlan.port] : undefined,
            runtime: getSandboxRuntime(body.runtimeKind as RuntimeKind),
            timeout: 10 * 60 * 1000,
        });

        await sandbox.writeFiles(body.files.map((file) => ({
            path: file.name,
            // For `node` projects the planner may rewrite package.json so the dev
            // server binds 0.0.0.0 on the exposed port. Write that version instead.
            content: Buffer.from(
                file.name === "package.json" && commandPlan.rewrittenPackageJson
                    ? commandPlan.rewrittenPackageJson
                    : file.content,
                "utf8",
            ),
        })));

        // Optional blocking pre-step (e.g. `npm install`). Abort with its output
        // if it fails so the client surfaces the real dependency error.
        if (commandPlan.setup) {
            const setup = await sandbox.runCommand({ cmd: commandPlan.setup.command, args: commandPlan.setup.args });
            if (setup.exitCode !== 0) {
                const [stdout, stderr] = await Promise.all([setup.stdout(), setup.stderr()]);
                await sandbox.stop().catch(() => undefined);
                await logAudit({
                    userId: session.user.id,
                    action: "IDE_SANDBOX_COMMAND",
                    entity: "Sandbox",
                    entityId: sandbox.sandboxId,
                    severity: AuditLogSeverity.WARNING,
                    details: { runtimeKind: body.runtimeKind, phase: "setup", command: commandPlan.setup.command, exitCode: setup.exitCode },
                });
                return NextResponse.json({
                    code: "SANDBOX_FAILED",
                    message: `Setup step failed (${commandPlan.setup.command} exited with code ${setup.exitCode}).`,
                    stdout,
                    stderr,
                }, { status: 502 });
            }
        }

        if (commandPlan.wait) {
            const done = await sandbox.runCommand({ cmd: commandPlan.command, args: commandPlan.args });
            const [stdout, stderr] = await Promise.all([done.stdout(), done.stderr()]);
            await sandbox.stop().catch(() => undefined);

            await logAudit({
                userId: session.user.id,
                action: "IDE_SANDBOX_COMMAND",
                entity: "Sandbox",
                entityId: sandbox.sandboxId,
                severity: done.exitCode === 0 ? AuditLogSeverity.INFO : AuditLogSeverity.WARNING,
                details: { runtimeKind: body.runtimeKind, command: commandPlan.command, args: commandPlan.args, exitCode: done.exitCode },
            });

            return NextResponse.json({
                sandboxId: sandbox.sandboxId,
                stdout,
                stderr,
                message: `Command exited with code ${done.exitCode}`,
            });
        }

        const command = await sandbox.runCommand({ cmd: commandPlan.command, args: commandPlan.args, detached: true });
        const previewUrl = commandPlan.port ? sandbox.domain(commandPlan.port) : undefined;

        await logAudit({
            userId: session.user.id,
            action: "IDE_SANDBOX_RUN",
            entity: "Sandbox",
            entityId: sandbox.sandboxId,
            details: { runtimeKind: body.runtimeKind, command: commandPlan.command, args: commandPlan.args, commandId: command.cmdId, previewUrl },
        });

        return NextResponse.json({
            sandboxId: sandbox.sandboxId,
            commandId: command.cmdId,
            previewUrl,
            message: "Sandbox command started.",
        });
    } catch (error) {
        return errorResponse(error);
    }
}
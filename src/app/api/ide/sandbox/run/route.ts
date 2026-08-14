import { AuditLogSeverity } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSandboxCommandPlan, getSandboxRuntime } from "@/lib/ide/sandbox-runtime";
import { createSandbox } from "@/lib/executor";
import type { RuntimeKind } from "@/components/ide/shared/types";

export const maxDuration = 60;

const runtimeKindSchema = z.enum(["python", "rust", "go", "java", "php", "shell", "docker", "unknown"]);
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

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();

        await enforceRateLimit(session.user.id, "api");
        const body = await validateBody(req, sandboxRunSchema);

        const commandPlan = getSandboxCommandPlan({
            runtimeKind: body.runtimeKind as RuntimeKind,
            entryFile: body.entryFile,
            files: body.files,
            port: body.port,
        });

        const sandbox = await createSandbox({
            ports: commandPlan.port ? [commandPlan.port] : undefined,
            runtime: getSandboxRuntime(body.runtimeKind as RuntimeKind),
            timeout: 10 * 60 * 1000,
            userId: session.user.id,
        });

        if (!sandbox) {
            return NextResponse.json({
                code: "SANDBOX_UNAVAILABLE",
                message: "The code execution sandbox is not available in this deployment.",
            }, { status: 503 });
        }

        await sandbox.writeFiles(body.files.map((file) => ({
            path: file.name,
            content: Buffer.from(file.content, "utf8"),
        })));

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
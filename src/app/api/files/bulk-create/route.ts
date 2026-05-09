import { Prisma, File } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";

const fileSchema = z.object({
    name: z.string().trim().min(1).max(1024)
        .refine(name => !name.includes('..'), { message: "File path cannot contain directory traversal." }),
    content: z.string().max(1024 * 1024).optional(), // 1MB limit per file
});

const bulkCreateSchema = z.object({
    files: z.array(fileSchema).min(1).max(50), // Limit to 50 files per batch
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

function detectLanguage(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        css: 'css', scss: 'scss', less: 'less',
        html: 'html', htm: 'html',
        json: 'json', jsonc: 'json',
        md: 'markdown', mdx: 'markdown',
        py: 'python',
        rb: 'ruby',
        rs: 'rust',
        go: 'go',
        java: 'java',
        c: 'c', h: 'c',
        cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
        cs: 'csharp',
        php: 'php',
        sql: 'sql',
        sh: 'shell', bash: 'shell', zsh: 'shell',
        yaml: 'yaml', yml: 'yaml',
        xml: 'xml', svg: 'xml',
        graphql: 'graphql', gql: 'graphql',
        dockerfile: 'dockerfile',
        toml: 'ini', ini: 'ini',
        env: 'plaintext', txt: 'plaintext', log: 'plaintext',
    };
    return languageMap[ext || ''] || 'plaintext';
}

/**
 * POST /api/files/bulk-create
 * Creates multiple file records in a single batch.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        const ip = getClientIP(req);
        await enforceRateLimit(session.user.id, "file_create_bulk");

        const { files, teamId } = await validateBody(req, bulkCreateSchema);

        if (teamId) {
            const { checkTeamPermission } = await import("@/lib/permissions");
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "edit");
            if (!hasPermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to create files in this team."));
            }
        }


        // Check for file name collisions before starting the transaction
        const fileNames = files.map(f => f.name.replace(/^\/+/, ""));
        const existingFiles = await db.file.findMany({
            where: {
                name: { in: fileNames },
                teamId: teamId || null,
                userId: teamId ? undefined : session.user.id,
            },
            select: { name: true }
        });

        if (existingFiles.length > 0) {
            return errorResponse(ApiErrors.conflict(`One or more files already exist: ${existingFiles.map((f: { name: string }) => f.name).join(', ')}`));
        }

        // Check if all files can be created (collision check)
        // For bulk, let's just prefix-check or handle in transaction.
        // We'll use a transaction to ensure all or nothing.

        const createdFiles = await db.$transaction(async (tx: Prisma.TransactionClient) => {
            const results = [];
            for (const f of files) {
                const normalizedName = f.name.replace(/^\/+/, "");
                const fullPath = `/${normalizedName}`;

                // Optional: Check existence. 
                // For simplicity in templates, we'll allow overwriting or returning error.
                // Let's stick to error for safety, or a Clean-then-Create pattern in frontend.

                const content = f.content || "";
                const file = await tx.file.create({
                    data: {
                        userId: session.user.id,
                        teamId: teamId || null,
                        name: normalizedName,
                        language: detectLanguage(normalizedName),
                        content: content,
                        size: content.length,
                        storagePath: fullPath
                    }
                });
                results.push(file);
            }
            return results;
        });

        // Audit Logging
        try {
            await logAudit({
                userId: session.user.id,
                action: "BULK_CREATE_FILES",
                entity: "File",
                entityId: session.user.id, // Batch action
                details: {
                    count: createdFiles.length,
                    fileNames: createdFiles.map((f: File) => f.name),
                    teamId: teamId || null
                }
            });
        } catch (auditError) {
            console.error("Failed to log audit event:", auditError);
        }

        return NextResponse.json({
            success: true,
            files: createdFiles
        }, { status: 201 });

    } catch (error) {
        return errorResponse(error);
    }
}

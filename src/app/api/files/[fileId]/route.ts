import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";
import { deleteLocalFile, updateLocalFile, createLocalFile, listLocalFiles, getLocalFile } from "@/lib/local-dev-storage";

const fileIdSchema = z.object({
    fileId: z.string().trim().min(1).max(100),
}).strict();

const renameFileSchema = z.object({
    newName: z.string().trim().min(1).max(255),
}).strict();

// Auto-detect language from file extension for Monaco editor
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
        toml: 'ini',
        ini: 'ini',
        env: 'plaintext',
        txt: 'plaintext',
        log: 'plaintext',
    };
    return languageMap[ext || ''] || 'plaintext';
}

/**
 * DELETE /api/files/[fileId]
 * Deletes a file record from the database.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    try {
        const resolvedParams = await params;
        const { fileId } = resolvedParams;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "file_delete");

        // 2. Validate Path Parameters
        const parsedParams = fileIdSchema.parse(resolvedParams);
        // DEV MODE BYPASS: Use local storage when user is dev admin
        if (session.user.id.startsWith("dev-")) {
            await deleteLocalFile(fileId); // fileId here would be the name
            return NextResponse.json({ message: "File deleted locally" }, { status: 200 });
        }

        // 3. Find File and Verify Ownership/Team Access
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { userId: true, teamId: true, name: true }
        });

        if (!file) {
            return errorResponse(ApiErrors.notFound("File"));
        }

        const isOwner = file.userId === session.user.id;
        let hasTeamPermission = false;

        if (file.teamId) {
            const { checkTeamPermission } = await import("@/lib/permissions");
            hasTeamPermission = await checkTeamPermission(session.user.id, file.teamId, "edit");
        }

        if (!isOwner && !hasTeamPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to delete this file."));
        }

        // 4. Delete File
        await db.file.delete({
            where: { id: fileId }
        });

        // 5. Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "DELETE_FILE",
                entity: "File",
                entityId: fileId,
                details: { name: file.name, teamId: file.teamId || null }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ message: "File deleted successfully" }, { status: 200 });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * PUT /api/files/[fileId]
 * Renames a file record in the database.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    try {
        const resolvedParams = await params;
        const { fileId } = resolvedParams;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "file_rename");

        // 2. Validate Path Parameters and Request Body
        const parsedParams = fileIdSchema.parse(resolvedParams);
        const { newName } = await validateBody(req, renameFileSchema);

        // DEV MODE BYPASS: Use local storage when user is dev admin
        if (session.user.id.startsWith("dev-")) {
            const files = await listLocalFiles();
            const oldFileSummary = files.find(f => f.name === fileId); // fileId here is the old name

            if (!oldFileSummary) {
                return errorResponse(ApiErrors.notFound("Local file to rename"));
            }

            // Get the full file content
            const oldFile = await getLocalFile(oldFileSummary.id);
            if (!oldFile) {
                return errorResponse(ApiErrors.notFound("Local file content to rename"));
            }

            // Ensure the new name doesn't conflict with existing files
            const existingWithName = files.find(f => f.name === newName && f.id !== oldFile.id);
            if (existingWithName) {
                return errorResponse(ApiErrors.conflict(`Local file with name "${newName}" already exists.`));
            }

            // Delete the old file (by its internal ID) and create a new one with the updated name
            await deleteLocalFile(oldFile.id);
            const newLocalFile = await createLocalFile(newName, oldFile.content);

            return NextResponse.json({
                message: "File renamed locally",
                id: newLocalFile.id,
                name: newLocalFile.name,
                language: newLocalFile.language,
            }, { status: 200 });
        }

        // 3. Find File and Verify Ownership/Team Access
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { userId: true, teamId: true, name: true }
        });

        if (!file) {
            return errorResponse(ApiErrors.notFound("File"));
        }

        const isOwner = file.userId === session.user.id;
        let hasTeamPermission = false;

        if (file.teamId) {
            const { checkTeamPermission } = await import("@/lib/permissions");
            hasTeamPermission = await checkTeamPermission(session.user.id, file.teamId, "edit");
        }

        if (!isOwner && !hasTeamPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to rename this file."));
        }

        // 4. Check if a file with the new name already exists in the same scope
        const existing = await db.file.findFirst({
            where: {
                userId: file.teamId ? undefined : session.user.id,
                teamId: file.teamId || null,
                name: newName,
                NOT: { id: fileId } // Exclude the current file itself
            },
            select: { id: true }
        });

        if (existing) {
            return errorResponse(ApiErrors.conflict(`File with name "${newName}" already exists.`));
        }

        // 5. Rename File
        const updatedFile = await db.file.update({
            where: { id: fileId },
            data: { 
                name: newName,
                language: detectLanguage(newName) // Update language based on new extension
            },
            select: { id: true, name: true, language: true, teamId: true }
        });

        // 6. Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "RENAME_FILE",
                entity: "File",
                entityId: fileId,
                details: { oldName: file.name, newName: updatedFile.name, teamId: file.teamId || null }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json(updatedFile, { status: 200 });
    } catch (error) {
        return errorResponse(error);
    }
}

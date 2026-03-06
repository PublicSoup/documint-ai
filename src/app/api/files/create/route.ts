import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";
import { createLocalFile } from "@/lib/local-dev-storage";
import { checkTeamPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit-logger";

const createFileSchema = z.object({
    name: z.string().trim().min(1).max(255)
        .refine(name => !name.includes('/'), { message: "File name cannot contain slashes." })
        .refine(name => !name.includes('..'), { message: "File name cannot contain directory traversal." }),
    path: z.string().trim().max(1024)
        .refine(path => !path.includes('..'), { message: "Path cannot contain directory traversal." })
        .optional(),
    language: z.string().trim().max(50).optional(),
    content: z.string().max(1024 * 1024).optional(), // 1MB limit
    teamId: z.string().trim().min(1).max(100).optional(),
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
 * POST /api/files/create
 * Creates a new file record in the database.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        const ip = getClientIP(req);

        // 1. Enforce Rate Limit
        await enforceRateLimit(`${session.user.id}:${ip}`, "file_create");

        // 2. Validate Request Body
        const { name, path, language, content, teamId } = await validateBody(req, createFileSchema);

        // Auto-detect language from file extension if not explicitly provided
        const resolvedLanguage = language || detectLanguage(name);
        
        const finalContent = content || "";



        // 3. Verify Team Access if applicable
        if (teamId) {
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "edit");
            if (!hasPermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to create files in this team."));
            }
        }

        // 4. Check if file already exists for this user/team
        const existing = await db.file.findFirst({
            where: {
                userId: teamId ? undefined : session.user.id,
                teamId: teamId || null,
                name: name
            },
            select: { id: true }
        });

        if (existing) {
            return errorResponse(ApiErrors.conflict(`File "${name}" already exists.`));
        }

        // 5. Create File
        const file = await db.file.create({
            data: {
                userId: session.user.id,
                teamId: teamId || null,
                name: name,
                language: resolvedLanguage,
                content: finalContent,
                size: finalContent.length,
                storagePath: path || `/${name}`
            }
        });

        // 6. Audit Logging
        try {
            await logAudit({
                userId: session.user.id,
                action: "CREATE_FILE",
                entity: "File",
                entityId: file.id,
                details: { 
                    name: file.name, 
                    language: file.language, 
                    size: file.size,
                    teamId: teamId || null
                }
            });
        } catch (auditError) {
            console.error("Failed to log audit event:", auditError);
            // Non-blocking, but should be monitored
        }

        return NextResponse.json(file, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}

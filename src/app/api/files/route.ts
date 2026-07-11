import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createApiHandler, ApiErrors } from "@/lib/api-utils";

const querySchema = z.object({}).strict();

// Safety valve against pathological workspaces — a tree this large is abuse, not use.
const MAX_TREE_FILES = 5000;

/**
 * GET /api/files
 * Retrieves the file tree for the authenticated user.
 *
 * Scale note: this powers the IDE file tree, which only needs metadata. We
 * deliberately DO NOT ship every file's `content` (source is `@db.Text` and can
 * be MBs across a project) — the editor lazy-loads content via
 * `/api/files/[id]/raw` on open. The one exception is `package.json`, whose
 * inline content the IDE reads synchronously to detect run/build/test scripts,
 * so we hydrate those (few, tiny) files only.
 */
export const GET = createApiHandler({
    querySchema: querySchema,
    rateLimit: "api",
    cacheControl: "private, max-age=60, stale-while-revalidate=300",
    handler: async ({ session }) => {
        try {
            // 1. Get the list of teams the user is a member of
            const userTeams = await db.teamMember.findMany({
                where: { userId: session.user.id },
                select: { teamId: true },
            });
            const userTeamIds = userTeams.map((tm: { teamId: string }) => tm.teamId);

            const scope: Prisma.FileWhereInput = {
                OR: [
                    { userId: session.user.id },
                    { teamId: { in: userTeamIds } },
                ],
            };

            // 2. Fetch tree metadata only (no heavy `content`).
            const files = await db.file.findMany({
                where: scope,
                select: {
                    id: true,
                    name: true,
                    language: true,
                    size: true,
                    storagePath: true,
                    userId: true,
                    teamId: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: { name: "asc" },
                take: MAX_TREE_FILES,
            });

            // 3. Hydrate inline content for package.json files only (needed by the
            //    IDE's run-script detection). These are few and small.
            const pkgFiles = await db.file.findMany({
                where: { AND: [scope, { name: { endsWith: "package.json" } }] },
                select: { id: true, content: true },
                take: 200,
            });
            const pkgContent = new Map(pkgFiles.map((p: { id: string; content: string | null }) => [p.id, p.content]));

            return files.map((f: { id: string }) =>
                pkgContent.has(f.id) ? { ...f, content: pkgContent.get(f.id) } : f,
            );
        } catch {
            throw ApiErrors.internalError("Failed to retrieve files");
        }
    },
    audit: {
        action: "FILES_GET",
        entity: "File",
        entityId: () => "N/A", // No specific entity ID for a bulk get operation
    }
});


import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
    CodebaseSummary,
    ListCodebasesQuery,
    ListCodebasesResult,
} from "./types";
import { logCodebaseAudit, CODEBASE_ACTIONS } from "./audit";

/**
 * List codebases visible to a user, paginated, filtered, sorted.
 *
 * v1 design notes (no `Codebase` model yet):
 *   - LOCAL codebases are derived from `File` rows that have
 *     `metadata.codebaseKey` set; codebases without that key are bucketed
 *     under a synthetic `personal:<userId>` key so they still surface.
 *   - GITHUB codebases are derived from `GitHubConnection` (one per user
 *     in v1; multi-repo would need a real `Codebase` row).
 *   - Soft-delete is encoded as `File.metadata.archivedAt = ISO string`;
 *     we filter on that in app code (in `aggregateLocalCodebases`)
 *     because File.metadata is a JSON column and Prisma's NOT + JSON
 *     path filter is unreliable across DB drivers.
 *   - Cursor is the last item's id (stable enough for a take:100 cap).
 *     v2 will switch to opaque base64 cursors.
 */
export async function listCodebasesForUser(
    userId: string,
    query: Partial<ListCodebasesQuery> = {},
    options: { teamId?: string | null; requesterId?: string } = {},
): Promise<ListCodebasesResult> {
    const parsed: ListCodebasesQuery = {
        source: query.source,
        sort: query.sort ?? "recent",
        cursor: query.cursor,
        take: Math.min(Math.max(query.take ?? 50, 1), 100),
        includeArchived: query.includeArchived ?? false,
    };

    const fileWhere: Prisma.FileWhereInput = options.teamId
        ? { teamId: options.teamId }
        : { userId, teamId: null };

    const [localGroups, githubRows] = await Promise.all([
        parsed.source && parsed.source !== "LOCAL"
            ? []
            : aggregateLocalCodebases(userId, fileWhere, parsed),
        parsed.source && parsed.source !== "GITHUB"
            ? []
            : fetchGithubCodebases(userId),
    ]);

    const items = [...localGroups, ...githubRows].sort((a, b) => {
        switch (parsed.sort) {
            case "name":
                return a.name.localeCompare(b.name);
            case "size":
                return b.totalSizeBytes - a.totalSizeBytes;
            case "recent":
            default:
                return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
        }
    });

    const totalCount = items.length;
    const sliced = items.slice(0, parsed.take);
    const nextCursor =
        items.length > parsed.take ? items[parsed.take]?.id ?? null : null;

    // Best-effort audit; never block the response.
    void logCodebaseAudit({
        userId: options.requesterId ?? userId,
        action: CODEBASE_ACTIONS.LIST,
        codebaseId: "*",
        teamId: options.teamId ?? null,
        details: {
            returned: sliced.length,
            source: parsed.source ?? "ALL",
            sort: parsed.sort,
        },
    });

    return {
        items: sliced,
        nextCursor,
        hasMore: nextCursor !== null,
        totalCount,
    };
}

/**
 * Derive a codebase grouping key from a file's stored path. Files are stored
 * with their workspace-relative path as `name` (e.g. "react-vite-3/src/App.tsx"),
 * so the top-level segment is the project/codebase. Returns null for loose
 * files with no folder (bare "index.html"), which fall back to the personal
 * bucket.
 */
function deriveCodebaseKeyFromPath(name: string): string | null {
    const normalized = name.replace(/^\/+/, "");
    const slash = normalized.indexOf("/");
    if (slash <= 0) return null;
    const top = normalized.slice(0, slash).trim();
    return top.length > 0 ? top : null;
}

async function aggregateLocalCodebases(
    userId: string,
    fileWhere: Prisma.FileWhereInput,
    parsed: ListCodebasesQuery,
): Promise<CodebaseSummary[]> {
    // Fetch the most recent files for the user/team. The cap (500) keeps
    // this cheap; if a user has more than 500 files, older files in the
    // same bucket still increment `fileCount` in a follow-up aggregation
    // pass. (The follow-up pass is intentionally omitted in v1; the
    // displayed count is a lower bound, not an exact count.)
    const files = await db.file.findMany({
        where: fileWhere,
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
            id: true,
            name: true,
            language: true,
            size: true,
            createdAt: true,
            updatedAt: true,
            metadata: true,
            documentation: {
                select: { verifiedAt: true },
            },
        },
    });

    const owner = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
    });

    const buckets = new Map<string, CodebaseSummary>();
    for (const f of files) {
        const meta = (f.metadata as Record<string, unknown> | null) ?? null;
        const archivedAtRaw =
            meta && typeof meta.archivedAt === "string" ? meta.archivedAt : null;
        if (archivedAtRaw && !parsed.includeArchived) continue;

        // Bucket key precedence: explicit metadata.codebaseKey (set by GitHub
        // import / future project assignment) → the file's top-level path
        // segment (e.g. "react-vite-3/src/App.tsx" → "react-vite-3", which is
        // how the IDE seeds project files) → a per-user "personal" catch-all
        // for loose files with no folder.
        const keyFromMeta =
            typeof meta?.codebaseKey === "string" ? meta.codebaseKey : null;
        const derivedKey = keyFromMeta ?? deriveCodebaseKeyFromPath(f.name);
        const key = derivedKey ?? `personal:${userId}`;
        const existing = buckets.get(key);
        if (existing) {
            existing.fileCount += 1;
            existing.totalSizeBytes += f.size;
            if (!existing.hasDocs && !!f.documentation) existing.hasDocs = true;
            if (!existing.docsVerified && f.documentation?.verifiedAt) {
                existing.docsVerified = true;
            }
            if (f.updatedAt > existing.lastActivityAt) {
                existing.lastActivityAt = f.updatedAt;
            }
            continue;
        }
        const displayName = derivedKey
            ? derivedKey.split("/").pop() ?? derivedKey
            : "Personal Workspace";
        buckets.set(key, {
            id: key, // v1: synthetic, stable per user/team
            name: displayName,
            source: "LOCAL",
            language: f.language,
            fileCount: 1,
            totalSizeBytes: f.size,
            hasDocs: !!f.documentation,
            docsVerified: !!f.documentation?.verifiedAt,
            lastActivityAt: f.updatedAt,
            owner: {
                id: owner?.id ?? userId,
                name: owner?.name ?? null,
                email: owner?.email ?? null,
            },
            github: null,
            archivedAt: archivedAtRaw ? new Date(archivedAtRaw) : null,
        });
    }

    return [...buckets.values()];
}

async function fetchGithubCodebases(userId: string): Promise<CodebaseSummary[]> {
    const conn = await db.gitHubConnection.findUnique({
        where: { userId },
        include: {
            user: {
                select: { id: true, name: true, email: true },
            },
        },
    });
    if (!conn) return [];

    // GitHub-imported codebases share the same File rows in v1; we
    // surface the connection itself as the "codebase" until multi-repo
    // support lands. `teamId: null` keeps this scoped to personal files.
    const [fileCount, agg] = await Promise.all([
        db.file.count({ where: { userId, teamId: null } }),
        db.file.aggregate({
            where: { userId, teamId: null },
            _sum: { size: true },
            _max: { updatedAt: true },
        }),
    ]);

    return [
        {
            id: `github:${userId}`,
            name: `${conn.username}/${conn.username}`, // v1 placeholder
            source: "GITHUB",
            language: null,
            fileCount,
            totalSizeBytes: agg._sum.size ?? 0,
            hasDocs: false,
            docsVerified: false,
            lastActivityAt: agg._max.updatedAt ?? conn.updatedAt,
            owner: {
                id: conn.user.id,
                name: conn.user.name,
                email: conn.user.email,
            },
            github: {
                username: conn.username,
                avatarUrl: conn.avatarUrl,
            },
            archivedAt: null,
        },
    ];
}
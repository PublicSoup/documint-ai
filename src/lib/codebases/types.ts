import { z } from "zod";

/**
 * Source of a codebase as seen by the user.
 *
 * - LOCAL: a project the user created on documintai.dev (no external VCS).
 * - GITHUB: a project imported from GitHub and tracked via GitHubConnection.
 * - UPLOAD: a one-off file upload that has not been promoted to a project.
 */
export const CodebaseSourceSchema = z.enum(["LOCAL", "GITHUB", "UPLOAD"]);
export type CodebaseSource = z.infer<typeof CodebaseSourceSchema>;

export const CodebaseSortSchema = z.enum(["recent", "name", "size"]);
export type CodebaseSort = z.infer<typeof CodebaseSortSchema>;

export const ListCodebasesQuerySchema = z.object({
    source: CodebaseSourceSchema.optional(),
    sort: CodebaseSortSchema.default("recent"),
    cursor: z.string().cuid().optional(),
    take: z.number().int().min(1).max(100).default(50),
    includeArchived: z.boolean().default(false),
});
export type ListCodebasesQuery = z.infer<typeof ListCodebasesQuerySchema>;

/**
 * Lightweight summary of a codebase as displayed in the unified dashboard view.
 *
 * `id` is intentionally stable across renders. For LOCAL codebases, the id
 * is the id of the most recent File row in the group (used by the existing
 * `?docId=` deep link). For GITHUB codebases, the id is the userId of the
 * owner of the GitHubConnection (one repo per connection in v1; multi-repo
 * support would be a follow-up that needs a real Codebase model).
 */
export interface CodebaseSummary {
    id: string;
    name: string;
    source: CodebaseSource;
    language: string | null;
    fileCount: number;
    totalSizeBytes: number;
    hasDocs: boolean;
    docsVerified: boolean;
    lastActivityAt: Date;
    owner: {
        id: string;
        name: string | null;
        email: string | null;
    };
    github: {
        username: string;
        avatarUrl: string | null;
    } | null;
    archivedAt: Date | null;
}

export interface ListCodebasesResult {
    items: CodebaseSummary[];
    nextCursor: string | null;
    hasMore: boolean;
    totalCount: number;
}
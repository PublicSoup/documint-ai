import { db } from "../db";
import { detectLanguageFromPath } from "../project-files";

/**
 * Virtual File System for the in-IDE AI agent.
 *
 * Backed by the user's ACTUAL project files in the database — the same `File`
 * records the IDE loads, edits, and mounts into WebContainer. This is what makes
 * the agent able to "code in the IDE like Cline": read_file/list_files see the
 * real project, and write_to_file/apply_patch persist to the same store the IDE
 * reads from (idempotent upsert by `(userId, name)`, so re-writing a file edits
 * it in place instead of creating duplicates).
 *
 * The `cwd` parameter is accepted for signature compatibility with the engine
 * but ignored — paths are project-relative file names (e.g. "src/index.ts").
 */

const MAX_FILES = 800;
const MAX_SEARCH_RESULTS = 40;

/** Normalize a project path and reject traversal. */
function normalizeVfsPath(filePath: string): string {
    const cleaned = filePath.replace(/^\.?\/+/, "").replace(/\/+$/g, "").trim();
    if (cleaned.split("/").includes("..")) {
        throw new Error("Path traversal is not allowed");
    }
    return cleaned;
}

/** Read a file's content from the user's project. */
export async function readFile(userId: string, filePath: string, _cwd?: string): Promise<string> {
    const name = normalizeVfsPath(filePath);
    const file = await db.file.findFirst({
        where: { userId, name },
        orderBy: { updatedAt: "desc" },
        select: { content: true },
    });
    if (!file) {
        throw new Error(`File not found: ${name}`);
    }
    return file.content ?? "";
}

/** Create or update a file in the user's project (idempotent by name). */
export async function writeFile(
    userId: string,
    filePath: string,
    content: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const name = normalizeVfsPath(filePath);
        if (!name) return { success: false, error: "Empty file path" };

        const existing = await db.file.findFirst({
            where: { userId, name },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
        });

        const data = {
            content,
            size: content.length,
            language: detectLanguageFromPath(name),
        };

        if (existing) {
            await db.file.update({ where: { id: existing.id }, data });
        } else {
            await db.file.create({ data: { userId, name, ...data } });
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Write failed" };
    }
}

/** List project file paths (optionally under a directory). Returns full relative paths. */
export async function listFiles(userId: string, dirPath: string, _cwd?: string): Promise<string[]> {
    const files: { name: string }[] = await db.file.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: "asc" },
        take: MAX_FILES,
    });

    const dir = dirPath && dirPath !== "." ? `${normalizeVfsPath(dirPath)}/` : "";
    return files
        .map((f) => f.name)
        .filter((name) => (dir ? name.startsWith(dir) : true))
        .sort((a, b) => a.localeCompare(b));
}

/** Delete a file from the user's project. */
export async function deleteFile(userId: string, filePath: string): Promise<boolean> {
    try {
        const name = normalizeVfsPath(filePath);
        const res = await db.file.deleteMany({ where: { userId, name } });
        return res.count > 0;
    } catch {
        return false;
    }
}

/** Find files whose path matches a name pattern (e.g. "*.ts", "index"). */
export async function searchByName(userId: string, pattern: string): Promise<string[]> {
    const needle = pattern.replace(/\*/g, "").toLowerCase().trim();
    const files: { name: string }[] = await db.file.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: "asc" },
        take: MAX_FILES,
    });
    return files
        .map((f) => f.name)
        .filter((name) => !needle || name.toLowerCase().includes(needle))
        .slice(0, MAX_SEARCH_RESULTS);
}

/** Search file contents for a query, returning `path:line: text` matches. */
export async function grepContent(userId: string, query: string): Promise<string[]> {
    const needle = query.toLowerCase();
    if (!needle) return [];

    const files: { name: string; content: string | null }[] = await db.file.findMany({
        where: { userId },
        select: { name: true, content: true },
        orderBy: { name: "asc" },
        take: MAX_FILES,
    });

    const matches: string[] = [];
    for (const file of files) {
        if (!file.content) continue;
        const lines = file.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(needle)) {
                matches.push(`${file.name}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
                if (matches.length >= MAX_SEARCH_RESULTS) return matches;
            }
        }
    }
    return matches;
}

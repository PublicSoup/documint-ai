import { Prisma } from "@prisma/client";
import { db } from "./db";
import { getFileContent } from "./files";
import { parseCode, type CodeEntity } from "./parsing/tree-sitter";
import { analyzeCodeQuality } from "./parsing/code-quality";
import { generateDocumentation } from "./ai";
import { logAudit } from "./audit-logger";
import { isTextSourcePath } from "./project-files";

/**
 * Automatic documentation generation for IDE files.
 *
 * This is the real implementation behind the "auto documentation" feature: given
 * a file that lives in the workspace (a Prisma `File`), it parses the code,
 * scores its quality, asks the AI to document the most significant entities plus
 * a file-level summary, and persists a `Documentation` record (+ a `DocVersion`)
 * in exactly the same shape produced by `POST /api/analyze`. That shared shape is
 * what the IDE doc inspector, `/api/generate-docs`, and the analytics coverage
 * metrics all read.
 *
 * It is safe to call from fire-and-forget save triggers: it is idempotent
 * (skips files that already have docs unless `force` is set), guards against
 * concurrent runs for the same file, and never throws.
 */

const MAX_ENTITIES = 10; // Cap AI calls per file (mirrors /api/analyze).
const DEFAULT_BATCH_CAP = 15;
const MAX_BATCH_CAP = 50;
const PENDING_ENTITY_DOC = "Documentation pending...";

export type AutoDocStatus =
    | "generated"
    | "skipped_existing"
    | "skipped_empty"
    | "skipped_unsupported"
    | "skipped_in_progress"
    | "error";

export interface AutoDocResult {
    fileId: string;
    name?: string;
    status: AutoDocStatus;
    qualityScore?: number;
    reason?: string;
}

export interface AutoDocOptions {
    /** Regenerate even if the file already has documentation. */
    force?: boolean;
    /** Optional team style-guide to steer tone/format. */
    styleGuide?: string;
    /** Human-readable trigger label recorded in the version/audit trail. */
    reason?: string;
}

/**
 * Best-effort, in-process guard against duplicate concurrent generation for the
 * same file (e.g. two rapid successive saves). This is not a distributed lock —
 * the `@unique` constraint on `Documentation.fileId` is the real backstop — but
 * it avoids obviously wasteful double AI runs within a single warm instance.
 */
const inFlight = new Set<string>();

function extensionOf(name: string): string {
    return name.split(".").pop()?.toLowerCase() || "";
}

/**
 * Generate and persist documentation for a single file.
 *
 * Never throws — all failures are returned as an `error` result so callers
 * (including fire-and-forget triggers) stay simple.
 */
export async function autoDocumentFile(
    fileId: string,
    userId: string,
    opts: AutoDocOptions = {},
): Promise<AutoDocResult> {
    if (inFlight.has(fileId)) {
        return { fileId, status: "skipped_in_progress" };
    }
    inFlight.add(fileId);

    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: {
                id: true,
                name: true,
                teamId: true,
                documentation: { select: { id: true } },
            },
        });

        if (!file) {
            return { fileId, status: "error", reason: "File not found" };
        }

        // Idempotency: a documented file is left alone unless the caller forces
        // regeneration. This is what makes it safe to fire on every save.
        if (file.documentation && !opts.force) {
            return { fileId, name: file.name, status: "skipped_existing" };
        }

        // Only source files are worth documenting (skip images, lockfiles, etc.).
        if (!isTextSourcePath(file.name)) {
            return { fileId, name: file.name, status: "skipped_unsupported" };
        }

        const content = await getFileContent(fileId);
        if (!content || !content.trim()) {
            return { fileId, name: file.name, status: "skipped_empty" };
        }

        const extension = extensionOf(file.name);

        // 1. Structural parse (best-effort: a summary is still useful without it).
        let entities: CodeEntity[] = [];
        try {
            entities = await parseCode(content, extension);
        } catch {
            // Parser is optional; continue with an empty entity list.
        }

        // 2. Deterministic quality/security analysis.
        const analysis = analyzeCodeQuality(content, entities, extension);

        // 3. AI documentation for the most significant entities (bounded for cost).
        const limitedEntities = entities.slice(0, MAX_ENTITIES);
        const entityDocs: (CodeEntity & { doc: string })[] = [];
        let anyEntityOk = false;

        for (const entity of limitedEntities) {
            try {
                const doc = await generateDocumentation(entity.code, extension, entity.type, opts.styleGuide);
                if (doc && doc.trim()) anyEntityOk = true;
                entityDocs.push({ ...entity, doc: doc?.trim() ? doc : PENDING_ENTITY_DOC });
            } catch {
                entityDocs.push({ ...entity, doc: PENDING_ENTITY_DOC });
            }
        }

        // 4. File-level AI summary.
        let summaryOk = true;
        const summary = await generateDocumentation(content.substring(0, 3000), extension, "file", opts.styleGuide)
            .catch(() => {
                summaryOk = false;
                return "Summary generation pending.";
            });

        // If the AI backend produced nothing usable at all, do NOT persist a
        // permanently-"pending" document — that would poison the idempotency
        // guard and block future retries. Report an error so it can be retried.
        if (!summaryOk && !anyEntityOk) {
            return { fileId, name: file.name, status: "error", reason: "AI generation unavailable" };
        }

        const documentationContent = JSON.stringify({
            summary,
            entities: entityDocs,
            qualityScore: analysis.qualityScore,
            securityInsights: analysis.securityInsights,
            metadata: {
                linesOfCode: content.split("\n").length,
                functions: entities.filter((e) => e.type === "function").length,
                classes: entities.filter((e) => e.type === "class").length,
                analyzedAt: new Date().toISOString(),
                autoGenerated: true,
                trigger: opts.reason ?? "auto",
                ...analysis,
            },
        });

        // 5. Persist documentation + a new version atomically.
        const docRecord = await db.$transaction(async (tx: Omit<Prisma.TransactionClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => {
            const doc = await tx.documentation.upsert({
                where: { fileId },
                create: {
                    fileId,
                    content: documentationContent,
                    metadata: analysis as unknown as Prisma.InputJsonValue,
                    status: "DRAFT",
                },
                update: {
                    content: documentationContent,
                    metadata: analysis as unknown as Prisma.InputJsonValue,
                },
            });

            const latest = await tx.docVersion.findFirst({
                where: { documentationId: doc.id },
                orderBy: { version: "desc" },
                select: { version: true },
            });

            await tx.docVersion.create({
                data: {
                    documentationId: doc.id,
                    content: documentationContent,
                    version: (latest?.version ?? 0) + 1,
                    message: opts.reason
                        ? `Auto-generated documentation (${opts.reason})`
                        : "Auto-generated documentation",
                    createdById: userId,
                },
            });

            return doc;
        });

        // 6. Audit trail (non-blocking).
        try {
            await logAudit({
                action: "AUTO_DOCUMENT",
                entity: "Documentation",
                entityId: docRecord.id,
                userId,
                details: {
                    fileId,
                    name: file.name,
                    score: analysis.qualityScore,
                    trigger: opts.reason ?? "auto",
                    degraded: !summaryOk || !anyEntityOk,
                },
            });
        } catch {
            // Non-blocking.
        }

        // 7. Keep analytics coverage fresh so the new doc shows up immediately.
        try {
            const { clearAnalyticsCache } = await import("./analytics");
            await clearAnalyticsCache(userId, file.teamId ?? undefined);
        } catch {
            // Non-blocking.
        }

        return { fileId, name: file.name, status: "generated", qualityScore: analysis.qualityScore };
    } catch (error) {
        console.error(`[AutoDoc] Failed to document file ${fileId}:`, error);
        return {
            fileId,
            status: "error",
            reason: error instanceof Error ? error.message : "Unknown error",
        };
    } finally {
        inFlight.delete(fileId);
    }
}

export interface AutoDocBatchResult {
    results: AutoDocResult[];
    documented: number;
    skipped: number;
    failed: number;
    scanned: number;
}

/**
 * Document a user's (or team's) files in bulk. By default it only targets files
 * that have no documentation yet — i.e. "catch up everything in the IDE that
 * isn't documented" — bounded by `cap` to keep AI cost predictable.
 */
export async function autoDocumentUserFiles(
    userId: string,
    opts: { cap?: number; teamId?: string; force?: boolean } = {},
): Promise<AutoDocBatchResult> {
    const cap = Math.min(Math.max(opts.cap ?? DEFAULT_BATCH_CAP, 1), MAX_BATCH_CAP);

    const scope: Prisma.FileWhereInput = opts.teamId
        ? { teamId: opts.teamId }
        : { userId, teamId: null };

    const files = await db.file.findMany({
        where: {
            ...scope,
            // Only undocumented files unless a full refresh is forced.
            ...(opts.force ? {} : { documentation: { is: null } }),
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: cap,
    });

    const results: AutoDocResult[] = [];
    for (const f of files) {
        // Sequential on purpose: bounds concurrent AI load and respects rate limits.
        results.push(await autoDocumentFile(f.id, userId, { reason: "bulk", force: opts.force }));
    }

    const documented = results.filter((r) => r.status === "generated").length;
    const failed = results.filter((r) => r.status === "error").length;
    const skipped = results.length - documented - failed;

    return { results, documented, skipped, failed, scanned: results.length };
}

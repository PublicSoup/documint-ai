/**
 * Deterministic documentation reviewer (no AI).
 *
 * Assesses whether a file's documentation is present, complete, and in sync with
 * the code — using only the code and the stored doc. Replaces the AI drift check
 * (`detectIntentDrift`) for the automatic path, so it works on Railway and is
 * instant/free. Produces a doc-health score + status and the concrete issues.
 */
import { db } from "./db";
import { getFileContent } from "./files";
import { parseCode } from "./parsing/tree-sitter";
import { computeFileMetrics } from "./file-insights";

export type DocStatus = "IN_SYNC" | "STALE" | "UNDOCUMENTED" | "THIN";

export interface DocReviewResult {
    hasDoc: boolean;
    stale: boolean;
    docScore: number; // 0-100 deterministic documentation health
    status: DocStatus;
    issues: string[];
}

// A save that lands within this window of the doc write isn't treated as drift
// (covers the doc-write-then-file-touch ordering during auto-documentation).
const STALE_TOLERANCE_MS = 60 * 1000;
const THIN_SUMMARY_CHARS = 40;

interface StoredDoc {
    summary?: string;
    entities?: Array<{ name?: string }>;
}

function parseStoredDoc(raw: string): StoredDoc {
    try {
        return JSON.parse(raw) as StoredDoc;
    } catch {
        // Plain-text doc — treat the whole thing as the summary.
        return { summary: raw };
    }
}

function extFor(name: string, language: string): string {
    if (name.includes(".")) return name.split(".").pop()!.toLowerCase();
    return language;
}

/**
 * Review a file's documentation deterministically. Never throws — returns an
 * UNDOCUMENTED result on any problem.
 */
export async function reviewDocumentation(fileId: string): Promise<DocReviewResult> {
    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: {
                id: true,
                name: true,
                language: true,
                content: true,
                storagePath: true,
                updatedAt: true,
                documentation: { select: { content: true, updatedAt: true, status: true } },
            },
        });
        if (!file) {
            return { hasDoc: false, stale: false, docScore: 0, status: "UNDOCUMENTED", issues: ["File not found"] };
        }

        let content = file.content ?? null;
        if ((!content || !content.trim()) && file.storagePath) {
            content = await getFileContent(fileId).catch(() => null);
        }

        // No doc record at all → undocumented; score from code doc-comment coverage.
        if (!file.documentation) {
            const cov = content ? computeFileMetrics(content, file.language).docCoverage : 0;
            return {
                hasDoc: false,
                stale: false,
                docScore: Math.round(cov * 100),
                status: "UNDOCUMENTED",
                issues: ["No documentation has been generated for this file."],
            };
        }

        const doc = parseStoredDoc(file.documentation.content);
        const issues: string[] = [];
        let score = 100;

        // 1. Thin / placeholder summary.
        const summary = (doc.summary ?? "").trim();
        const thin = summary.length < THIN_SUMMARY_CHARS || /pending/i.test(summary);
        if (thin) {
            issues.push("Documentation summary is missing, too short, or a placeholder.");
            score -= 30;
        }

        // 2. Staleness by timestamp (code saved after the doc was written).
        const codeNewer =
            file.updatedAt.getTime() > file.documentation.updatedAt.getTime() + STALE_TOLERANCE_MS;

        // 3. Concrete drift: the set of exported symbols changed since the doc
        //    recorded them. Strong, AI-free "docs no longer match code" signal.
        let exportsChanged = false;
        if (content && Array.isArray(doc.entities)) {
            let current: string[] = [];
            try {
                const entities = await parseCode(content, extFor(file.name, file.language));
                current = entities.map((e) => e.name).filter(Boolean).sort();
            } catch {
                current = [];
            }
            const documented = doc.entities.map((e) => e?.name).filter((n): n is string => Boolean(n)).sort();
            if (current.length || documented.length) {
                exportsChanged = current.join("|") !== documented.join("|");
            }
        }

        const stale = codeNewer || exportsChanged;
        if (stale) {
            issues.push(
                exportsChanged
                    ? "Exported symbols changed since the docs were written — docs are out of date."
                    : "Code was modified after the documentation was last generated.",
            );
            score -= 40;
        }

        // 4. Undocumented exports (deterministic doc-comment coverage).
        if (content) {
            const cov = computeFileMetrics(content, file.language).docCoverage;
            if (cov < 0.5) {
                issues.push(`Only ${Math.round(cov * 100)}% of exported symbols have doc comments.`);
                score -= Math.round((0.5 - cov) * 40);
            }
        }

        const status: DocStatus = thin ? "THIN" : stale ? "STALE" : "IN_SYNC";
        return {
            hasDoc: true,
            stale,
            docScore: Math.max(0, Math.min(100, score)),
            status,
            issues,
        };
    } catch {
        return { hasDoc: false, stale: false, docScore: 0, status: "UNDOCUMENTED", issues: ["Review failed"] };
    }
}

/**
 * Automatic deterministic doc review: flags a drifted/stale doc for review by
 * setting Documentation.status = "REVIEW" (which surfaces it in the dashboard
 * review queue). No AI. Returns the review result. Never throws.
 */
export async function autoReviewDocumentation(fileId: string): Promise<DocReviewResult> {
    const result = await reviewDocumentation(fileId);
    if (result.hasDoc && result.stale) {
        try {
            const doc = await db.documentation.findUnique({ where: { fileId }, select: { status: true } });
            if (doc && doc.status !== "REVIEW") {
                await db.documentation.update({ where: { fileId }, data: { status: "REVIEW" } });
            }
        } catch {
            // Non-blocking.
        }
    }
    return result;
}

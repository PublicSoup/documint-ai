/**
 * Deterministic, AI-free file analysis.
 *
 * Computes code metrics and findings purely in code (no LLM) and persists them
 * to `FileInsight`, so the dashboard's coverage/quality/risk panels and the
 * reviews section always have real data — instantly, for free, and regardless
 * of whether an AI provider is configured. Reuses the existing analyzers:
 *   - computeFileMetrics()  (lib/file-insights)  — LOC, doc coverage, risk
 *   - analyzeCodeQuality()  (lib/parsing/code-quality) — quality, security, debt
 *   - parseCode()           (lib/parsing/tree-sitter)  — entity extraction
 */
import crypto from "node:crypto";
import { db } from "./db";
import { getFileContent } from "./files";
import { parseCode, type CodeEntity } from "./parsing/tree-sitter";
import { analyzeCodeQuality } from "./parsing/code-quality";
import { computeFileMetrics } from "./file-insights";
import type { Finding } from "./code-review";

export interface DeterministicResult {
    qualityScore: number; // 0-100
    docCoverage: number; // 0..1
    riskScore: number; // 0-100
    loc: number;
    complexity: number; // cyclomatic
    findings: Finding[];
    security: string[];
    language: string;
}

const LANG_TO_EXT: Record<string, string> = {
    typescript: "ts",
    typescriptreact: "tsx",
    javascript: "js",
    javascriptreact: "jsx",
    python: "py",
    ruby: "rb",
    go: "go",
    rust: "rs",
    java: "java",
    csharp: "cs",
    cpp: "cpp",
    c: "c",
    php: "php",
    sql: "sql",
    shell: "sh",
    css: "css",
    html: "html",
    json: "json",
    markdown: "md",
};

function extFor(language: string, name?: string): string {
    if (name && name.includes(".")) return name.split(".").pop()!.toLowerCase();
    return LANG_TO_EXT[language] ?? language;
}

function sha256(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Turn the deterministic analyzer's string signals into structured findings
 * that share the code-review Finding shape (so the reviews UI can render them).
 */
function deriveFindings(
    security: string[],
    technicalDebt: string[],
    architectureViolations: string[],
    performanceBottlenecks: string[],
    fileName: string,
): Finding[] {
    const findings: Finding[] = [];
    const push = (
        category: Finding["category"],
        severity: Finding["severity"],
        items: string[],
    ) => {
        for (const item of items) {
            if (!item || !item.trim()) continue;
            findings.push({ category, severity, file: fileName, line: null, title: item.trim(), detail: "" });
        }
    };
    push("security", "high", security);
    push("performance", "medium", performanceBottlenecks);
    push("style", "medium", architectureViolations);
    push("bug", "low", technicalDebt);
    return findings;
}

/** Pure computation — no DB. Safe to call from anywhere. */
export async function analyzeContent(content: string, language: string, name?: string): Promise<DeterministicResult> {
    const extension = extFor(language, name);

    let entities: CodeEntity[] = [];
    try {
        entities = await parseCode(content, extension);
    } catch {
        // Parser is best-effort; continue with an empty entity list.
    }

    const metrics = computeFileMetrics(content, language);
    const analysis = analyzeCodeQuality(content, entities, extension);

    return {
        qualityScore: Math.round(analysis.qualityScore),
        docCoverage: Math.max(0, Math.min(1, metrics.docCoverage)),
        riskScore: Math.round(metrics.riskScore),
        loc: metrics.loc,
        complexity: analysis.complexityMetrics.cyclomaticComplexity,
        findings: deriveFindings(
            analysis.securityInsights,
            analysis.technicalDebt,
            analysis.architectureViolations,
            analysis.performanceBottlenecks,
            name ?? "file",
        ),
        security: analysis.securityInsights,
        language,
    };
}

/**
 * Analyze a file and upsert its FileInsight row. Idempotent: skips work when the
 * content hasn't changed since the last analysis. Never throws — returns null on
 * any problem (missing file, empty content, unchanged content).
 */
export async function analyzeAndPersistFile(
    fileId: string,
    opts: { content?: string } = {},
): Promise<DeterministicResult | null> {
    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, name: true, language: true, content: true, storagePath: true, userId: true, teamId: true },
        });
        if (!file) return null;

        let content = opts.content ?? file.content ?? null;
        if ((!content || !content.trim()) && file.storagePath) {
            content = await getFileContent(fileId).catch(() => null);
        }
        if (!content || !content.trim()) return null;

        const contentHash = sha256(content);
        const existing = await db.fileInsight.findUnique({ where: { fileId }, select: { contentHash: true } });
        if (existing?.contentHash === contentHash) {
            return null; // Unchanged since last analysis — nothing to do.
        }

        const result = await analyzeContent(content, file.language, file.name);

        const row = {
            qualityScore: result.qualityScore,
            docCoverage: result.docCoverage,
            riskScore: result.riskScore,
            loc: result.loc,
            complexity: result.complexity,
            findings: result.findings as unknown as object,
            security: result.security as unknown as object,
            language: result.language,
            contentHash,
            userId: file.userId,
            teamId: file.teamId,
        };

        await db.fileInsight.upsert({
            where: { fileId },
            create: { fileId, ...row },
            update: row,
        });

        return result;
    } catch (error) {
        console.error(`[deterministic-analysis] Failed for file ${fileId}:`, error);
        return null;
    }
}

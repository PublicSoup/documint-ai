import type { File as PrismaFile } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FileMetrics {
    loc: number;
    sloc: number;
    imports: number;
    exports: number;
    functions: number;
    classes: number;
    interfaces: number;
    todoCount: number;
    avgLineLength: number;
    docCoverage: number; // 0..1
    riskScore: number; // 0..100
    language: string;
}

export interface WorkspaceSummary {
    totalFiles: number;
    totalLOC: number;
    documentedCount: number;
    undocumentedCount: number;
    coveragePercent: number;
    avgRisk: number;
    criticalCount: number; // files with riskScore > 80
}

// ── Language detection ─────────────────────────────────────────────────────

const COMMENT_PATTERNS: Record<string, { line: RegExp; block: RegExp }> = {
    typescript: { line: /^\/\//, block: /\/\*\*/ },
    javascript: { line: /^\/\//, block: /\/\*\*/ },
    python: { line: /^#/, block: /^"""/ },
    ruby: { line: /^#/, block: /^=begin/ },
    go: { line: /^\/\//, block: /\/\*\*/ },
    rust: { line: /^\/\//, block: /\/\*\*/ },
    java: { line: /^\/\//, block: /\/\*\*/ },
    php: { line: /^\/\//, block: /\/\*\*/ },
    shell: { line: /^#/, block: /^\x00/ },
    sql: { line: /^--/, block: /\/\*\*/ },
    css: { line: /^\/\//, block: /\/\*\*/ },
    html: { line: /^$/, block: /^<!--/ },
};

const IMPORT_PATTERNS: RegExp[] = [
    /^import\s+/,                    // ES module import
    /^from\s+["']/,                  // import ... from '...'
    /^const\s+.*=\s*require\s*\(/,   // CJS require
    /^import\s*\(/,                  // dynamic import
];

const IMPORT_LINE = /^(?:import\s+(?:type\s+)?(?:{[^}]+}|[\w*]+(?:\s*,\s*\{[^}]+\})?)\s+from\s+["'][^"']+["']|import\s*\(\s*["'][^"']+["']\s*\)|const\s+.*=\s*require\s*\(\s*["'][^"']+["']\s*\))/;
const EXPORT_LINE = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)/;
const FUNCTION_LINE = /^(?:export\s+)?(?:async\s+)?function\s+/;
const CLASS_LINE = /^(?:export\s+)?class\s+/;
const INTERFACE_LINE = /^(?:export\s+)?interface\s+/;
const TODO_LINE = /\b(TODO|FIXME|HACK|XXX)\b/;
const JSDOC_BLOCK = /\/\*\*/;
const DOCSTRING = /^"""/;

// ── Core computation ───────────────────────────────────────────────────────

export function computeFileMetrics(content: string, language: string): FileMetrics {
    const lines = content.split("\n");
    const loc = lines.length;

    if (loc === 0) {
        return {
            loc: 0,
            sloc: 0,
            imports: 0,
            exports: 0,
            functions: 0,
            classes: 0,
            interfaces: 0,
            todoCount: 0,
            avgLineLength: 0,
            docCoverage: 0,
            riskScore: 0,
            language,
        };
    }

    const commentPattern = COMMENT_PATTERNS[language] || COMMENT_PATTERNS.typescript;

    let sloc = 0;
    let imports = 0;
    let exports = 0;
    let functions = 0;
    let classes = 0;
    let interfaces = 0;
    let todoCount = 0;
    let totalLength = 0;
    let documentedSymbols = 0;
    let totalSymbols = 0;

    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Track block comments
        if (inBlockComment) {
            if (trimmed.includes("*/")) {
                inBlockComment = false;
            }
            continue;
        }

        // Detect block comment start
        if (trimmed.startsWith("/*")) {
            if (!trimmed.includes("*/")) {
                inBlockComment = true;
            }
            continue;
        }

        // Skip blank lines
        if (trimmed.length === 0) continue;

        // Skip single-line comments
        if (commentPattern.line.test(trimmed)) continue;

        // This is a meaningful line
        sloc++;
        totalLength += line.length;

        // Imports
        if (IMPORT_LINE.test(trimmed)) {
            imports++;
        }

        // Exports
        if (EXPORT_LINE.test(trimmed)) {
            exports++;
            totalSymbols++;
            // Check if the previous line has a JSDoc comment
            if (i > 0) {
                const prevTrimmed = lines[i - 1].trim();
                if (JSDOC_BLOCK.test(prevTrimmed) || DOCSTRING.test(prevTrimmed)) {
                    documentedSymbols++;
                }
            }
        }

        // Functions (non-exported)
        if (FUNCTION_LINE.test(trimmed) && !EXPORT_LINE.test(trimmed)) {
            totalSymbols++;
            if (i > 0) {
                const prevTrimmed = lines[i - 1].trim();
                if (JSDOC_BLOCK.test(prevTrimmed) || DOCSTRING.test(prevTrimmed)) {
                    documentedSymbols++;
                }
            }
        }

        if (FUNCTION_LINE.test(trimmed)) {
            functions++;
        }

        // Classes
        if (CLASS_LINE.test(trimmed)) {
            classes++;
        }

        // Interfaces
        if (INTERFACE_LINE.test(trimmed)) {
            interfaces++;
        }

        // TODOs
        if (TODO_LINE.test(trimmed)) {
            todoCount++;
        }
    }

    const avgLineLength = sloc > 0 ? Math.round(totalLength / sloc) : 0;
    const docCoverage = totalSymbols > 0 ? documentedSymbols / totalSymbols : 1;
    const riskScore = computeRiskScore(sloc, todoCount, docCoverage, content.length);

    return {
        loc,
        sloc,
        imports,
        exports,
        functions,
        classes,
        interfaces,
        todoCount,
        avgLineLength,
        docCoverage,
        riskScore,
        language,
    };
}

// ── Risk scoring ───────────────────────────────────────────────────────────

function computeRiskScore(
    sloc: number,
    todoCount: number,
    docCoverage: number,
    sizeBytes: number,
): number {
    // Normalize each factor to 0..100 range
    const sizeFactor = Math.min(100, (sloc / 300) * 100); // 300+ SLOC = max risk
    const todoFactor = Math.min(100, todoCount * 15); // ~7 TODOs = max risk
    const docFactor = (1 - docCoverage) * 100; // 0% coverage = 100 risk
    const fileSizeFactor = Math.min(100, (sizeBytes / 50000) * 100); // 50KB+ = max risk

    // Weighted composite
    const risk = Math.round(
        sizeFactor * 0.25 +
        todoFactor * 0.20 +
        docFactor * 0.30 +
        fileSizeFactor * 0.25
    );

    return Math.min(100, Math.max(0, risk));
}

// ── Workspace summary ──────────────────────────────────────────────────────

export interface FileWithDoc {
    content?: string | null;
    language: string;
    documentation?: { status: string } | null;
}

export function computeWorkspaceSummary(files: FileWithDoc[]): WorkspaceSummary {
    let totalLOC = 0;
    let documentedCount = 0;
    let undocumentedCount = 0;
    let totalRisk = 0;
    let criticalCount = 0;

    for (const file of files) {
        const content = file.content;
        if (content) {
            const metrics = computeFileMetrics(content, file.language);
            totalLOC += metrics.loc;
            totalRisk += metrics.riskScore;
            if (metrics.riskScore > 80) {
                criticalCount++;
            }
        }

        if (
            file.documentation &&
            (file.documentation.status === "APPROVED" || file.documentation.status === "REVIEW")
        ) {
            documentedCount++;
        } else {
            undocumentedCount++;
        }
    }

    const totalFiles = documentedCount + undocumentedCount;

    return {
        totalFiles,
        totalLOC,
        documentedCount,
        undocumentedCount,
        coveragePercent: totalFiles > 0 ? Math.round((documentedCount / totalFiles) * 100) : 0,
        avgRisk: files.length > 0 ? Math.round(totalRisk / files.length) : 0,
        criticalCount,
    };
}

// ── Formatting helpers ─────────────────────────────────────────────────────

export function formatLOC(loc: number): string {
    if (loc >= 1000) {
        return `${(loc / 1000).toFixed(1)}k`;
    }
    return loc.toLocaleString();
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
}

export function getRiskColor(score: number): {
    text: string;
    bg: string;
    border: string;
    label: string;
} {
    if (score <= 30) {
        return {
            text: "text-emerald-400",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
            label: "Low Risk",
        };
    }
    if (score <= 60) {
        return {
            text: "text-amber-400",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
            label: "Medium Risk",
        };
    }
    if (score <= 80) {
        return {
            text: "text-orange-400",
            bg: "bg-orange-500/10",
            border: "border-orange-500/20",
            label: "High Risk",
        };
    }
    return {
        text: "text-rose-400",
        bg: "bg-rose-500/10",
        border: "border-rose-500/20",
        label: "Critical Risk",
    };
}
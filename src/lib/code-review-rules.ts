/**
 * Deterministic code-review rule engine (no AI).
 *
 * Produces a {@link SourceReviewResult} — the same shape the AI reviewer
 * (`analyzeSource`) returns — so a review always has real, instant, free
 * findings even when no AI provider is configured. The AI path becomes optional
 * enrichment layered on top (see /api/reviews/file).
 *
 * Reuses the deterministic analyzer (`analyzeContent`) for quality/security/debt
 * signals and adds line-level heuristics on top.
 */
import { analyzeContent } from "./deterministic-analysis";
import { gradeFromScore, type Finding, type RiskLevel, type SourceReviewResult } from "./code-review";

function riskLevelFromScore(riskScore: number): RiskLevel {
    if (riskScore >= 80) return "CRITICAL";
    if (riskScore >= 60) return "HIGH";
    if (riskScore >= 35) return "MEDIUM";
    return "LOW";
}

interface LineRule {
    test: RegExp;
    category: Finding["category"];
    severity: Finding["severity"];
    title: string;
    detail: string;
    suggestion?: string;
}

// High-signal, low-false-positive line rules. Kept deliberately small.
const LINE_RULES: LineRule[] = [
    {
        test: /\b(TODO|FIXME|HACK|XXX)\b/,
        category: "style",
        severity: "low",
        title: "Unresolved TODO/FIXME",
        detail: "Left-over work marker in committed code.",
        suggestion: "Resolve it or track it in an issue and remove the marker.",
    },
    {
        test: /\bconsole\.(log|debug|info)\s*\(|\bdebugger\b|\bprint\s*\(|System\.out\.print/,
        category: "style",
        severity: "low",
        title: "Debug logging left in code",
        detail: "Debug output shouldn't ship to production.",
        suggestion: "Remove it or route through a proper logger.",
    },
    {
        test: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
        category: "bug",
        severity: "medium",
        title: "Empty catch swallows errors",
        detail: "An empty catch block hides failures and complicates debugging.",
        suggestion: "Handle, log, or rethrow the error.",
    },
    {
        test: /\beval\s*\(|\bnew Function\s*\(/,
        category: "security",
        severity: "high",
        title: "Dynamic code execution",
        detail: "eval / new Function can execute untrusted input.",
        suggestion: "Replace with a safe parser or explicit logic.",
    },
    {
        test: /:\s*any\b|<any>/,
        category: "style",
        severity: "low",
        title: "Use of `any` type",
        detail: "`any` disables type-checking for this value.",
        suggestion: "Give it a precise type or `unknown` with narrowing.",
    },
];

/** Scan the source line-by-line for the heuristic rules above. */
function scanHeuristics(content: string, fileName: string): Finding[] {
    const findings: Finding[] = [];
    const lines = content.split("\n");
    // Cap per-rule matches so a noisy file doesn't produce hundreds of findings.
    const perRuleCount = new Map<string, number>();
    const PER_RULE_CAP = 8;

    lines.forEach((line, i) => {
        for (const rule of LINE_RULES) {
            if (!rule.test.test(line)) continue;
            const seen = perRuleCount.get(rule.title) ?? 0;
            if (seen >= PER_RULE_CAP) continue;
            perRuleCount.set(rule.title, seen + 1);
            findings.push({
                category: rule.category,
                severity: rule.severity,
                file: fileName,
                line: i + 1,
                title: rule.title,
                detail: rule.detail,
                suggestion: rule.suggestion,
            });
        }
    });
    return findings;
}

/** Deterministic strengths, derived from the metrics (no AI). */
function deriveStrengths(quality: number, docCoverage: number, complexity: number, findingCount: number): string[] {
    const strengths: string[] = [];
    if (docCoverage >= 0.6) strengths.push("Well-documented");
    if (complexity <= 10) strengths.push("Low complexity");
    if (quality >= 80) strengths.push("High overall quality");
    if (findingCount === 0) strengths.push("No issues detected");
    return strengths;
}

/**
 * Run the deterministic review. Returns the same shape as `analyzeSource` so it
 * is a drop-in that works with or without AI.
 */
export async function runRuleEngine(content: string, language: string, fileName?: string): Promise<SourceReviewResult> {
    const det = await analyzeContent(content, language, fileName);
    const findings: Finding[] = [...det.findings, ...scanHeuristics(content, fileName ?? "file")];

    const critical = findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
    const summary = findings.length === 0
        ? `Static analysis found no issues. Quality ${det.qualityScore}/100, ${det.loc} LOC, complexity ${det.complexity}.`
        : `Static analysis found ${findings.length} issue${findings.length === 1 ? "" : "s"}${critical ? ` (${critical} high/critical)` : ""}. Quality ${det.qualityScore}/100, complexity ${det.complexity}.`;

    return {
        summary,
        qualityScore: det.qualityScore,
        grade: gradeFromScore(det.qualityScore),
        riskLevel: riskLevelFromScore(det.riskScore),
        strengths: deriveStrengths(det.qualityScore, det.docCoverage, det.complexity, findings.length),
        findings,
    };
}

/**
 * Merge a deterministic result with an optional AI result. Deterministic
 * findings are always kept; AI findings are appended (deduped by file+line+title)
 * and the AI's richer prose summary/strengths win when present.
 */
export function mergeReviews(base: SourceReviewResult, ai: SourceReviewResult | null): SourceReviewResult {
    if (!ai) return base;
    const key = (f: Finding) => `${f.file}:${f.line ?? 0}:${f.title.toLowerCase()}`;
    const seen = new Set(base.findings.map(key));
    const merged = [...base.findings];
    for (const f of ai.findings) {
        if (!seen.has(key(f))) {
            seen.add(key(f));
            merged.push(f);
        }
    }
    return {
        summary: ai.summary || base.summary,
        qualityScore: base.qualityScore, // deterministic score is authoritative
        grade: base.grade,
        riskLevel: base.riskLevel,
        strengths: ai.strengths.length ? ai.strengths : base.strengths,
        findings: merged,
    };
}

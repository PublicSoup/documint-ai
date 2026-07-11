/**
 * Auto Code Reviewer — shared core.
 *
 * Single source of truth for the AI review "brain" and the GitHub side-effects.
 * Both the manual dashboard endpoint (`/api/github/pr/analyze`) and the
 * automatic webhook → Inngest pipeline call into here, so review behaviour is
 * identical no matter how a review is triggered.
 */
import { db } from "@/lib/db";
import { getAICompletion, type AIMessage } from "@/lib/ai";
import { decrypt } from "@/lib/security/encryption";
import { logAudit } from "@/lib/audit-logger";
import { sendNotification } from "@/lib/notifications";
import { AuditLogSeverity } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type FindingCategory = "security" | "bug" | "performance" | "style" | "breaking" | "tests" | "docs";
export type Verdict = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Finding {
    category: FindingCategory;
    severity: Severity;
    file: string;
    line: number | null;
    title: string;
    detail: string;
    suggestion?: string;
}

export interface ReviewResult {
    summary: string;
    impactScore: number; // 0-100
    riskLevel: RiskLevel;
    findings: Finding[];
}

export interface PolicyChecks {
    security: boolean;
    performance: boolean;
    style: boolean;
    breaking: boolean;
    tests: boolean;
    docs: boolean;
}

export interface ReviewPolicyConfig {
    enabled: boolean;
    autoReview: boolean;
    postComments: boolean;
    postStatus: boolean;
    blockingSeverity: Severity;
    checks: PolicyChecks;
    ignorePaths: string[];
    instructions: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SEVERITY_RANK: Record<Severity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
};

const SEVERITIES: Severity[] = ["info", "low", "medium", "high", "critical"];
const CATEGORIES: FindingCategory[] = ["security", "bug", "performance", "style", "breaking", "tests", "docs"];

const DEFAULT_CHECKS: PolicyChecks = {
    security: true,
    performance: true,
    style: true,
    breaking: true,
    tests: true,
    docs: true,
};

const STATUS_CONTEXT = "documint/ai-code-review";
const MAX_DIFF_CHARS = 45000; // keep well under model context while covering most PRs
const MAX_INLINE_COMMENTS = 25;

export const DEFAULT_REVIEW_POLICY: ReviewPolicyConfig = {
    enabled: true,
    autoReview: true,
    postComments: true,
    postStatus: true,
    blockingSeverity: "high",
    checks: DEFAULT_CHECKS,
    ignorePaths: [],
    instructions: null,
};

// ---------------------------------------------------------------------------
// Policy normalisation (defends against loosely-typed Json columns)
// ---------------------------------------------------------------------------

export function normalizePolicy(raw: Partial<Record<string, unknown>> | null | undefined): ReviewPolicyConfig {
    const r = (raw ?? {}) as Record<string, unknown>;
    const checksRaw = (r.checks ?? {}) as Record<string, unknown>;
    const checks: PolicyChecks = {
        security: checksRaw.security !== false,
        performance: checksRaw.performance !== false,
        style: checksRaw.style !== false,
        breaking: checksRaw.breaking !== false,
        tests: checksRaw.tests !== false,
        docs: checksRaw.docs !== false,
    };
    const blocking = typeof r.blockingSeverity === "string" && SEVERITIES.includes(r.blockingSeverity as Severity)
        ? (r.blockingSeverity as Severity)
        : "high";

    return {
        enabled: r.enabled !== false,
        autoReview: r.autoReview !== false,
        postComments: r.postComments !== false,
        postStatus: r.postStatus !== false,
        blockingSeverity: blocking,
        checks,
        ignorePaths: Array.isArray(r.ignorePaths) ? (r.ignorePaths as unknown[]).filter((p): p is string => typeof p === "string") : [],
        instructions: typeof r.instructions === "string" && r.instructions.trim() ? r.instructions.trim() : null,
    };
}

// ---------------------------------------------------------------------------
// Diff pre-processing
// ---------------------------------------------------------------------------

/** Strip hunks belonging to ignored paths, then hard-cap the size. */
export function prepareDiff(diff: string, ignorePaths: string[]): string {
    let working = diff;
    if (ignorePaths.length > 0) {
        const blocks = diff.split(/(?=^diff --git )/m);
        working = blocks
            .filter((block) => {
                const header = block.match(/^diff --git a\/(\S+) b\/(\S+)/m);
                const path = header?.[2] || header?.[1] || "";
                return !ignorePaths.some((prefix) => path.startsWith(prefix));
            })
            .join("");
    }
    return working.slice(0, MAX_DIFF_CHARS);
}

// ---------------------------------------------------------------------------
// The AI brain
// ---------------------------------------------------------------------------

function buildSystemPrompt(policy: ReviewPolicyConfig): string {
    const enabled = (Object.entries(policy.checks) as [FindingCategory, boolean][])
        .filter(([, on]) => on)
        .map(([k]) => k);

    return `You are a meticulous Staff-level software engineer performing an automated code review on a pull request diff.

Focus your review ONLY on these categories: ${enabled.join(", ")}, plus obvious correctness bugs.
Ignore purely subjective preferences. Every finding must be actionable and tied to a specific file and (when possible) a changed line number from the diff.

Severity guide:
- critical: security vulnerability, data loss, or guaranteed production breakage
- high: likely bug, breaking API change, or serious performance/security risk
- medium: real issue worth fixing before merge
- low: minor issue or nit
- info: informational note
${policy.instructions ? `\nTeam-specific guidelines (treat as authoritative):\n${policy.instructions}\n` : ""}
Output STRICT JSON only. No markdown fences, no preamble. Schema:
{
  "summary": "2-3 sentence plain-English summary of what this PR does and its overall risk",
  "impactScore": <integer 0-100, blast radius of the change>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "findings": [
    {
      "category": ${JSON.stringify(CATEGORIES)},
      "severity": ${JSON.stringify(SEVERITIES)},
      "file": "path/to/file",
      "line": <integer line number in the new file, or null>,
      "title": "short imperative title",
      "detail": "why this matters",
      "suggestion": "concrete fix (optional)"
    }
  ]
}
Return an empty findings array if the diff is clean.`;
}

function coerceFinding(raw: unknown): Finding | null {
    if (!raw || typeof raw !== "object") return null;
    const f = raw as Record<string, unknown>;
    const category = CATEGORIES.includes(f.category as FindingCategory) ? (f.category as FindingCategory) : "bug";
    const severity = SEVERITIES.includes(f.severity as Severity) ? (f.severity as Severity) : "low";
    const file = typeof f.file === "string" && f.file.trim() ? f.file.trim() : "unknown";
    const title = typeof f.title === "string" && f.title.trim() ? f.title.trim() : "Review note";
    const detail = typeof f.detail === "string" ? f.detail.trim() : "";
    const lineNum = typeof f.line === "number" && Number.isFinite(f.line) && f.line > 0 ? Math.floor(f.line) : null;
    const suggestion = typeof f.suggestion === "string" && f.suggestion.trim() ? f.suggestion.trim() : undefined;
    return { category, severity, file, line: lineNum, title, detail, suggestion };
}

function riskFromScoreAndSeverity(impactScore: number, findings: Finding[]): RiskLevel {
    const max = maxSeverity(findings);
    if (max === "critical") return "CRITICAL";
    if (max === "high" || impactScore >= 75) return "HIGH";
    if (max === "medium" || impactScore >= 40) return "MEDIUM";
    return "LOW";
}

/**
 * The pure AI review step. No DB, no GitHub — just diff in, structured result out.
 * Safe to call from the manual endpoint and the background pipeline alike.
 */
export async function analyzeDiff(
    diff: string,
    policy: ReviewPolicyConfig = DEFAULT_REVIEW_POLICY,
    opts: { userId?: string } = {},
): Promise<ReviewResult> {
    const prepared = prepareDiff(diff, policy.ignorePaths);
    if (!prepared.trim()) {
        return { summary: "No reviewable changes in this diff.", impactScore: 0, riskLevel: "LOW", findings: [] };
    }

    const messages: AIMessage[] = [
        { role: "system", content: buildSystemPrompt(policy) },
        { role: "user", content: `Review this git diff and return the JSON report:\n\n${prepared}` },
    ];

    const result = await getAICompletion(messages, {
        temperature: 0.15,
        jsonMode: true,
        maxTokens: 3000,
        userId: opts.userId,
    });

    if (!result?.content) {
        throw new Error("AI review returned no content");
    }

    const cleaned = result.content.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        // Best-effort recovery: grab the outermost JSON object.
        const match = cleaned.match(/\{[\s\S]*\}/);
        parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
    }

    const findings = Array.isArray(parsed.findings)
        ? (parsed.findings as unknown[]).map(coerceFinding).filter((f): f is Finding => f !== null)
        : [];

    const impactScore = typeof parsed.impactScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.impactScore)))
        : 0;

    return {
        summary: typeof parsed.summary === "string" ? parsed.summary : "AI review completed.",
        impactScore,
        riskLevel: riskFromScoreAndSeverity(impactScore, findings),
        findings,
    };
}

// ---------------------------------------------------------------------------
// Whole-file / project source review (dashboard "Reviews" section)
// ---------------------------------------------------------------------------

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface SourceReviewResult {
    summary: string;
    qualityScore: number; // 0-100
    grade: Grade;
    riskLevel: RiskLevel;
    strengths: string[];
    findings: Finding[];
}

const MAX_SOURCE_CHARS = 40000;

export function gradeFromScore(score: number): Grade {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
}

function buildSourceSystemPrompt(language: string, fileName: string | undefined, instructions: string | null): string {
    return `You are a Staff-level software engineer performing a thorough code review of a single ${language} source file${fileName ? ` ("${fileName}")` : ""}.

Assess overall quality, correctness, security, performance, readability/maintainability, error handling, and test/documentation coverage. Be concrete and actionable — every finding must point to a specific location and explain the risk.

Severity guide:
- critical: security vulnerability, data loss, or guaranteed breakage
- high: likely bug, injection risk, missing auth/validation, serious perf issue
- medium: real issue worth fixing
- low: minor issue or nit
- info: informational note
${instructions ? `\nTeam-specific guidelines (authoritative):\n${instructions}\n` : ""}
Output STRICT JSON only. No markdown fences, no preamble. Schema:
{
  "summary": "3-4 sentence plain-English assessment of the file's overall quality and biggest risks",
  "qualityScore": <integer 0-100, holistic code quality>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "strengths": ["short phrases describing what the code does well"],
  "findings": [
    {
      "category": ${JSON.stringify(CATEGORIES)},
      "severity": ${JSON.stringify(SEVERITIES)},
      "file": ${fileName ? JSON.stringify(fileName) : '"file"'},
      "line": <integer line number or null>,
      "title": "short imperative title (e.g. 'Add input validation', 'Missing error handling')",
      "detail": "why this matters",
      "suggestion": "concrete fix (optional)"
    }
  ]
}
Use the categories "tests" and "docs" for missing test coverage / missing documentation. Return an empty findings array only if the file is genuinely clean.`;
}

/**
 * Review a whole source file (not a diff). Powers the dashboard Reviews section.
 */
export async function analyzeSource(
    code: string,
    language: string,
    opts: { fileName?: string; instructions?: string | null; userId?: string } = {},
): Promise<SourceReviewResult> {
    const trimmed = (code ?? "").trim();
    if (!trimmed) {
        return { summary: "This file is empty — nothing to review.", qualityScore: 0, grade: "F", riskLevel: "LOW", strengths: [], findings: [] };
    }

    // Number the lines so the model can cite accurate line numbers.
    const numbered = trimmed
        .slice(0, MAX_SOURCE_CHARS)
        .split("\n")
        .map((l, i) => `${i + 1}\t${l}`)
        .join("\n");

    const messages: AIMessage[] = [
        { role: "system", content: buildSourceSystemPrompt(language || "code", opts.fileName, opts.instructions ?? null) },
        { role: "user", content: `Review this ${language} file and return the JSON report:\n\n${numbered}` },
    ];

    const result = await getAICompletion(messages, {
        temperature: 0.15,
        jsonMode: true,
        maxTokens: 3500,
        userId: opts.userId,
    });

    if (!result?.content) {
        throw new Error("AI review returned no content");
    }

    const cleaned = result.content.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
    }

    const findings = Array.isArray(parsed.findings)
        ? (parsed.findings as unknown[]).map(coerceFinding).filter((f): f is Finding => f !== null)
        : [];
    const strengths = Array.isArray(parsed.strengths)
        ? (parsed.strengths as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 10)
        : [];
    const qualityScore = typeof parsed.qualityScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.qualityScore)))
        : Math.max(0, 100 - findings.reduce((acc, f) => acc + SEVERITY_RANK[f.severity] * 6, 0));

    return {
        summary: typeof parsed.summary === "string" ? parsed.summary : "AI review completed.",
        qualityScore,
        grade: gradeFromScore(qualityScore),
        riskLevel: riskFromScoreAndSeverity(100 - qualityScore, findings),
        strengths,
        findings,
    };
}

// ---------------------------------------------------------------------------
// Policy gate
// ---------------------------------------------------------------------------

export function maxSeverity(findings: Finding[]): Severity {
    return findings.reduce<Severity>((acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc), "info");
}

export interface GateResult {
    verdict: Verdict;
    blocking: boolean;
    maxSeverity: Severity;
}

export function evaluateGate(findings: Finding[], blockingSeverity: Severity): GateResult {
    if (findings.length === 0) {
        return { verdict: "APPROVED", blocking: false, maxSeverity: "info" };
    }
    const max = maxSeverity(findings);
    const blocking = SEVERITY_RANK[max] >= SEVERITY_RANK[blockingSeverity];
    return {
        verdict: blocking ? "CHANGES_REQUESTED" : "COMMENTED",
        blocking,
        maxSeverity: max,
    };
}

/** Map the rich result back to the legacy shape the existing PR-analysis UI expects. */
export function toLegacyAnalysis(result: ReviewResult) {
    return {
        summary: result.summary,
        impactScore: result.impactScore,
        breakingChanges: result.findings.filter((f) => f.category === "breaking").map((f) => f.title),
        suggestions: result.findings.map((f) => ({ file: f.file, line: f.line ?? 0, comment: f.suggestion || f.detail || f.title })),
        securityIssues: result.findings.filter((f) => f.category === "security").map((f) => f.title),
    };
}

// ---------------------------------------------------------------------------
// GitHub side-effects
// ---------------------------------------------------------------------------

const GH_API = "https://api.github.com";

function ghHeaders(token: string, accept = "application/vnd.github.v3+json") {
    return {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "Content-Type": "application/json",
        "User-Agent": "documint-ai-code-review",
    };
}

/** Load and decrypt a user's stored GitHub token. Returns null if unavailable. */
export async function resolveGitHubToken(userId: string): Promise<string | null> {
    const connection = await db.gitHubConnection.findUnique({
        where: { userId },
        select: { accessToken: true },
    });
    if (!connection?.accessToken) return null;
    try {
        return decrypt(connection.accessToken);
    } catch {
        return null;
    }
}

interface PullMeta {
    title: string;
    headSha: string;
}

async function getPullMeta(owner: string, repo: string, prNumber: number, token: string): Promise<PullMeta> {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/pulls/${prNumber}`, { headers: ghHeaders(token) });
    if (!res.ok) throw new Error(`Failed to load PR metadata (${res.status})`);
    const data = (await res.json()) as { title?: string; head?: { sha?: string } };
    return { title: data.title || `PR #${prNumber}`, headSha: data.head?.sha || "" };
}

async function getPullDiff(owner: string, repo: string, prNumber: number, token: string): Promise<string> {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/pulls/${prNumber}`, {
        headers: ghHeaders(token, "application/vnd.github.v3.diff"),
    });
    if (!res.ok) throw new Error(`Failed to fetch PR diff (${res.status})`);
    return res.text();
}

async function postCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    token: string,
    state: "success" | "failure" | "error",
    description: string,
): Promise<void> {
    if (!sha) return;
    await fetch(`${GH_API}/repos/${owner}/${repo}/statuses/${sha}`, {
        method: "POST",
        headers: ghHeaders(token),
        body: JSON.stringify({ state, context: STATUS_CONTEXT, description: description.slice(0, 140) }),
    }).catch(() => undefined);
}

function renderReviewBody(result: ReviewResult, gate: GateResult): string {
    const icon = gate.blocking ? "🚫" : result.findings.length ? "⚠️" : "✅";
    const lines: string[] = [
        `### ${icon} Documint AI Code Review`,
        "",
        result.summary,
        "",
        `**Impact:** ${result.impactScore}/100 · **Risk:** ${result.riskLevel} · **Findings:** ${result.findings.length}`,
    ];
    if (result.findings.length) {
        lines.push("", "| Severity | Category | File | Finding |", "| --- | --- | --- | --- |");
        for (const f of result.findings.slice(0, 50)) {
            const loc = f.line ? `${f.file}:${f.line}` : f.file;
            lines.push(`| ${f.severity} | ${f.category} | \`${loc}\` | ${f.title.replace(/\|/g, "\\|")} |`);
        }
    }
    lines.push("", "_Automated review — configure rules in your Documint dashboard._");
    return lines.join("\n");
}

async function postPrReview(
    owner: string,
    repo: string,
    prNumber: number,
    token: string,
    result: ReviewResult,
    gate: GateResult,
): Promise<void> {
    const event = gate.blocking ? "REQUEST_CHANGES" : result.findings.length ? "COMMENT" : "APPROVE";
    const body = renderReviewBody(result, gate);
    const url = `${GH_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`;

    const inline = result.findings
        .filter((f) => f.line && f.file && f.file !== "unknown")
        .slice(0, MAX_INLINE_COMMENTS)
        .map((f) => ({
            path: f.file,
            line: f.line as number,
            side: "RIGHT" as const,
            body: `**[${f.severity}/${f.category}] ${f.title}**\n\n${f.detail}${f.suggestion ? `\n\n**Suggestion:** ${f.suggestion}` : ""}`,
        }));

    // Try with inline comments first; if GitHub rejects a line position (422),
    // fall back to a body-only review so the merge gate/summary still lands.
    const attempt = async (withInline: boolean) => {
        const res = await fetch(url, {
            method: "POST",
            headers: ghHeaders(token),
            body: JSON.stringify({ event, body, ...(withInline && inline.length ? { comments: inline } : {}) }),
        });
        return res.ok;
    };

    if (await attempt(inline.length > 0)) return;
    await attempt(false);
}

// ---------------------------------------------------------------------------
// Full automatic pipeline
// ---------------------------------------------------------------------------

export interface RunReviewInput {
    repoFullName: string; // "owner/repo"
    prNumber: number;
    prTitle?: string;
    ownerUserId: string; // whose GitHub token & AI budget to use
    teamId?: string | null;
    source?: "AUTO" | "MANUAL";
    policy?: ReviewPolicyConfig;
}

export interface RunReviewOutput {
    reviewId: string;
    status: "COMPLETED" | "FAILED";
    verdict?: Verdict;
    blocking?: boolean;
    findingCount?: number;
    error?: string;
}

/**
 * End-to-end automatic review: fetch diff → AI review → persist → gate →
 * commit status + PR review → notify + audit. Resilient: never throws, always
 * records a CodeReview row (COMPLETED or FAILED).
 */
export async function runAutomaticReview(input: RunReviewInput): Promise<RunReviewOutput> {
    const [owner, repo] = input.repoFullName.split("/");
    const source = input.source ?? "AUTO";
    const policy = input.policy ?? DEFAULT_REVIEW_POLICY;

    // Create the tracking row up-front so history reflects in-flight reviews.
    const review = await db.codeReview.create({
        data: {
            kind: "PR",
            repoFullName: input.repoFullName,
            prNumber: input.prNumber,
            title: input.prTitle ?? null,
            status: "RUNNING",
            source,
            userId: input.ownerUserId,
            teamId: input.teamId ?? null,
        },
    });

    try {
        if (!owner || !repo) throw new Error(`Invalid repo "${input.repoFullName}"`);

        const token = await resolveGitHubToken(input.ownerUserId);
        if (!token) throw new Error("GitHub token unavailable for review owner");

        const meta = await getPullMeta(owner, repo, input.prNumber, token);
        const diff = await getPullDiff(owner, repo, input.prNumber, token);
        const result = await analyzeDiff(diff, policy, { userId: input.ownerUserId });
        const gate = evaluateGate(result.findings, policy.blockingSeverity);

        await db.codeReview.update({
            where: { id: review.id },
            data: {
                status: "COMPLETED",
                verdict: gate.verdict,
                summary: result.summary,
                impactScore: result.impactScore,
                riskLevel: result.riskLevel,
                findings: result.findings as unknown as object,
                blocking: gate.blocking,
                headSha: meta.headSha,
                title: input.prTitle ?? meta.title,
            },
        });

        // Post the merge gate + review back to GitHub (best-effort).
        if (policy.postStatus) {
            const state = gate.blocking ? "failure" : "success";
            const desc = gate.blocking
                ? `Blocked: ${gate.maxSeverity} issue(s) found`
                : result.findings.length
                    ? `${result.findings.length} suggestion(s), none blocking`
                    : "No issues found";
            await postCommitStatus(owner, repo, meta.headSha, token, state, desc);
        }
        if (policy.postComments) {
            await postPrReview(owner, repo, input.prNumber, token, result, gate);
        }

        // Notify + audit (non-blocking).
        await notifyAndAudit(input, review.id, gate, result, source);

        return {
            reviewId: review.id,
            status: "COMPLETED",
            verdict: gate.verdict,
            blocking: gate.blocking,
            findingCount: result.findings.length,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await db.codeReview.update({
            where: { id: review.id },
            data: { status: "FAILED", error: message },
        }).catch(() => undefined);
        return { reviewId: review.id, status: "FAILED", error: message };
    }
}

async function notifyAndAudit(
    input: RunReviewInput,
    reviewId: string,
    gate: GateResult,
    result: ReviewResult,
    source: "AUTO" | "MANUAL",
): Promise<void> {
    try {
        await logAudit({
            userId: input.ownerUserId,
            action: "AI_CODE_REVIEW",
            entity: "PullRequest",
            entityId: `${input.repoFullName}#${input.prNumber}`,
            severity: gate.blocking ? AuditLogSeverity.WARNING : AuditLogSeverity.INFO,
            details: {
                reviewId,
                source,
                verdict: gate.verdict,
                blocking: gate.blocking,
                impactScore: result.impactScore,
                riskLevel: result.riskLevel,
                findingCount: result.findings.length,
            },
        });
    } catch {
        /* non-blocking */
    }

    if (input.teamId) {
        try {
            const verb = gate.blocking ? "🚫 requested changes on" : result.findings.length ? "commented on" : "✅ approved";
            await sendNotification({
                teamId: input.teamId,
                type: "REVIEW_REQUESTED",
                title: "AI Code Review complete",
                message: `The AI reviewer ${verb} **${input.repoFullName} #${input.prNumber}** — ${result.findings.length} finding(s), risk ${result.riskLevel}.`,
                link: `https://github.com/${input.repoFullName}/pull/${input.prNumber}`,
            });
        } catch {
            /* non-blocking */
        }
    }
}

import { z } from "zod";

const boundedText = (max: number) => z.string().max(max);

export const runtimeLogLineSchema = z.object({
    commandId: boundedText(120),
    command: boundedText(160),
    args: z.array(boundedText(400)).max(40),
    stream: z.enum(["stdout", "stderr"]),
    data: boundedText(8_000),
    timestamp: z.number().int().nonnegative(),
}).strict();

export const runtimeErrorSummarySchema = z.object({
    shouldBeFixed: z.boolean(),
    summary: boundedText(8_000),
    paths: z.array(boundedText(512)).max(50).default([]),
}).strict();

export const runtimeErrorReportSchema = runtimeErrorSummarySchema.extend({
    fingerprint: boundedText(80),
    createdAt: z.number().int().nonnegative(),
}).strict();

export const runtimeCommandEventSchema = z.object({
    id: boundedText(120),
    command: boundedText(160),
    args: z.array(boundedText(400)).max(40),
    status: z.enum(["queued", "running", "done", "error"]),
    exitCode: z.number().int().optional(),
    startedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().optional(),
}).strict();

export const runtimePreviewEventSchema = z.object({
    url: z.string().url(),
    port: z.number().int().positive().optional(),
    timestamp: z.number().int().nonnegative(),
}).strict();

export type RuntimeLogLine = z.infer<typeof runtimeLogLineSchema>;
export type RuntimeErrorSummary = z.infer<typeof runtimeErrorSummarySchema>;
export type RuntimeErrorReport = z.infer<typeof runtimeErrorReportSchema>;
export type RuntimeCommandEvent = z.infer<typeof runtimeCommandEventSchema>;
export type RuntimeCommand = RuntimeCommandEvent;
export type RuntimePreviewEvent = z.infer<typeof runtimePreviewEventSchema>;

const ACTIONABLE_ERROR_PATTERN = /\b(error|failed|failure|exception|enoent|eacces|module not found|cannot find module|cannot resolve|compile|typescript|syntaxerror|referenceerror|typeerror|build failed|missing dependency)\b/i;
const NOISE_PATTERN = /\b(warn|warning|deprecated|funding|audit|new major version|downloaded|compiled successfully|ready in|local:)\b/i;

export function isActionableRuntimeLog(data: string): boolean {
    const normalized = data.trim();
    if (normalized.length < 4) return false;
    if (NOISE_PATTERN.test(normalized) && !ACTIONABLE_ERROR_PATTERN.test(normalized)) return false;
    return ACTIONABLE_ERROR_PATTERN.test(normalized);
}

export function getRuntimeErrorFingerprint(lines: RuntimeLogLine[]): string {
    const source = lines
        .slice(-12)
        .map((line) => `${line.command}:${line.args.join(" ")}:${line.data.slice(0, 300)}`)
        .join("\n");

    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return `err_${(hash >>> 0).toString(16)}`;
}

export function compactRuntimeLines(lines: RuntimeLogLine[], maxLines = 30): RuntimeLogLine[] {
    return lines.slice(-maxLines).map((line) => ({
        ...line,
        data: line.data.length > 8_000 ? `${line.data.slice(0, 8_000)}\n...[truncated]` : line.data,
    }));
}

export function compactRuntimeLogLine(line: RuntimeLogLine): RuntimeLogLine {
    return compactRuntimeLines([line], 1)[0] ?? line;
}

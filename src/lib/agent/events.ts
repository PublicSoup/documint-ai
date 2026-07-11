import { z } from "zod";

const boundedText = (max: number) => z.string().max(max);

export const agentEventSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("session_meta"),
        sessionId: boundedText(64),
        title: boundedText(200),
    }).strict(),
    z.object({ type: z.literal("thought"), content: boundedText(12_000) }).strict(),
    z.object({ type: z.literal("tool_call"), tool: boundedText(120), args: boundedText(8_000) }).strict(),
    z.object({ type: z.literal("tool_result"), result: boundedText(20_000) }).strict(),
    z.object({ type: z.literal("response"), content: boundedText(80_000) }).strict(),
    z.object({ type: z.literal("error"), message: boundedText(8_000) }).strict(),
    z.object({ type: z.literal("file_created"), fileName: boundedText(512), content: boundedText(1_000_000) }).strict(),
    z.object({
        type: z.literal("state_change"),
        state: boundedText(64),
        tool: boundedText(120).optional(),
        timestamp: z.number().int().nonnegative(),
    }).strict(),
    z.object({
        type: z.literal("command_event"),
        commandId: boundedText(120),
        command: boundedText(160),
        args: z.array(boundedText(400)).max(40),
        status: z.enum(["queued", "running", "waiting", "done", "error"]),
        exitCode: z.number().int().optional(),
        timestamp: z.number().int().nonnegative(),
    }).strict(),
    z.object({
        type: z.literal("preview_ready"),
        url: z.string().url(),
        port: z.number().int().positive().optional(),
        timestamp: z.number().int().nonnegative(),
    }).strict(),
    z.object({
        type: z.literal("error_report"),
        summary: boundedText(8_000),
        paths: z.array(boundedText(512)).max(50).optional(),
        timestamp: z.number().int().nonnegative(),
    }).strict(),
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;

export function serializeAgentEvent(event: AgentEvent): string {
    return `${JSON.stringify(agentEventSchema.parse(event))}\n`;
}

export function parseAgentEvent(raw: string): AgentEvent | null {
    try {
        const parsed = agentEventSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

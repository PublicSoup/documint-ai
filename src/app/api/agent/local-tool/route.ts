import { z } from "zod";
import { createApiHandler } from "@/lib/api-utils";
import { AGENT_TOOL_NAMES } from "@/lib/agent/tool-protocol";
import { executeAgentTool } from "@/lib/agent/tool-executor";

/**
 * POST /api/agent/local-tool
 *
 * Executes exactly one agent tool call, on behalf of the authenticated
 * session's own workspace. This is the server-side half of the "Local Model"
 * agent (see lib/local-agent.ts): a model the user runs on their own machine
 * can't read/write the user's files, run sandboxed commands, or hit the DB
 * directly — those all require server-side access — so the browser sends
 * each tool call the local model requests here, one at a time, using exactly
 * the same tool-executor the cloud-model agent uses (engine.ts).
 *
 * `userId` always comes from the session, never the request body — the tool
 * executor scopes every operation to that user, so there is no cross-user
 * access path regardless of what the client sends.
 */

const bodySchema = z.object({
    toolName: z.enum(AGENT_TOOL_NAMES),
    args: z.array(z.string().max(20_000)).max(6),
}).strict();

export const POST = createApiHandler({
    rateLimit: "agent_tool",
    bodySchema,
    cacheControl: "private, no-store",
    handler: async ({ body, userId }) => {
        const { result, fileEvent } = await executeAgentTool({
            userId,
            cwd: process.cwd(),
            toolName: body.toolName,
            args: body.args,
        });
        return { result, fileEvent };
    },
});

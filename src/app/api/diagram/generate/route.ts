import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { createHash } from "node:crypto";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { generateText } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";
import { unstable_cache } from "next/cache";
import { logAudit } from "@/lib/audit-logger";

const DIAGRAM_SYSTEM_PROMPT = `You are a software architect expert in Mermaid.js.
Your task is to analyze code and generate a diagram in Mermaid syntax.
Output ONLY the valid Mermaid code.
IMPORTANT:
1. Do not include markdown backticks, explanations, or labels.
2. Use strict newline separation between class definitions and relationships.
3. Do not put multiple statements on a single line.
4. Use double quotes around node labels.
5. Escape any double quotes inside labels with #quot;.
6. The output starts directly with the diagram type (e.g., classDiagram, sequenceDiagram).`;

const generateDiagramSchema = z.object({
    fileId: z.string().min(1),
    type: z.enum(["class", "sequence", "flowchart", "state", "er"]).default("class"),
}).strict();

const MAX_DIAGRAM_LENGTH = 50_000;

/**
 * Cheap structural sanity check: detect obvious cases where the AI emitted
 * markdown fences, an explanation, or a partial / truncated Mermaid string.
 * If we detect that, we throw so the caller can return a clean placeholder.
 */
function validateMermaidShape(code: string, type: string): void {
    const trimmed = code.trim();
    if (!trimmed) throw new Error("Empty diagram");
    if (trimmed.length > MAX_DIAGRAM_LENGTH) {
        throw new Error(`Diagram too long (${trimmed.length} chars, max ${MAX_DIAGRAM_LENGTH})`);
    }
    if (trimmed.includes("```")) {
        throw new Error("Diagram contains markdown fences");
    }

    // The first non-empty token should match the requested type (case-insensitive).
    const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/^#/, "");
    if (!firstToken) throw new Error("Diagram has no leading directive");

    const expected: Record<string, string[]> = {
        class: ["classdiagram"],
        sequence: ["sequencediagram"],
        flowchart: ["flowchart", "graph"],
        state: ["statediagram", "statediagram-v2"],
        er: ["erdiagram"],
    };
    const allowed = expected[type] ?? [];
    if (!allowed.includes(firstToken)) {
        throw new Error(`Diagram type mismatch: expected one of [${allowed.join(", ")}], got "${firstToken}"`);
    }

    // Bracket balance check — counts (, [, { and their closers.
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    const stack: string[] = [];
    let inString = false;
    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (ch === '"') {
            // Mermaid doesn't really support escaped quotes inside double-quoted
            // labels, so we don't try to skip them — just toggle.
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (pairs[ch]) stack.push(pairs[ch]);
        else if (ch === ")" || ch === "]" || ch === "}") {
            const expectedClose = stack.pop();
            if (expectedClose !== ch) {
                throw new Error(`Unbalanced brackets near offset ${i}`);
            }
        }
    }
    if (stack.length > 0) {
        throw new Error(`Unclosed brackets: ${stack.length}`);
    }
}

/**
 * Normalize and clean AI-generated Mermaid code to ensure rendering reliability.
 */
function normalizeMermaidOutput(code: string, type: z.infer<typeof generateDiagramSchema>["type"]): string {
    let cleanedCode = code.replace(/```mermaid/g, "").replace(/```/g, "").trim();

    // Fix AI-generated "one-line" Mermaid if detected
    if (!cleanedCode.includes("\n")) {
        if (type === "sequence") {
            cleanedCode = cleanedCode
                .replace(/participant /g, "\nparticipant ")
                .replace(/(\w+)\s*-->/g, "\n$1 -->")
                .replace(/(\w+)\s*->/g, "\n$1 ->")
                .replace(/note /g, "\nnote ");
        } else if (type === "er") {
            cleanedCode = cleanedCode
                .replace(/^ERDiagram/i, "erDiagram")
                .replace(/erDiagram/i, "erDiagram\n")
                .replace(/([a-zA-Z0-9_]+) \{/g, "\n$1 {")
                .replace(/\}\s*/g, "}\n");
        } else {
            cleanedCode = cleanedCode
                .replace(/\} class/g, "}\nclass")
                .replace(/\} ([A-Z])/g, "}\n$1")
                .replace(/(\w+)\s*-->/g, "\n$1 -->")
                .replace(/(\w+)\s*\.\./g, "\n$1 ..")
                .replace(/; /g, "\n");
        }
    }

    return cleanedCode;
}

function shortHash(s: string): string {
    return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/**
 * Cache the AI output for a few minutes so the same file + type combo
 * doesn't re-hit Gemini. Cache key is the file id, type, and a content
 * hash so it auto-invalidates when the file changes.
 */
function cachedDiagram(
    fileId: string,
    type: string,
    contentHash: string,
    producer: () => Promise<string>,
): Promise<string> {
    const key = `diagram:${fileId}:${type}:${contentHash}`;
    return unstable_cache(
        async () => producer(),
        [key],
        { revalidate: 300, tags: [`diagram:${fileId}`, `file:${fileId}`] },
    )() as Promise<string>;
}

/**
 * POST /api/diagram/generate
 * Analyzes a file and generates a Mermaid architecture diagram using AI.
 * Pro/Team only.
 */
export async function POST(request: NextRequest) {
    const gateError = await requireFeature("diagramGenerator");
    if (gateError) return gateError;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const { fileId, type } = await validateBody(request, generateDiagramSchema);

        // 2. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "view");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to view this file."));
        }

        // 3. Fetch file metadata
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { name: true, language: true, content: true },
        });
        if (!file) {
            return errorResponse(ApiErrors.notFound("File"));
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return errorResponse(ApiErrors.badRequest("File content is empty — cannot generate a diagram."));
        }

        const isJson = file.language === "json" || file.name.endsWith(".json");

        let specificPrompt = "";
        if (isJson) {
            switch (type) {
                case "er":
                    specificPrompt = "This is a JSON dataset. Create an ER diagram representing entities, attributes, and relationships.";
                    break;
                case "flowchart":
                    specificPrompt = "This is a JSON structure. Create a tree-style flowchart showing hierarchy and key-value nesting.";
                    break;
                default:
                    specificPrompt = "This is a JSON structure. Visualize its schema and hierarchical organization using Mermaid.js.";
                    break;
            }
        } else {
            switch (type) {
                case "sequence":
                    specificPrompt = "Create a sequence diagram showing interactions between classes/functions in this code.";
                    break;
                case "flowchart":
                    specificPrompt = "Create a flowchart diagram showing the logic flow of this code.";
                    break;
                case "state":
                    specificPrompt = "Create a state diagram representing state transitions in this code.";
                    break;
                case "er":
                    specificPrompt = "Create an ER diagram showing data model and relationships in this code.";
                    break;
                case "class":
                default:
                    specificPrompt = "Create a class diagram showing structure and relationships of this code.";
                    break;
            }
        }

        const userPrompt = `${specificPrompt}\n\n${isJson ? "JSON" : "Code"} to analyze:\n\`\`\`${file.language || "text"}\n${content.slice(0, 12000)}\n\`\`\``;

        // 4. Run AI generation (cached for 5 minutes).
        const contentHash = shortHash(content);
        const mermaidCode = await cachedDiagram(fileId, type, contentHash, async () => {
            return await generateText(DIAGRAM_SYSTEM_PROMPT, userPrompt, {
                temperature: 0.2,
                maxTokens: 2500,
                userId: session.user.id,
            });
        });

        if (!mermaidCode?.trim()) {
            return errorResponse(ApiErrors.internalError("Diagram generation failed: No output from AI."));
        }

        const cleanedCode = normalizeMermaidOutput(mermaidCode, type);

        // 5. Validate the cleaned output before returning. This protects the
        //    client renderer from choking on broken AI output.
        try {
            validateMermaidShape(cleanedCode, type);
        } catch (validationError) {
            const message = validationError instanceof Error ? validationError.message : "Invalid diagram";
            return NextResponse.json(
                {
                    error: "DIAGRAM_INVALID",
                    message: `AI produced an invalid Mermaid diagram: ${message}. Please retry.`,
                },
                { status: 502 },
            );
        }

        // 6. Audit Log (non-blocking)
        try {
            await logAudit({
                userId: session.user.id,
                action: "GENERATE_DIAGRAM",
                entity: "File",
                entityId: fileId,
                details: { type, language: file.language, fileName: file.name },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            diagram: cleanedCode,
            type,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
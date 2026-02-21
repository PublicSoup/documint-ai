import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { generateText } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const DIAGRAM_SYSTEM_PROMPT = `You are a software architect expert in Mermaid.js.
Your task is to analyze code and generate a diagram in Mermaid syntax.
Output ONLY the valid Mermaid code.
IMPORTANT:
1. Do not include markdown backticks, explanations, or labels.
2. Use strict newline separation between class definitions and relationships.
3. Do not put multiple statements on a single line.
The output starts directly with the diagram type (e.g., classDiagram, sequenceDiagram).`;

const generateDiagramSchema = z.object({
    fileId: z.string().min(1),
    type: z.enum(["class", "sequence", "flowchart", "state", "er"]).default("class"),
}).strict();

function normalizeMermaidOutput(code: string, type: z.infer<typeof generateDiagramSchema>["type"]): string {
    let cleanedCode = code.replace(/```mermaid/g, "").replace(/```/g, "").trim();

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

export async function POST(request: NextRequest) {
    const gateResponse = await requireFeature("diagramGenerator");
    if (gateResponse) return gateResponse;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(session.user.id, "api");

        const parsed = generateDiagramSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileId, type } = parsed.data;

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { name: true, language: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return NextResponse.json({ error: "File content not found" }, { status: 404 });
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

        const mermaidCode = await generateText(DIAGRAM_SYSTEM_PROMPT, userPrompt, {
            temperature: 0.2,
            maxTokens: 2500,
        });

        if (!mermaidCode.trim()) {
            return NextResponse.json({ error: "Diagram generation failed" }, { status: 500 });
        }

        const cleanedCode = normalizeMermaidOutput(mermaidCode, type);

        try {
            const { logAudit } = await import("@/lib/audit-logger");
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
        console.error("Diagram generation failed:", error);
        return NextResponse.json({ error: "Failed to generate diagram" }, { status: 500 });
    }
}

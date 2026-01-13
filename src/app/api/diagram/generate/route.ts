import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { generateText } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";

const DIAGRAM_SYSTEM_PROMPT = `You are a software architect expert in Mermaid.js.
Your task is to analyze code and generate a diagram in Mermaid syntax.
Output ONLY the valid Mermaid code.
IMPORTANT:
1. Do not include markdown backticks, explanations, or labels.
2. Use strict newline separation between class definitions and relationships.
3. Do not put multiple statements on a single line.
The output starts directly with the diagram type (e.g., classDiagram, sequenceDiagram).`;

export async function POST(request: NextRequest) {
    // 1. Check feature access
    const gateResponse = await requireFeature("diagramGenerator");
    if (gateResponse) return gateResponse;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { fileId, type = "class" } = await request.json();

        if (!fileId) {
            return NextResponse.json({ error: "fileId is required" }, { status: 400 });
        }

        // 2. Fetch file content
        const file = await db.file.findUnique({
            where: { id: fileId, userId: session.user.id },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return NextResponse.json({ error: "File content not found" }, { status: 404 });
        }

        const isJson = file.language === "json" || file.name.endsWith(".json");

        // 3. Generate Diagram
        let specificPrompt = "";

        if (isJson) {
            switch (type) {
                case "er":
                    specificPrompt = "This is a JSON dataset. Create an ER diagram representing the data entities, their attributes, and relationships.";
                    break;
                case "flowchart":
                    specificPrompt = "This is a JSON structure. Create a tree-style flowchart showing the hierarchy and key-value nesting.";
                    break;
                default:
                    specificPrompt = "This is a JSON structure. Create a clear visualization of its schema and hierarchical organization using Mermaid.js.";
                    break;
            }
        } else {
            switch (type) {
                case "sequence":
                    specificPrompt = "Create a sequence diagram showing the interactions between classes/functions in this code.";
                    break;
                case "flowchart":
                    specificPrompt = "Create a flowchart diagram showing the logic flow of this code.";
                    break;
                case "state":
                    specificPrompt = "Create a state diagram representing the state transitions in this code.";
                    break;
                case "er":
                    specificPrompt = "Create an ER diagram showing the data model and relationships in this code.";
                    break;
                case "class":
                default:
                    specificPrompt = "Create a class diagram showing the structure and relationships of this code.";
                    break;
            }
        }

        const userPrompt = `${specificPrompt}\n\n${isJson ? "JSON" : "Code"} to analyze:\n\`\`\`${file.language}\n${content}\n\`\`\``;

        const mermaidCode = await generateText(DIAGRAM_SYSTEM_PROMPT, userPrompt);

        // Clean up output if AI was chatty (remove backticks if present)
        let cleanedCode = mermaidCode.replace(/```mermaid/g, "").replace(/```/g, "").trim();

        // Fix: If single line output (common issue), try to insert newlines
        // Fix: If single line output (common issue), try to insert newlines
        if (!cleanedCode.includes('\n')) {
            if (type === 'sequence') {
                cleanedCode = cleanedCode
                    .replace(/participant /g, "\nparticipant ")
                    .replace(/(\w+)\s*->/g, "\n$1 ->")
                    .replace(/(\w+)\s*-->/g, "\n$1 -->")
                    .replace(/(\w+)\s*-\w+>/g, "\n$1 ->") // Catch-all for other arrows
                    .replace(/note /g, "\nnote ");
            } else if (type === 'er') {
                cleanedCode = cleanedCode
                    .replace(/^ERDiagram/i, "erDiagram")
                    .replace(/erDiagram/i, "erDiagram\n")
                    .replace(/([a-zA-Z0-9_]+) \{/g, "\n$1 {")
                    .replace(/\}\s*/g, "}\n")
                    .replace(/\s([a-zA-Z0-9_]+)\s+([\}|o\+\{\.\-]+[-.]{2,}[|o\+\{\.\-]+)/g, "\n$1 $2")
                    .replace(/\s([a-zA-Z0-9_]+)\s+([-.]+[|o\+\{\.\-]+)/g, "\n$1 $2");
            } else {
                cleanedCode = cleanedCode
                    .replace(/\} class/g, "}\nclass")
                    .replace(/\} ([A-Z])/g, "}\n$1")
                    .replace(/(\w+)\s*-->/g, "\n$1 -->")
                    .replace(/(\w+)\s*\.\./g, "\n$1 ..")
                    .replace(/; /g, "\n");
            }
        }

        // 4. Log to Audit
        await db.auditLog.create({
            data: {
                userId: session.user.id,
                action: "GENERATE_DIAGRAM",
                entity: "File",
                entityId: fileId,
                details: { type },
            },
        });

        return NextResponse.json({
            diagram: cleanedCode,
            type
        });

    } catch (error) {
        console.error("Diagram generation failed:", error);
        return NextResponse.json({ error: "Failed to generate diagram" }, { status: 500 });
    }
}

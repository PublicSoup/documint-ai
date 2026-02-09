import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { getFileContent } from "@/lib/files";
import { getAICompletion } from "@/lib/ai";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: fileId } = await params;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get the file
        const file = await db.file.findUnique({
            where: { id: fileId, userId: session.user.id },
        }) as any;

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return NextResponse.json({ error: "File content not found" }, { status: 404 });
        }

        const prompt = `You are an expert code documentation assistant.

Analyze this ${file.language} code and generate comprehensive documentation.

Return a JSON object with this exact structure:
{
    "summary": "A concise 2-3 sentence description of what this file does",
    "entities": [
        {
            "type": "function|class|complex_logic",
            "name": "entity name",
            "code": "the actual code snippet",
            "doc": "detailed documentation for this entity",
            "startLine": 1,
            "endLine": 10
        }
    ]
}

Be thorough but concise. Focus on explaining the PURPOSE and HOW the code works.

CODE:
\`\`\`${file.language}
${content}
\`\`\`

JSON Response:`;

        // Call centralized Gemini service
        const aiResult = await getAICompletion([
            { role: "system", content: "You are a code documentation expert. Respond only with valid JSON." },
            { role: "user", content: prompt }
        ], {
            temperature: 0.1,
            maxTokens: 4096,
            jsonMode: true
        });

        if (!aiResult) {
            return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
        }

        const responseContent = aiResult.content || "";

        // Parse the JSON from the response
        let docContent;
        try {
            // Try to extract JSON from markdown code blocks if present
            const jsonMatch = responseContent.match(/```json\n?([\s\S]*?)\n?```/) ||
                responseContent.match(/```\n?([\s\S]*?)\n?```/);
            const jsonStr = jsonMatch ? jsonMatch[1] : responseContent;
            docContent = JSON.parse(jsonStr.trim());
        } catch {
            // If parsing fails, create a basic structure
            docContent = {
                summary: responseContent.slice(0, 500),
                entities: []
            };
        }

        // Update the documentation in the database
        await db.documentation.upsert({
            where: { fileId },
            update: { content: JSON.stringify(docContent) },
            create: { fileId, content: JSON.stringify(docContent) },
        });

        return NextResponse.json({ content: docContent });
    } catch (error) {
        console.error("Regenerate error:", error);
        return NextResponse.json(
            { error: "Failed to regenerate documentation" },
            { status: 500 }
        );
    }
}

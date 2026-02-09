import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../lib/db";
import { getFileContent } from "@/lib/files";
import { getAICompletion } from "@/lib/ai";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await req.json();

    if (!fileId) {
        return NextResponse.json({ error: "File ID is required" }, { status: 400 });
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

    const prompt = `You are a Code Archaeologist. Your job is to analyze this ${file.language} file like an archaeological dig site.
    
    PERFORM A DEEP HISTORICAL & "STRATIGRAPHIC" ANALYSIS:

    1. **Era Identification**: Detect the "age" of the code based on patterns (e.g., "Pre-ES6 JavaScript (c. 2014)", "Python 2.7 era", "Modern Rust 2021"). 
    2. **Fossil Hunt**: Identify "fossils" - deprecated methods, dead code, commented-out blocks, or "magic numbers" that have lost their meaning.
    3. **Stratigraphy**: Identify mixed styles (e.g., "jQuery mixed with React" or "Async/Await mixed with Callbacks") showing how the code evolved.
    4. **Refactoring Roadmap**: Provide 3 concrete steps to modernize this specific artifact.

    Code to Excavate:
    \`\`\`${file.language}
    ${content.substring(0, 5000)}
    \`\`\`

    Return your report in JSON format with these exact keys:
    {
        "era": "string (e.g. 'Late 2010s TypeScript')",
        "fossils": ["string", "string"],
        "stratigraphy": "string (description of mixed styles)",
        "techDebtScore": number (1-100, where 100 is pristine, 1 is ancient spaghetti),
        "refactoringPlan": ["step 1", "step 2", "step 3"]
    }
    
    IMPORTANT: Return ONLY the JSON object. No markdown formatting.`;

    try {
        const aiResult = await getAICompletion([
            { role: "system", content: "You are a specialized code analysis tool that outputs strict JSON." },
            { role: "user", content: prompt }
        ], {
            temperature: 0.3,
            jsonMode: true
        });

        if (!aiResult) {
            throw new Error("AI excavation failed");
        }

        const archaeologyReport = JSON.parse(aiResult.content);

        return NextResponse.json(archaeologyReport);

    } catch (error) {
        console.error("Archaeology error:", error);
        return NextResponse.json({
            error: "Excavation failed",
            details: "Could not analyze code history."
        }, { status: 500 });
    }
}

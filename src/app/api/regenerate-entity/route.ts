import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAICompletion } from "@/lib/ai";

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { code, language, type, name } = await request.json();

        if (!code || !language) {
            return NextResponse.json({ error: "Missing code or language" }, { status: 400 });
        }

        let prompt = "";
        if (type === "function") {
            prompt = `Generate comprehensive documentation for this ${language} function named "${name}".

Include:
- What the function does (purpose)
- Parameters and their types
- Return value
- Any important notes or edge cases

Be concise but thorough.

\`\`\`${language}
${code}
\`\`\`

Documentation:`;
        } else if (type === "class") {
            prompt = `Generate comprehensive documentation for this ${language} class named "${name}".

Include:
- Class purpose and responsibility
- Key methods overview
- How to instantiate and use

Be concise but thorough.

\`\`\`${language}
${code}
\`\`\`

Documentation:`;
        } else {
            prompt = `Explain this ${language} code block clearly and concisely.

Focus on:
- What the code accomplishes
- Why it uses this particular approach  
- Any important edge cases or assumptions

\`\`\`${language}
${code}
\`\`\`

Explanation:`;
        }

        // Call centralized Gemini service
        const aiResult = await getAICompletion([
            { role: "system", content: "You are a code documentation expert. Write clear, helpful documentation." },
            { role: "user", content: prompt }
        ], {
            temperature: 0.1,
            maxTokens: 1024
        });

        if (!aiResult) {
            return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
        }

        const doc = aiResult.content || "Unable to generate documentation.";

        return NextResponse.json({ doc });
    } catch (error) {
        console.error("Regenerate entity error:", error);
        return NextResponse.json(
            { error: "Failed to regenerate entity documentation" },
            { status: 500 }
        );
    }
}

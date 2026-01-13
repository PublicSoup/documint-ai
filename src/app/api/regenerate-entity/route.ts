import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

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

        // Call LM Studio to regenerate entity documentation
        const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234";

        // Get model name
        let modelName = "qwen2.5-coder-7b-instruct";
        try {
            const modelsRes = await fetch(`${LM_STUDIO_URL}/v1/models`);
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                if (modelsData.data && modelsData.data.length > 0) {
                    modelName = modelsData.data[0].id;
                }
            }
        } catch {
            // Use default model name
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

        const aiRes = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: "system", content: "You are a code documentation expert. Write clear, helpful documentation." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 1024
            }),
        });

        if (!aiRes.ok) {
            return NextResponse.json({ error: "LM Studio error" }, { status: 500 });
        }

        const aiData = await aiRes.json();
        const doc = aiData.choices?.[0]?.message?.content || "Unable to generate documentation.";

        return NextResponse.json({ doc });
    } catch (error) {
        console.error("Regenerate entity error:", error);
        return NextResponse.json(
            { error: "Failed to regenerate entity documentation" },
            { status: 500 }
        );
    }
}

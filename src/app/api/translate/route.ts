import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAICompletion } from "@/lib/ai";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { text, targetLang } = await req.json();

        if (!text || !targetLang) {
            return NextResponse.json({ error: "Missing text or target language" }, { status: 400 });
        }

        const systemPrompt = `You are a professional technical translator.
Translate the following technical documentation into ${targetLang}.
Preserve all Markdown formatting, code blocks, and technical terms (variable names, function names) that should not be translated.
Output ONLY the translated markdown.`;

        // Call centralized Gemini service
        const aiResult = await getAICompletion([
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ], {
            temperature: 0.1
        });

        if (!aiResult) throw new Error("AI translation failed");

        const translatedText = aiResult.content;

        return NextResponse.json({ translatedText });

    } catch (error) {
        console.error("Translation Error:", error);
        return NextResponse.json({ error: "Translation failed" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234";

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

        // Fetch Model
        let modelName = "qwen2.5-coder-7b-instruct";
        try {
            const modelsRes = await fetch(`${LM_STUDIO_URL}/v1/models`);
            const mData = await modelsRes.json();
            if (mData.data?.[0]?.id) modelName = mData.data[0].id;
        } catch { }

        const aiRes = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                temperature: 0.1
            })
        });

        if (!aiRes.ok) throw new Error("AI translation failed");

        const aiData = await aiRes.json();
        const translatedText = aiData.choices[0].message.content;

        return NextResponse.json({ translatedText });

    } catch (error) {
        console.error("Translation Error:", error);
        return NextResponse.json({ error: "Translation failed" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { rateLimit, rateLimitResponse } from "../../../../../lib/rate-limit";
import { getAICompletion } from "@/lib/ai";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate Limit: Check if user is Pro
    // ideally check subscription status, defaulting to 'api' (60/min) or 'pro' if needed
    // For now, let's use 'pro' for this premium feature if allowed, or stricter 'free'.
    // Let's assume standard 'api' limit for now to be safe.
    const result = await rateLimit(session.user.id, "api");

    if (result && !result.success) {
        return rateLimitResponse(result.remaining, result.reset);
    }

    const { owner, repo, pullNumber } = await req.json();

    if (!owner || !repo || !pullNumber) {
        return NextResponse.json({ error: "owner, repo, and pullNumber are required" }, { status: 400 });
    }

    try {
        // 1. Get GitHub Token from DB (More secure than client-side)
        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id }
        });

        if (!connection?.accessToken) {
            return NextResponse.json({ error: "GitHub account not connected" }, { status: 401 });
        }

        // 2. Fetch PR diff
        const diffUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`;
        const diffRes = await fetch(diffUrl, {
            headers: {
                Authorization: `Bearer ${connection.accessToken}`,
                Accept: "application/vnd.github.v3.diff",
            }
        });

        if (!diffRes.ok) {
            const error = await diffRes.json();
            return NextResponse.json({ error: error.message || "Failed to fetch PR diff" }, { status: diffRes.status });
        }

        const diffRaw = await diffRes.text();
        const diffTruncated = diffRaw.substring(0, 15000); // 15k char limit for context

        // 3. AI Analysis - Using centralized Gemini service
        const systemPrompt = `You are a Senior Technical Lead reviewing a Pull Request.
Output STRICT JSON only. No markdown fences. No preamble.
Format:
{
  "summary": "Concise 2-sentence summary of changes",
  "impactScore": number (0-100, where 100 is critical/high impact),
  "breakingChanges": ["List of potential breaking changes" or empty],
  "suggestions": [
     { "file": "filename", "line": number, "comment": "Actionable suggestion" }
  ],
  "securityIssues": ["Potential security risks" or empty]
}`;

        const userPrompt = `Analyze this git diff:
${diffTruncated}

Provide the structured JSON report.`;

        const aiResult = await getAICompletion([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ], {
            temperature: 0.2,
            jsonMode: true,
            maxTokens: 2000
        });

        if (!aiResult) throw new Error("AI analysis failed");

        let content = aiResult.content || "{}";

        // Clean markdown if present
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();

        let analysis;
        try {
            analysis = JSON.parse(content);
        } catch (e) {
            console.error("Failed to parse AI JSON:", content);
            // Fallback object
            analysis = {
                summary: "AI analysis generation failed to parse.",
                impactScore: 0,
                breakingChanges: [],
                suggestions: [],
                securityIssues: []
            };
        }

        return NextResponse.json({
            owner,
            repo,
            pullNumber,
            analysis
        });

    } catch (error) {
        console.error("PR analysis error:", error);
        return NextResponse.json({ error: "Failed to analyze pull request" }, { status: 500 });
    }
}

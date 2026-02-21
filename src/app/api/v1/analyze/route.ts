import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIP, validateApiKey } from "@/lib/rate-limit";
import { getAICompletion } from "@/lib/ai";
import { z } from "zod";

const analyzeSchema = z.object({
    code: z.string().min(1, "Code is required"),
    language: z.string().optional(),
    filename: z.string().optional()
});

// Public API endpoint for external integrations
export async function POST(req: Request) {
    try {
        // Get API key from header
        const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");

        if (!apiKey) {
            return NextResponse.json({
                error: "Missing API key",
                message: "Provide your API key via X-API-Key header or Authorization: Bearer <key>"
            }, { status: 401 });
        }

        // Validate API key
        const userId = await validateApiKey(apiKey);
        if (!userId) {
            // Audit Logging
            try {
                const { logAudit } = await import("@/lib/audit-logger");
                await logAudit({
                    action: "API_AUTH_FAILURE",
                    entity: "ApiKey",
                    entityId: "REDACTED",
                    details: { keyPreview: apiKey.substring(0, 4) + "..." }
                });
            } catch (e) {}

            return NextResponse.json({
                error: "Invalid API key",
                message: "The provided API key is not valid"
            }, { status: 401 });
        }

        // Rate limiting (using API tier for external requests)
        const rateLimitResult = await rateLimit(apiKey, "api");
        if (!rateLimitResult || !rateLimitResult.success) {
            const remaining = rateLimitResult?.remaining ?? 0;
            const reset = rateLimitResult?.reset ?? Date.now() + 60000;
            return NextResponse.json({
                error: "Rate limit exceeded",
                remaining,
                resetAt: new Date(reset).toISOString()
            }, {
                status: 429,
                headers: {
                    "X-RateLimit-Remaining": remaining.toString(),
                    "X-RateLimit-Reset": reset.toString()
                }
            });
        }

        // Parse request body
        const body = await req.json();
        const { code, language, filename } = analyzeSchema.parse(body);

        // Audit Logging - API Use
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: userId,
                action: "API_ANALYZE",
                entity: "PublicApi",
                entityId: filename || "unnamed",
                details: { method: "v1-analyze", language }
            });
        } catch (e) {}

        // Detect language if not provided
        const detectedLanguage = language || detectLanguage(filename || "", code);

        // Call centralized Gemini service
        const prompt = `Analyze this ${detectedLanguage} code and provide:
1. A brief summary (2-3 sentences)
2. List of functions/classes with their purpose
3. Any security concerns
4. Code quality score (0-100)

Code:
\`\`\`${detectedLanguage}
${code}
\`\`\`

Respond in JSON format:
{
  "summary": "...",
  "entities": [{"name": "...", "type": "function|class", "purpose": "..."}],
  "securityIssues": ["..."],
  "qualityScore": 0-100
}`;

        const aiResult = await getAICompletion([
            { role: "user", content: prompt }
        ], {
            temperature: 0.3,
            maxTokens: 2000,
            jsonMode: true
        });

        if (!aiResult) {
            return NextResponse.json({
                error: "AI service unavailable",
                message: "Gemini analysis failed"
            }, { status: 503 });
        }

        const responseText = aiResult.content || "";

        // Try to parse JSON from response
        let analysis;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: responseText };
        } catch {
            analysis = { summary: responseText };
        }

        return NextResponse.json({
            success: true,
            language: detectedLanguage,
            analysis,
            usage: {
                remaining: rateLimitResult?.remaining ?? 0,
                resetAt: new Date(rateLimitResult?.reset ?? Date.now()).toISOString()
            }
        }, {
            headers: {
                "X-RateLimit-Remaining": (rateLimitResult?.remaining ?? 0).toString()
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({
                error: "Validation failed",
                details: error.issues
            }, { status: 400 });
        }
        console.error("Public API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

function detectLanguage(filename: string, code: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const extMap: Record<string, string> = {
        py: "python",
        js: "javascript",
        ts: "typescript",
        tsx: "typescript",
        jsx: "javascript",
        go: "go",
        rs: "rust",
        java: "java",
        cs: "csharp",
        rb: "ruby",
        php: "php",
        swift: "swift",
        kt: "kotlin",
        c: "c",
        cpp: "cpp",
        h: "c"
    };

    if (ext && extMap[ext]) return extMap[ext];

    // Heuristic detection
    if (code.includes("def ") && code.includes(":")) return "python";
    if (code.includes("func ") && code.includes("package ")) return "go";
    if (code.includes("fn ") && code.includes("let ")) return "rust";
    if (code.includes("function") || code.includes("=>")) return "javascript";

    return "unknown";
}

// GET - API documentation
export async function GET() {
    return NextResponse.json({
        name: "DocuMint Public API",
        version: "1.0.0",
        endpoints: {
            "POST /api/v1/analyze": {
                description: "Analyze code and generate documentation",
                headers: {
                    "X-API-Key": "Your API key (required)",
                    "Content-Type": "application/json"
                },
                body: {
                    code: "string (required) - The source code to analyze",
                    language: "string (optional) - Programming language",
                    filename: "string (optional) - Filename for language detection"
                },
                response: {
                    success: "boolean",
                    language: "detected language",
                    analysis: {
                        summary: "Brief description",
                        entities: "Array of functions/classes",
                        securityIssues: "Array of concerns",
                        qualityScore: "0-100"
                    }
                }
            }
        },
        rateLimit: "100 requests per minute",
        example: {
            curl: `curl -X POST https://your-domain.com/api/v1/analyze \\
  -H "X-API-Key: dk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"code": "def hello(): pass", "language": "python"}'`
        }
    });
}

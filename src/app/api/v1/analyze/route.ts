import { NextResponse } from "next/server";
import { z } from "zod";
import { getAICompletion } from "@/lib/ai";
import { rateLimit, validateApiKey, getClientIP } from "@/lib/rate-limit";

const analyzeSchema = z
    .object({
        code: z.string().trim().min(1, "Code is required").max(200_000),
        language: z.string().trim().min(1).max(64).optional(),
        filename: z.string().trim().min(1).max(255).optional(),
    })
    .strict();

interface AnalyzeResponse {
    summary?: string;
    entities?: Array<{ name?: string; type?: string; purpose?: string }>;
    securityIssues?: string[];
    qualityScore?: number;
}

function extractApiKey(request: Request): string | null {
    const direct = request.headers.get("x-api-key")?.trim();
    if (direct) {
        return direct;
    }

    const authorization = request.headers.get("authorization")?.trim();
    if (!authorization) {
        return null;
    }

    const bearerPrefix = "bearer ";
    if (!authorization.toLowerCase().startsWith(bearerPrefix)) {
        return null;
    }

    const token = authorization.slice(bearerPrefix.length).trim();
    return token.length > 0 ? token : null;
}

function parseAiPayload(content: string): AnalyzeResponse {
    const trimmed = content.trim();

    try {
        return JSON.parse(trimmed) as AnalyzeResponse;
    } catch {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]) as AnalyzeResponse;
            } catch {
                return { summary: trimmed };
            }
        }

        return { summary: trimmed };
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
        h: "c",
    };

    if (ext && extMap[ext]) return extMap[ext];

    if (code.includes("def ") && code.includes(":")) return "python";
    if (code.includes("func ") && code.includes("package ")) return "go";
    if (code.includes("fn ") && code.includes("let ")) return "rust";
    if (code.includes("function") || code.includes("=>")) return "javascript";

    return "unknown";
}

function toResetDate(resetEpochSeconds: number): string {
    return new Date(resetEpochSeconds * 1000).toISOString();
}

// Public API endpoint for external integrations
export async function POST(request: Request) {
    try {
        const apiKey = extractApiKey(request);
        if (!apiKey) {
            return NextResponse.json(
                {
                    error: "Missing API key",
                    message: "Provide your API key via X-API-Key header or Authorization: Bearer <key>",
                },
                { status: 401 },
            );
        }

        const userId = await validateApiKey(apiKey);
        if (!userId) {
            try {
                const { logAudit } = await import("@/lib/audit-logger");
                const ip = await getClientIP(request);
                await logAudit({
                    action: "API_AUTH_FAILURE",
                    entity: "ApiKey",
                    entityId: "REDACTED",
                    details: {
                        keyPreview: `${apiKey.substring(0, 4)}...`,
                        ip,
                    },
                });
            } catch {
                // Keep auth failure response deterministic even if audit persistence fails.
            }

            return NextResponse.json(
                {
                    error: "Invalid API key",
                    message: "The provided API key is not valid",
                },
                { status: 401 },
            );
        }

        const limiterIdentifier = `v1-user:${userId}`;
        const limitResult = await rateLimit(limiterIdentifier, "api");
        if (!limitResult || !limitResult.success) {
            const remaining = limitResult?.remaining ?? 0;
            const reset = limitResult?.reset ?? Math.ceil(Date.now() / 1000) + 60;

            return NextResponse.json(
                {
                    error: "Rate limit exceeded",
                    remaining,
                    resetAt: toResetDate(reset),
                },
                {
                    status: 429,
                    headers: {
                        "X-RateLimit-Remaining": remaining.toString(),
                        "X-RateLimit-Reset": reset.toString(),
                    },
                },
            );
        }

        const rawBody: unknown = await request.json().catch(() => null);
        const parsedBody = analyzeSchema.safeParse(rawBody);
        if (!parsedBody.success) {
            return NextResponse.json(
                {
                    error: "Validation failed",
                    message: parsedBody.error.issues[0]?.message || "Invalid request payload",
                    details: parsedBody.error.issues,
                },
                { status: 400 },
            );
        }

        const { code, language, filename } = parsedBody.data;

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            const ip = await getClientIP(request);
            await logAudit({
                userId,
                action: "API_ANALYZE",
                entity: "PublicApi",
                entityId: filename || "unnamed",
                details: {
                    method: "v1-analyze",
                    requestedLanguage: language ?? null,
                    ip,
                },
            });
        } catch {
            // Non-blocking audit logging.
        }

        const detectedLanguage = language || detectLanguage(filename || "", code);

        const prompt = [
            `Analyze this ${detectedLanguage} code and provide:`,
            "1. A brief summary (2-3 sentences)",
            "2. List of functions/classes with their purpose",
            "3. Any security concerns",
            "4. Code quality score (0-100)",
            "",
            "Code:",
            `\`\`\`${detectedLanguage}`,
            code,
            "\`\`\`",
            "",
            "Respond in JSON format:",
            "{",
            '  "summary": "...",',
            '  "entities": [{"name": "...", "type": "function|class", "purpose": "..."}],',
            '  "securityIssues": ["..."],',
            '  "qualityScore": 0-100',
            "}",
        ].join("\n");

        const aiResult = await getAICompletion(
            [{ role: "user", content: prompt }],
            {
                temperature: 0.3,
                maxTokens: 2_000,
                jsonMode: true,
            },
        );

        if (!aiResult?.content) {
            return NextResponse.json(
                {
                    error: "AI service unavailable",
                    message: "Gemini analysis failed",
                },
                { status: 503 },
            );
        }

        const analysis = parseAiPayload(aiResult.content);

        return NextResponse.json(
            {
                success: true,
                language: detectedLanguage,
                analysis,
                usage: {
                    remaining: limitResult.remaining,
                    resetAt: toResetDate(limitResult.reset),
                },
            },
            {
                headers: {
                    "X-RateLimit-Remaining": limitResult.remaining.toString(),
                    "X-RateLimit-Reset": limitResult.reset.toString(),
                },
            },
        );
    } catch {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
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
                    "Content-Type": "application/json",
                },
                body: {
                    code: "string (required) - The source code to analyze",
                    language: "string (optional) - Programming language",
                    filename: "string (optional) - Filename for language detection",
                },
                response: {
                    success: "boolean",
                    language: "detected language",
                    analysis: {
                        summary: "Brief description",
                        entities: "Array of functions/classes",
                        securityIssues: "Array of concerns",
                        qualityScore: "0-100",
                    },
                },
            },
        },
        rateLimit: "300 requests per minute",
        example: {
            curl: `curl -X POST https://your-domain.com/api/v1/analyze \\\n  -H "X-API-Key: dk_your_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d '{"code": "def hello(): pass", "language": "python"}'`,
        },
    });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { getAICompletion } from "@/lib/ai";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const aiDebtResponseSchema = z.object({
    summary: z.string().trim().min(1),
    hotspots: z.array(z.object({
        name: z.string().trim().min(1),
        priority: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
        reason: z.string().trim().min(1),
    }).strict()).max(3),
}).strict();

interface DebtContext {
    totalFiles: number;
    undocumentedCount: number;
    staleCount: number;
    topUndocumented: Array<{ name: string; size: number; lang: string }>;
    topStale: Array<{ name: string; updated: string }>;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const files = await db.file.findMany({
            where: { teamId },
            include: {
                documentation: {
                    select: { status: true },
                },
            },
            orderBy: { size: "desc" },
        });

        if (files.length === 0) {
            return NextResponse.json({ summary: "No files found in project.", hotspots: [] });
        }

        const undocumentedFiles = files.filter((file) => !file.documentation).slice(0, 15);
        const staleFiles = files.filter((file) => file.documentation?.status === "DRAFT").slice(0, 10);

        const projectContext: DebtContext = {
            totalFiles: files.length,
            undocumentedCount: files.filter((file) => !file.documentation).length,
            staleCount: files.filter((file) => file.documentation?.status === "DRAFT").length,
            topUndocumented: undocumentedFiles.map((file) => ({
                name: file.name,
                size: file.size,
                lang: file.language,
            })),
            topStale: staleFiles.map((file) => ({
                name: file.name,
                updated: file.updatedAt.toISOString(),
            })),
        };

        const prompt = `As a technical architect, analyze this documentation debt report:\n${JSON.stringify(projectContext)}\n\nIdentify the 3 most critical Documentation Hotspots where missing or stale docs pose the highest risk (prioritize large files and core components). Then provide a concise 2-sentence executive summary.\n\nRespond in JSON:\n{\n  "summary": "...",\n  "hotspots": [\n    { "name": "filename", "priority": "CRITICAL|HIGH|MEDIUM", "reason": "why this is a risk" }\n  ]\n}`;

        const aiResult = await getAICompletion(
            [
                { role: "system", content: "You are a Documentation Strategy Agent. Respond only in strict JSON." },
                { role: "user", content: prompt },
            ],
            { temperature: 0.2, jsonMode: true },
        );

        if (!aiResult?.content) {
            return NextResponse.json({
                summary: "Documentation debt analysis is currently unavailable. Please try again shortly.",
                hotspots: [],
            });
        }

        let parsedContent: unknown;
        try {
            parsedContent = JSON.parse(aiResult.content);
        } catch {
            return NextResponse.json({
                summary: "We identified documentation hotspots, but the AI response format was invalid.",
                hotspots: [],
            });
        }

        const parsedAiResponse = aiDebtResponseSchema.safeParse(parsedContent);
        if (!parsedAiResponse.success) {
            return NextResponse.json({
                summary: "We identified documentation hotspots, but the AI response format was invalid.",
                hotspots: [],
            });
        }

        return NextResponse.json(parsedAiResponse.data);
    } catch (error) {
        console.error("[DocDebt_API] Error:", error);
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
}

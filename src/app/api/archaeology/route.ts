import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { getAICompletion } from "@/lib/ai";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const archaeologySchema = z.object({
    fileId: z.string().min(1),
}).strict();

const archaeologyReportSchema = z.object({
    era: z.string().min(1),
    fossils: z.array(z.string()).default([]),
    stratigraphy: z.string().min(1),
    techDebtScore: z.number().int().min(1).max(100),
    refactoringPlan: z.array(z.string()).min(1).max(10),
}).strict();

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = archaeologySchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "File ID is required" }, { status: 400 });
        }

        const { fileId } = parsed.data;

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { name: true, language: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return NextResponse.json({ error: "File content not found" }, { status: 404 });
        }

        const prompt = `You are a Code Archaeologist. Analyze this ${file.language || "code"} file like an archaeological dig site.

PERFORM A DEEP HISTORICAL & STRATIGRAPHIC ANALYSIS:
1. Era Identification
2. Fossil Hunt (deprecated/dead code/magic numbers)
3. Stratigraphy (mixed styles)
4. Refactoring Roadmap (3 concrete modernization steps)

Code to analyze:
\`\`\`${file.language || "text"}
${content.slice(0, 6000)}
\`\`\`

Return ONLY valid JSON with this exact shape:
{
  "era": "Late 2010s TypeScript",
  "fossils": ["..."],
  "stratigraphy": "...",
  "techDebtScore": 78,
  "refactoringPlan": ["step 1", "step 2", "step 3"]
}`;

        const aiResult = await getAICompletion(
            [
                { role: "system", content: "You are a code analysis tool that outputs strict JSON only." },
                { role: "user", content: prompt },
            ],
            {
                temperature: 0.3,
                maxTokens: 1600,
                jsonMode: true,
            }
        );

        if (!aiResult?.content) {
            return NextResponse.json({ error: "Excavation failed" }, { status: 500 });
        }

        const parsedReport = archaeologyReportSchema.safeParse(JSON.parse(aiResult.content));
        if (!parsedReport.success) {
            return NextResponse.json(
                { error: "Failed to validate archaeology report", details: parsedReport.error.flatten() },
                { status: 500 }
            );
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "RUN_ARCHAEOLOGY_ANALYSIS",
                entity: "File",
                entityId: fileId,
                details: {
                    fileName: file.name,
                    language: file.language,
                    techDebtScore: parsedReport.data.techDebtScore,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json(parsedReport.data);
    } catch (error) {
        console.error("Archaeology error:", error);
        return NextResponse.json(
            { error: "Excavation failed", details: "Could not analyze code history." },
            { status: 500 }
        );
    }
}

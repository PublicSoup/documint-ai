import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { getAICompletion } from "@/lib/ai";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

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

/**
 * POST /api/archaeology
 * Performs a "code archaeology" analysis to identify historical debt, 
 * coding styles, and a modernization roadmap.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const { fileId } = await validateBody(req, archaeologySchema);

        // 2. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "view");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to analyze this file."));
        }

        // 3. Fetch file details
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { name: true, language: true },
        });

        if (!file) {
            return errorResponse(ApiErrors.notFound("File"));
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return errorResponse(ApiErrors.notFound("File content"));
        }

        // 4. Run AI Analysis
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
            return errorResponse(ApiErrors.internalError("Excavation failed: No response from AI."));
        }

        let rawReport;
        try {
            rawReport = JSON.parse(aiResult.content);
        } catch (e) {
            return errorResponse(ApiErrors.internalError("Excavation failed: AI returned invalid JSON."));
        }

        const parsedReport = archaeologyReportSchema.safeParse(rawReport);
        if (!parsedReport.success) {
            return errorResponse(ApiErrors.internalError("Excavation failed: Analysis schema validation failed."));
        }

        // 5. Audit Log
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
        return errorResponse(error);
    }
}

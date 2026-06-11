import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveUserId } from "@/lib/resolve-user";
import { parseCode, CodeEntity } from "@/lib/parsing/tree-sitter";
import { analyzeCodeQuality } from "@/lib/parsing/code-quality";
import { generateDocumentation } from "@/lib/ai";
import { uploadFile } from "@/lib/supabase/storage";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { checkTeamPermission } from "@/lib/permissions";
import {
    detectLanguageFromPath,
    isTextSourcePath,
    normalizeProjectPath,
    safeStorageKeyForProjectPath,
} from "@/lib/project-files";

const analyzeSchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

const MAX_FILES_PER_REQUEST = 20;

/**
 * POST /api/analyze
 * Processes uploaded files, performs deep code analysis, generates AI documentation,
 * and stores results in the database and cloud storage.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        const userId = await resolveUserId(session);
        if (!userId) {
            return errorResponse(ApiErrors.notFound("User profile"));
        }

        // 1. Enforce Rate Limit: Tier-based upload limits
        await enforceRateLimit(userId, "upload");

        const formData = await req.formData();
        const fileEntries = formData.getAll("files");
        const files = fileEntries.filter((entry): entry is File => entry instanceof File);

        if (fileEntries.length !== files.length) {
            return errorResponse(ApiErrors.badRequest("Invalid file payload"));
        }

        if (files.length === 0) {
            return errorResponse(ApiErrors.badRequest("No files uploaded"));
        }

        if (files.length > MAX_FILES_PER_REQUEST) {
            return errorResponse(ApiErrors.badRequest(`Too many files. Max ${MAX_FILES_PER_REQUEST} files per request.`));
        }

        const parsedAnalyze = analyzeSchema.safeParse({
            teamId: formData.get("teamId")?.toString() || undefined,
        });

        if (!parsedAnalyze.success) {
            return errorResponse(ApiErrors.badRequest("Invalid team ID"));
        }

        const { teamId } = parsedAnalyze.data;

        // 2. Check Plan Limits
        const { canUploadFile } = await import("@/lib/subscription");
        const limitCheck = await canUploadFile(userId);
        if (!limitCheck.allowed) {
            return errorResponse(
                ApiErrors.forbidden(limitCheck.reason || "Upload limit reached. Upgrade required.")
            );
        }

        // 3. Verify Team Access if applicable
        if (teamId) {
            const hasPermission = await checkTeamPermission(userId, teamId, "edit");
            if (!hasPermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to upload files to this team."));
            }
        }

        const results = [];
        let styleGuide = "";

        if (teamId) {
            const teamConfig = await db.integration.findFirst({
                where: { teamId, type: "TEAM_CONFIG" }
            });
            const config = (teamConfig?.config as { styleGuide?: string } | null) || {};
            styleGuide = config.styleGuide || "";
        }

        for (const file of files) {
            const rawName = file.name;
            const name = normalizeProjectPath(rawName);
            if (!name || !isTextSourcePath(name)) {
                results.push({
                    fileId: "error",
                    name: rawName,
                    qualityScore: 0,
                    securityInsights: ["Unsupported or unsafe project path"],
                    status: "error",
                });
                continue;
            }

            const extension = name.split(".").pop()?.toLowerCase() || "";

            try {
                const content = await file.text();
                if (!content) {
                    throw new Error("File content is empty");
                }

                // 4. Parse code and analyze quality
                let entities: CodeEntity[] = [];
                let parseWarning: string | null = null;
                try {
                    entities = await parseCode(content, extension);
                } catch (parsingError: unknown) {
                    parseWarning = parsingError instanceof Error
                        ? parsingError.message
                        : "Parser failed with unknown error";
                }

                const analysisResult = analyzeCodeQuality(content, entities, extension);

                // 5. Cloud Storage Persistance
                const storagePath = safeStorageKeyForProjectPath(userId, name);
                const uploadedPath = await uploadFile(storagePath, content);

                if (!uploadedPath) {
                    throw new Error("Storage upload failed");
                }

                // 6. DB File and Documentation creation in a transaction
                const result = await db.$transaction(async (tx: Omit<Prisma.TransactionClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => {
                    const dbFile = await tx.file.create({
                        data: {
                            name,
                            storagePath: uploadedPath,
                            language: detectLanguageFromPath(name) || extension,
                            size: file.size,
                            userId: userId,
                            teamId: teamId || null,
                        }
                    });

                    // Documentation Generation (Limited entities for stability)
                    const limitedEntities = entities.slice(0, 10);
                    const entityDocs = [];

                    for (const entity of limitedEntities) {
                        try {
                            const doc = await generateDocumentation(
                                entity.code, 
                                extension, 
                                entity.type as 'file' | 'function' | 'class' | 'complex_logic', 
                                styleGuide
                            );
                            entityDocs.push({ ...entity, doc });
                        } catch {
                            entityDocs.push({ ...entity, doc: "Documentation pending..." });
                        }
                    }

                    const fileSummary = await generateDocumentation(content.substring(0, 3000), extension, "file", styleGuide)
                        .catch(() => "Summary generation pending.");

                    const documentationContent = JSON.stringify({
                        summary: fileSummary,
                        entities: entityDocs,
                        qualityScore: analysisResult.qualityScore,
                        securityInsights: analysisResult.securityInsights,
                        metadata: {
                            linesOfCode: content.split("\n").length,
                            functions: entities.filter(e => e.type === "function").length,
                            classes: entities.filter(e => e.type === "class").length,
                            analyzedAt: new Date().toISOString(),
                            ...analysisResult
                        }
                    });

                    const docRecord = await tx.documentation.create({
                        data: {
                            fileId: dbFile.id,
                            content: documentationContent,
                            metadata: analysisResult as unknown as Prisma.InputJsonValue
                        }
                    });

                    await tx.docVersion.create({
                        data: {
                            documentationId: docRecord.id,
                            content: documentationContent,
                            version: 1,
                            message: "Initial analysis and generation",
                            createdById: userId
                        }
                    });

                    return { dbFile, docRecord };
                });

                // 7. Audit Log
                try {
                    const { logAudit } = await import("@/lib/audit-logger");
                    await logAudit({
                        action: "ANALYZE",
                        entity: "Documentation",
                        entityId: result.docRecord.id,
                        userId: userId,
                        details: {
                            fileId: result.dbFile.id,
                            fileName: name,
                            score: analysisResult.qualityScore,
                            parseWarning,
                        }
                    });
                } catch {
                    // Non-blocking
                }

                results.push({
                    fileId: result.dbFile.id,
                    name,
                    qualityScore: analysisResult.qualityScore,
                    securityInsights: parseWarning
                        ? [...analysisResult.securityInsights, `Parser warning: ${parseWarning}`]
                        : analysisResult.securityInsights,
                    complexity: analysisResult.complexityMetrics,
                    dependencies: analysisResult.dependencies,
                    status: "success"
                });

            } catch (fileError: unknown) {
                const message = fileError instanceof Error ? fileError.message : "Internal processing error";
                results.push({
                    fileId: "error",
                    name,
                    qualityScore: 0,
                    securityInsights: [message],
                    status: "error"
                });
            }
        }

        return NextResponse.json({
            message: "Analysis complete",
            results,
            summary: {
                filesAnalyzed: results.length,
                successCount: results.filter(r => r.status === "success").length,
                averageScore: results.length > 0
                    ? Math.round(results.reduce((a, b) => a + (b.qualityScore || 0), 0) / results.length)
                    : 0
            }
        });
    } catch (error) {
        return errorResponse(error);
    }
}

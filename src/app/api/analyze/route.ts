import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveUserId } from "@/lib/resolve-user";
import { parseCode, CodeEntity } from "@/lib/parsing/tree-sitter";
import { analyzeCodeQuality } from "@/lib/parsing/code-quality";
import { generateDocumentation } from "@/lib/ai";
import { uploadFile } from "@/lib/supabase/storage";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const files = formData.getAll("files") as unknown as File[];
        const teamId = formData.get("teamId") as string | null;

        const userId = await resolveUserId(session);

        if (!userId) {
            console.error("Analysis: User not found in DB for session", session.user.email);
            return NextResponse.json({ message: "User not found in database" }, { status: 404 });
        }

        // Check plan limits
        const { canUploadFile } = await import("@/lib/subscription");
        const limitCheck = await canUploadFile(userId);
        if (!limitCheck.allowed) {
            return NextResponse.json({
                message: limitCheck.reason || "Upload limit reached",
                error: "LIMIT_REACHED",
                upgradeUrl: "/dashboard/billing"
            }, { status: 403 });
        }

        if (teamId) {
            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: {
                        teamId,
                        userId: userId
                    }
                }
            });
            if (!membership) {
                return NextResponse.json({ message: "Access denied to this team" }, { status: 403 });
            }
        }

        if (!files.length) {
            return NextResponse.json({ message: "No files uploaded" }, { status: 400 });
        }

        const results = [];

        for (const file of files) {
            const name = file.name;
            const extension = name.split(".").pop()?.toLowerCase() || "";

            try {
                const content = await file.text();
                if (!content) {
                    throw new Error("File content is empty");
                }

                // Parse code
                let entities: CodeEntity[] = [];
                try {
                    entities = await parseCode(content, extension);
                } catch (e) {
                    console.warn(`Parsing failed for ${name}:`, e);
                }

                // Advanced analysis
                const analysisResult = analyzeCodeQuality(content, entities, extension);

                // Upload to Supabase Storage
                const storagePath = `${userId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                const uploadedPath = await uploadFile(storagePath, content);

                if (!uploadedPath) {
                    throw new Error("Storage upload failed");
                }

                // Save file record
                const dbFile = await db.file.create({
                    data: {
                        name,
                        storagePath: uploadedPath,
                        language: extension,
                        size: file.size,
                        userId: userId,
                        teamId: teamId || null,
                    }
                });

                // Generate Documentation Sequentially to avoid overloading local LLMs
                const limitedEntities = entities.slice(0, 10);
                const entityDocs = [];

                for (const entity of limitedEntities) {
                    try {
                        // Add a small delay for local LLM stability
                        await new Promise(r => setTimeout(r, 200));
                        const doc = await generateDocumentation(entity.code, extension, entity.type as any);
                        entityDocs.push({ ...entity, doc });
                    } catch (err) {
                        console.warn(`Doc gen failed for entity ${entity.name}`, err);
                        entityDocs.push({ ...entity, doc: "Documentation generation pending..." });
                    }
                }

                const fileSummary = await generateDocumentation(content.substring(0, 3000), extension, "file")
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
                        ...analysisResult // Include full analysis metrics
                    }
                });

                await db.documentation.create({
                    data: {
                        fileId: dbFile.id,
                        content: documentationContent,
                        metadata: analysisResult as any
                    }
                });

                results.push({
                    fileId: dbFile.id,
                    name,
                    qualityScore: analysisResult.qualityScore,
                    securityInsights: analysisResult.securityInsights,
                    complexity: analysisResult.complexityMetrics,
                    dependencies: analysisResult.dependencies,
                    status: "success"
                });

            } catch (fileError: any) {
                console.error(`Error processing file ${name}:`, fileError);
                results.push({
                    fileId: "error",
                    name,
                    qualityScore: 0,
                    securityInsights: [fileError.message || "Internal processing error"],
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
        console.error("Analysis error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}


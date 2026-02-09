import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { resolveUserId } from "../../../../lib/resolve-user";
import { parseCode } from "../../../../lib/parsing/tree-sitter";
import { generateDocumentation } from "../../../../lib/ai";
import { uploadFile } from "../../../../lib/supabase/storage";

const SUPPORTED_EXTENSIONS = ["py", "js", "ts", "tsx", "jsx", "go", "rs", "java", "cs", "cpp", "c", "rb", "php"];

// Import files from a GitHub repository
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo, branch = "main", path = "" } = await req.json();

    if (!owner || !repo) {
        return NextResponse.json({ error: "Owner and repo are required" }, { status: 400 });
    }

    const githubToken = req.headers.get("x-github-token");
    const headers: HeadersInit = {
        Accept: "application/vnd.github.v3+json",
    };
    if (githubToken) {
        headers.Authorization = `Bearer ${githubToken}`;
    }

    try {
        // Resolve database user ID
        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Get repository contents
        const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const contentsRes = await fetch(contentsUrl, { headers });

        if (!contentsRes.ok) {
            const error = await contentsRes.json();
            return NextResponse.json({ error: error.message || "Failed to fetch repo contents" }, { status: contentsRes.status });
        }

        const contents = await contentsRes.json();
        const files = Array.isArray(contents) ? contents : [contents];

        // Filter and process code files
        const codeFiles = files.filter((file: any) => {
            if (file.type !== "file") return false;
            const ext = file.name.split(".").pop()?.toLowerCase();
            return ext && SUPPORTED_EXTENSIONS.includes(ext);
        });

        const results = [];
        const maxFiles = 10; // Limit for free tier

        for (let i = 0; i < Math.min(codeFiles.length, maxFiles); i++) {
            const file = codeFiles[i];

            try {
                // Fetch file content
                const fileRes = await fetch(file.download_url);
                const content = await fileRes.text();
                const extension = file.name.split(".").pop() || "";

                // Upload to Supabase Storage
                const storagePath = `${userId}/${Date.now()}-${file.name}`;
                await uploadFile(storagePath, content);

                // Save to database
                // @ts-ignore
                const dbFile = await db.file.create({
                    data: {
                        name: file.name,
                        storagePath,
                        language: extension,
                        size: content.length,
                        userId: userId,
                    },
                });

                // Parse and document
                let entities: any[] = [];
                try {
                    entities = await parseCode(content, extension);
                } catch (e) {
                    console.warn(`Parsing failed for ${file.name}`);
                }

                // Generate documentation
                let analysisResult = null;
                try {
                    // Enterprise Quality Check
                    const { analyzeCodeQuality } = await import("../../../../lib/parsing/code-quality");
                    // @ts-ignore
                    analysisResult = analyzeCodeQuality(content, entities, extension);
                } catch (e) {
                    console.warn(`Quality analysis failed for ${file.name}`);
                }

                const docPromises = entities.map((entity: any) =>
                    generateDocumentation(entity.code, extension, entity.type)
                        .then((doc: string) => ({ ...entity, doc }))
                );
                const entityDocs = await Promise.all(docPromises);
                const fileSummary = await generateDocumentation(content.substring(0, 2000), extension, "file");

                await db.documentation.create({
                    data: {
                        fileId: dbFile.id,
                        content: JSON.stringify({
                            summary: fileSummary,
                            entities: entityDocs,
                            metadata: {
                                source: "github",
                                repo: `${owner}/${repo}`,
                                path: file.path,
                            },
                            // Store enterprise analysis in metadata
                            quality: analysisResult
                        }),
                    },
                });

                results.push({
                    name: file.name,
                    status: "success",
                    fileId: dbFile.id,
                    // Return analysis for UI
                    qualityScore: analysisResult?.qualityScore || 0,
                    securityInsights: analysisResult?.securityInsights,
                    architectureViolations: analysisResult?.architectureViolations,
                    performanceBottlenecks: analysisResult?.performanceBottlenecks
                });
            } catch (err) {
                console.error(`Failed to process ${file.name}:`, err);
                results.push({ name: file.name, status: "error" });
            }
        }

        return NextResponse.json({
            message: "Import complete",
            results,
            totalFiles: codeFiles.length,
            imported: results.filter(r => r.status === "success").length,
            skipped: codeFiles.length - Math.min(codeFiles.length, maxFiles),
        });
    } catch (error) {
        console.error("GitHub import error:", error);
        return NextResponse.json({ error: "Failed to import repository" }, { status: 500 });
    }
}

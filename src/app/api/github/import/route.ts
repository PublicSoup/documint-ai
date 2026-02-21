import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { resolveUserId } from "../../../../lib/resolve-user";
import { parseCode } from "../../../../lib/parsing/tree-sitter";
import { generateDocumentation } from "../../../../lib/ai";
import { uploadFile } from "../../../../lib/supabase/storage";
import { PLANS_CONFIG } from "../../../../config/plans";

const SUPPORTED_EXTENSIONS = ["py", "js", "ts", "tsx", "jsx", "go", "rs", "java", "cs", "cpp", "c", "rb", "php"];

// Helper to create stream
function iteratorToStream(iterator: AsyncGenerator<Uint8Array, void, unknown>) {
    return new ReadableStream({
        async pull(controller) {
            const { value, done } = await iterator.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
    });
}

const encoder = new TextEncoder();

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

    // Resolve user and plan
    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const user = await db.user.findUnique({
        where: { id: userId },
        select: {
            subscription: {
                select: { plan: true }
            }
        }
    });

    // Determine limit based on plan
    const planId = user?.subscription?.plan || "free";
    // @ts-ignore
    const maxFiles = PLANS_CONFIG[planId]?.limit || 10;

    async function* makeIterator() {
        try {
            yield encoder.encode(JSON.stringify({ status: "initializing", message: "Connecting to GitHub..." }) + "\n");

            // Get repository contents
            const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
            const contentsRes = await fetch(contentsUrl, { headers });

            if (!contentsRes.ok) {
                const error = await contentsRes.json();
                yield encoder.encode(JSON.stringify({ error: error.message || "Failed to fetch repo contents" }) + "\n");
                return;
            }

            const contents = await contentsRes.json();
            const files = Array.isArray(contents) ? contents : [contents];

            // Filter code files
            const codeFiles = files.filter((file: { type: string; name: string; download_url: string; path: string }) => {
                if (file.type !== "file") return false;
                const ext = file.name.split(".").pop()?.toLowerCase();
                return ext && SUPPORTED_EXTENSIONS.includes(ext);
            });

            yield encoder.encode(JSON.stringify({
                status: "found_files",
                total: codeFiles.length,
                max: maxFiles,
                message: `Found ${codeFiles.length} files. Importing max ${maxFiles}...`
            }) + "\n");

            let successfulImports = 0;
            const limit = Math.min(codeFiles.length, maxFiles);

            for (let i = 0; i < limit; i++) {
                const file = codeFiles[i];
                yield encoder.encode(JSON.stringify({
                    status: "processing",
                    current: i + 1,
                    total: limit,
                    file: file.name
                }) + "\n");

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
                    interface CodeEntity {
                        type: 'file' | 'function' | 'class' | 'complex_logic';
                        name: string;
                        code: string;
                    }
                    let entities: CodeEntity[] = [];
                    try {
                        entities = await parseCode(content, extension) as CodeEntity[];
                    } catch (e) {
                        console.warn(`Parsing failed for ${file.name}`);
                    }

                    // Generate documentation
                    let analysisResult = null;
                    try {
                        const { analyzeCodeQuality } = await import("../../../../lib/parsing/code-quality");
                        // @ts-ignore
                        analysisResult = analyzeCodeQuality(content, entities, extension);
                    } catch (e) { }

                    const docPromises = entities.map((entity: CodeEntity) =>
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
                                quality: analysisResult
                            }),
                        },
                    });

                    successfulImports++;
                    yield encoder.encode(JSON.stringify({
                        status: "file_complete",
                        file: file.name,
                        imported: successfulImports
                    }) + "\n");

                } catch (err) {
                    console.error(`Failed to process ${file.name}:`, err);
                    yield encoder.encode(JSON.stringify({ status: "file_error", file: file.name, error: "Failed to process" }) + "\n");
                }
            }

            // Audit Logging
            try {
                const { logAudit } = await import("../../../../lib/audit-logger");
                await logAudit({
                    userId: userId,
                    action: "GITHUB_IMPORT",
                    entity: "Repository",
                    entityId: `${owner}/${repo}`,
                    details: { 
                        owner, 
                        repo, 
                        branch, 
                        importedCount: successfulImports,
                        totalRequested: limit
                    }
                });
            } catch (e) {}

            yield encoder.encode(JSON.stringify({ status: "complete", imported: successfulImports, total: limit }) + "\n");

        } catch (error) {
            console.error("GitHub import error:", error);
            yield encoder.encode(JSON.stringify({ error: "Internal server error during import" }) + "\n");
        }
    }

    const stream = iteratorToStream(makeIterator());

    return new NextResponse(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}

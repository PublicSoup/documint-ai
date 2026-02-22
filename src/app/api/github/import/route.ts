import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { resolveUserId } from "../../../../lib/resolve-user";
import { parseCode, CodeEntity } from "../../../../lib/parsing/tree-sitter";
import { generateDocumentation } from "../../../../lib/ai";
import { uploadFile } from "../../../../lib/supabase/storage";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "../../../../lib/api-utils";
import { getUserSubscription } from "../../../../lib/subscription";
import { decrypt } from "../../../../lib/security/encryption";

const SUPPORTED_EXTENSIONS = ["py", "js", "ts", "tsx", "jsx", "go", "rs", "java", "cs", "cpp", "c", "rb", "php"];

const githubImportSchema = z.object({
    owner: z.string().trim().min(1).max(100),
    repo: z.string().trim().min(1).max(100),
    branch: z.string().trim().max(100).default("main"),
    path: z.string().trim().max(1024).default(""),
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

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

/**
 * POST /api/github/import
 * Imports multiple files from a GitHub repository, analyzes them, and stores results.
 * Returns a text/event-stream of progress updates.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "upload");

        const body = await validateBody(req, githubImportSchema);
        const { owner, repo, branch, path, teamId } = body;

        const userId = await resolveUserId(session);
        if (!userId) return errorResponse(ApiErrors.notFound("User"));

        // Fetch GitHub Connection and decrypt token
        const connection = await db.gitHubConnection.findUnique({
            where: { userId }
        });

        if (!connection || !connection.accessToken) {
            return errorResponse(ApiErrors.badRequest("GitHub account not connected."));
        }

        let decryptedToken: string;
        try {
            decryptedToken = decrypt(connection.accessToken);
        } catch (e) {
            console.error("Token decryption failed:", e);
            return errorResponse(ApiErrors.internalError("Failed to access GitHub credentials."));
        }

        const headers: HeadersInit = {
            Accept: "application/vnd.github.v3+json",
            Authorization: `Bearer ${decryptedToken}`,
        };

        // 2. Verify Team Access if applicable
        if (teamId) {
            const { checkTeamPermission } = await import("@/lib/permissions");
            const hasPermission = await checkTeamPermission(userId, teamId, "edit");
            if (!hasPermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to import to this team."));
            }
        }

        const subscription = await getUserSubscription(userId);
        const maxFiles = subscription.limits.filesPerMonth === -1 ? 100 : Math.min(subscription.limits.filesPerMonth, 100);

        async function* makeIterator() {
            try {
                yield encoder.encode(JSON.stringify({ status: "initializing", message: "Connecting to GitHub..." }) + "\n");

                // Get repository contents
                const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
                const contentsRes = await fetch(contentsUrl, { headers });

                if (!contentsRes.ok) {
                    const error = await contentsRes.json().catch(() => ({ message: "Failed to fetch repo contents" }));
                    yield encoder.encode(JSON.stringify({ error: error.message || "Failed to fetch repo contents" }) + "\n");
                    return;
                }

                const contents = await contentsRes.json();
                const files = Array.isArray(contents) ? contents : [contents];

                // Filter code files
                const codeFiles = files.filter((file: any) => {
                    if (file.type !== "file") return false;
                    const ext = file.name.split(".").pop()?.toLowerCase();
                    return ext && SUPPORTED_EXTENSIONS.includes(ext);
                });

                yield encoder.encode(JSON.stringify({
                    status: "found_files",
                    total: codeFiles.length,
                    max: maxFiles,
                    message: `Found ${codeFiles.length} files. Importing up to ${maxFiles}...`
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
                        const fileRes = await fetch(file.download_url, { headers });
                        const content = await fileRes.text();
                        const extension = file.name.split(".").pop() || "";

                        const storagePath = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                        await uploadFile(storagePath, content);

                        const dbFile = await db.file.create({
                            data: {
                                name: file.name,
                                storagePath,
                                language: extension,
                                size: content.length,
                                userId: userId,
                                teamId: teamId || null,
                            },
                        });

                        let entities: CodeEntity[] = [];
                        try {
                            entities = await parseCode(content, extension);
                        } catch (e) {
                            console.warn(`Parsing failed for ${file.name}`);
                        }

                        let analysisResult = null;
                        try {
                            const { analyzeCodeQuality } = await import("../../../../lib/parsing/code-quality");
                            analysisResult = analyzeCodeQuality(content, entities, extension);
                        } catch (e) { }

                        let styleGuide = "";
                        if (teamId) {
                            const teamConfig = await db.integration.findFirst({
                                where: { teamId, type: "TEAM_CONFIG" }
                            });
                            styleGuide = (teamConfig?.config as { styleGuide?: string } | null)?.styleGuide || "";
                        }

                        const docPromises = entities.slice(0, 10).map((entity: CodeEntity) =>
                            generateDocumentation(entity.code, extension, entity.type, styleGuide)
                                .then((doc: string) => ({ ...entity, doc }))
                        );
                        const entityDocs = await Promise.all(docPromises);
                        const fileSummary = await generateDocumentation(content.substring(0, 2000), extension, "file", styleGuide);

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
                                metadata: analysisResult as any
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
                            totalRequested: limit,
                            teamId: teamId || null
                        }
                    });
                } catch (e) {}

                yield encoder.encode(JSON.stringify({ status: "complete", imported: successfulImports, total: limit }) + "\n");

            } catch (error) {
                console.error("GitHub import stream error:", error);
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
    } catch (error) {
        return errorResponse(error);
    }
}

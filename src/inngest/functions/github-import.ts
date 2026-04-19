import { inngest } from "../client";
import { db } from "@/lib/db";
import { parseCode } from "@/lib/parsing/tree-sitter";
import { generateDocumentation } from "@/lib/ai";
import { uploadFile } from "@/lib/supabase/storage";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit-logger";

const SUPPORTED_EXTENSIONS = ["py", "js", "ts", "tsx", "jsx", "go", "rs", "java", "cs", "cpp", "c", "rb", "php"];

function isSupportedCodeFile(file: any): boolean {
    if (file.type !== "file" || !file.download_url) return false;
    const ext = file.name.split(".").pop()?.toLowerCase();
    return Boolean(ext && SUPPORTED_EXTENSIONS.includes(ext));
}

export const githubImportFunction = inngest.createFunction(
    { id: "github-repo-import", retries: 3 },
    { event: "github.repo.import" },
    // @ts-ignore
    async ({ event, step }: any) => {
        const { owner, repo, branch, path, teamId, userId, token, maxFiles } = event.data;

        // 1. Fetch Repository Contents
        const filesToImport = await step.run("fetch-repo-contents", async () => {
            const headers = {
                Accept: "application/vnd.github.v3+json",
                Authorization: `Bearer ${token}`,
            };
            const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
            const res = await fetch(contentsUrl, { headers });
            
            if (!res.ok) throw new Error("Failed to fetch repository contents.");
            
            const contents = await res.json();
            const files = Array.isArray(contents) ? contents : [contents];
            return files.filter(isSupportedCodeFile).slice(0, maxFiles);
        });

        // 2. Process Files Sequentially (can be parallelized using Promise.all in step.run if preferred)
        let successfulImports = 0;
        
        for (const file of filesToImport) {
            await step.run(`process-file-${file.path.replace(/\//g, "-")}`, async () => {
                const headers = { Authorization: `Bearer ${token}` };
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

                let entities: any[] = [];
                try {
                    entities = await parseCode(content, extension);
                } catch { }

                let styleGuide = "";
                if (teamId) {
                    const teamConfig = await db.integration.findFirst({
                        where: { teamId, type: "TEAM_CONFIG" }
                    });
                    styleGuide = (teamConfig?.config as any)?.styleGuide || "";
                }

                // AI Processing is now perfectly isolated in the step - no timeout limits!
                const docPromises = entities.slice(0, 10).map((entity: any) =>
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
                        }),
                        metadata: Prisma.JsonNull,
                    },
                });
            });
            successfulImports++;
        }

        // 3. Final Logging
        await step.run("log-audit", async () => {
             await logAudit({
                userId,
                action: "GITHUB_IMPORT_COMPLETE",
                entity: "Repository",
                entityId: `${owner}/${repo}`,
                details: { importedCount: successfulImports }
            });
        });

        return { importedFiles: successfulImports };
    }
);

"use server";

import { buildProjectGraph } from "@/lib/graph/project-graph";
import { projectGraphToMermaid } from "@/lib/graph/mermaid-adapter";
import path from "path";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getProjectGraphMermaid(teamId?: string) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return null;

        const whereClause: any = { userId: session.user.id };
        if (teamId) {
            // If teamId provided, Verify membership
            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: {
                        teamId,
                        userId: session.user.id
                    }
                }
            });
            if (membership) {
                whereClause.teamId = teamId;
                delete whereClause.userId; // Scope to team only
            }
        }

        // Fetch files from DB
        const files = await db.file.findMany({
            where: whereClause,
            select: {
                name: true,
                content: true,
                language: true
            }
        });

        if (files.length === 0) return null;

        // Transform for graph builder
        const graphFiles = files.map(f => ({
            path: f.name, // using name as path for now
            content: f.content || ""
        }));

        const graph = await buildProjectGraph(graphFiles);
        return projectGraphToMermaid(graph);
    } catch (error) {
        console.error("Failed to generate project graph:", error);
        return "flowchart TD\n    Error[Error generating graph]:::error";
    }
}

export async function createDemoProject(teamId?: string) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return { success: false, error: "Not authenticated" };

        const userId = session.user.id;
        const demoFiles = [
            {
                name: "src/Refactor.ts",
                content: `import { Auth } from './Auth';\n\nexport class RefactorEngine {\n  constructor(private auth: Auth) {}\n\n  public analyze(code: string) {\n    if (!this.auth.isAuthenticated()) throw new Error("Unauthorized");\n    return "Optimized Code";\n  }\n}`,
                language: "TypeScript"
            },
            {
                name: "src/Auth.ts",
                content: `export class Auth {\n  private user: any;\n  public isAuthenticated(): boolean {\n    return !!this.user;\n  }\n  public login() { this.user = { id: 1 }; }\n}`,
                language: "TypeScript"
            },
            {
                name: "src/Utils.ts",
                content: `export const formatDate = (date: Date) => date.toISOString();\nexport const log = (msg: string) => console.log(\`[LOG]: \${msg}\`);`,
                language: "TypeScript"
            }
        ];

        for (const file of demoFiles) {
            await db.file.create({
                data: {
                    name: file.name,
                    content: file.content,
                    language: file.language,
                    size: file.content.length,
                    userId: userId,
                    teamId: teamId || null
                }
            });
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to create demo project:", error);
        return { success: false, error: "Failed to create demo" };
    }
}

"use server";

import { buildProjectGraph } from "@/lib/graph/project-graph";
import { projectGraphToMermaid } from "@/lib/graph/mermaid-adapter";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";

export async function getProjectGraphMermaid(teamId?: string) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return null;

        const whereClause: Prisma.FileWhereInput = { userId: session.user.id };
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
                storagePath: true,
                content: true,
                language: true
            }
        });

        if (files.length === 0) return null;

        // Transform for graph builder
        const graphFiles = files.map(f => ({
            path: f.storagePath || f.name,
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

function calculateFileRisk(name: string, content: string, imports: string[]): number {
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    const lines = content.split('\n').length;
    const controlKeywords = (cleanContent.match(/\b(if|else|switch|case|for|while|try|catch|map|filter|reduce)\b/g) || []).length;

    const slocFactor = Math.min((lines / 800) * 25, 25);
    const dependencyFactor = Math.min((imports.length / 25) * 25, 25);
    const densityFactor = Math.min((controlKeywords / 30) * 30, 30);
    
    // Simple heuristic for exports without full parsing
    const exportsCount = (cleanContent.match(/\bexport\b/g) || []).length;
    const encapsulationFactor = exportsCount === 0 ? 20 : Math.max(0, 20 - (exportsCount * 2));

    return Math.min(Math.round(slocFactor + dependencyFactor + densityFactor + encapsulationFactor), 100);
}

interface PriorityAction {
    id: string;
    type: "MISSING_DOCS" | "DRIFT";
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    label: string;
    fileId: string;
    fileName: string;
    riskScore: number;
}

interface PriorityHotspot {
    id: string;
    name: string;
    riskScore: number;
    isDocumented: boolean;
}

const getCachedPriorityActions = unstable_cache(
    async (userId: string, teamId: string | null): Promise<{ actions: PriorityAction[]; hotspots: PriorityHotspot[] }> => {
        const whereClause: Prisma.FileWhereInput = teamId
            ? { teamId }
            : { userId, teamId: null };

        const files = await db.file.findMany({
            where: whereClause,
            include: {
                documentation: {
                    select: { status: true, updatedAt: true }
                }
            },
            orderBy: { updatedAt: "desc" },
            take: 100
        });

        const actions: PriorityAction[] = [];
        const hotspots: PriorityHotspot[] = [];
        const DRIFT_BUFFER_MS = 300000;

        for (const file of files) {
            const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
            const imports: string[] = [];
            let match: RegExpExecArray | null;
            const content = file.content || "";

            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }

            const riskScore = calculateFileRisk(file.name, content, imports);

            if (!file.documentation) {
                actions.push({
                    id: file.id,
                    type: "MISSING_DOCS",
                    priority: riskScore > 70 ? "CRITICAL" : riskScore > 40 ? "HIGH" : "MEDIUM",
                    label: `Documentation missing for ${file.name}`,
                    fileId: file.id,
                    fileName: file.name,
                    riskScore,
                });
            } else {
                const fileUpdated = new Date(file.updatedAt).getTime();
                const docUpdated = new Date(file.documentation.updatedAt).getTime();

                if (fileUpdated > docUpdated + DRIFT_BUFFER_MS) {
                    actions.push({
                        id: file.id,
                        type: "DRIFT",
                        priority: riskScore > 60 ? "CRITICAL" : "HIGH",
                        label: `Drift detected in ${file.name}`,
                        fileId: file.id,
                        fileName: file.name,
                        riskScore,
                    });
                }
            }

            if (riskScore > 40) {
                hotspots.push({
                    id: file.id,
                    name: file.name,
                    riskScore,
                    isDocumented: !!file.documentation,
                });
            }
        }

        const sortedActions = actions
            .sort((a, b) => {
                const pMap: Record<PriorityAction["priority"], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
                return pMap[a.priority] - pMap[b.priority];
            })
            .slice(0, 5);

        const sortedHotspots = hotspots.sort((a, b) => b.riskScore - a.riskScore).slice(0, 3);

        return {
            actions: sortedActions,
            hotspots: sortedHotspots,
        };
    },
    ["dashboard-priority-actions"],
    { revalidate: 60 }
);

export async function getPriorityActions(teamId?: string) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return { actions: [], hotspots: [] };

        if (teamId) {
            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: {
                        teamId,
                        userId: session.user.id,
                    },
                },
                select: { teamId: true },
            });

            if (!membership) {
                return { actions: [], hotspots: [] };
            }
        }

        return await getCachedPriorityActions(session.user.id, teamId ?? null);
    } catch (error) {
        console.error("Failed to fetch priority actions:", error);
        return { actions: [], hotspots: [] };
    }
}

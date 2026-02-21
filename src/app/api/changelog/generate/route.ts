import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateText } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkFilePermission } from "@/lib/permissions";

const changelogRequestSchema = z.object({
    fileIds: z.array(z.string().min(1)).min(1).max(100),
    format: z.enum(["keepachangelog", "conventional", "simple"]).default("keepachangelog"),
    includeDetails: z.boolean().default(true),
}).strict();

interface ChangeItem {
    type: "added" | "security";
    file: string;
    description: string;
    date: Date;
}

interface ParsedDoc {
    summary?: string;
    entities?: Array<{ type?: string; name?: string; doc?: string }>;
    securityInsights?: string[];
}

export async function POST(request: NextRequest) {
    const gateError = await requireFeature("changelog");
    if (gateError) return gateError;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = changelogRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileIds, format, includeDetails } = parsed.data;

        const allFiles = await db.file.findMany({
            where: { id: { in: fileIds } },
            include: { documentation: true },
            orderBy: { updatedAt: "desc" },
        });

        const accessibleFiles = [] as typeof allFiles;
        for (const file of allFiles) {
            const canView = await checkFilePermission(session.user.id, file.id, "view");
            if (canView) accessibleFiles.push(file);
        }

        if (accessibleFiles.length === 0) {
            return NextResponse.json({ error: "No accessible files found" }, { status: 404 });
        }

        const changes: ChangeItem[] = [];

        accessibleFiles.forEach((file) => {
            if (!file.documentation?.content) return;

            try {
                const doc = JSON.parse(file.documentation.content) as ParsedDoc;

                if (Array.isArray(doc.entities) && doc.entities.length > 0) {
                    doc.entities.slice(0, 5).forEach((entity) => {
                        changes.push({
                            type: "added",
                            file: file.name,
                            description: `${entity.type || "entity"} \`${entity.name || "Unnamed"}\`: ${(entity.doc || "New implementation").slice(0, 100)}`,
                            date: file.updatedAt,
                        });
                    });
                }

                if (Array.isArray(doc.securityInsights) && doc.securityInsights.length > 0) {
                    doc.securityInsights.forEach((insight) => {
                        changes.push({
                            type: "security",
                            file: file.name,
                            description: insight,
                            date: file.updatedAt,
                        });
                    });
                }
            } catch {
                // Ignore malformed docs.
            }
        });

        const fileSummary = accessibleFiles
            .map((file) => {
                let summary = "";
                if (file.documentation?.content) {
                    try {
                        const doc = JSON.parse(file.documentation.content) as ParsedDoc;
                        summary = doc.summary || "";
                    } catch {
                        // Ignore malformed docs.
                    }
                }
                return `- ${file.name} (${file.language || "unknown"}): ${summary.slice(0, 120)}`;
            })
            .join("\n");

        const changesSummary = changes
            .slice(0, 30)
            .map((change) => `- [${change.type.toUpperCase()}] ${change.file}: ${change.description.slice(0, 120)}`)
            .join("\n");

        const prompt = `Generate a professional CHANGELOG.md entry based on these code changes.

## Files Updated
${fileSummary}

## Detected Changes
${changesSummary || "- No granular entity changes detected; summarize file-level updates."}

Generate a ${format === "keepachangelog" ? "Keep a Changelog" : format === "conventional" ? "conventional" : "simple"} format entry with:
- A version header (use v1.0.0 or similar)
- Today's date
- Categories: Added, Changed, Fixed, Security (only include non-empty categories)
- Clear, user-facing descriptions
- 5-10 bullet points maximum

${includeDetails ? "Include specific function/class names where relevant." : "Keep descriptions high-level."}

Output ONLY markdown changelog content.`;

        const aiChangelog = await generateText(
            "You are a technical writer creating professional changelogs. Output clean markdown only.",
            prompt,
            { maxTokens: 1500 }
        );

        const changelog = aiChangelog.trim() || generateFallbackChangelog(accessibleFiles, changes);

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GENERATE_CHANGELOG",
                entity: "Changelog",
                entityId: accessibleFiles.map((file) => file.id).join(","),
                details: {
                    requestedFileCount: fileIds.length,
                    accessibleFileCount: accessibleFiles.length,
                    format,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            changelog,
            stats: {
                filesAnalyzed: accessibleFiles.length,
                changesDetected: changes.length,
            },
        });
    } catch (error) {
        console.error("Changelog generation error:", error);
        return NextResponse.json({ error: "Failed to generate changelog" }, { status: 500 });
    }
}

function generateFallbackChangelog(files: { name: string }[], changes: ChangeItem[]): string {
    const today = new Date().toISOString().split("T")[0];
    let markdown = `## [1.0.0] - ${today}\n\n`;

    const added = changes.filter((change) => change.type === "added");
    const security = changes.filter((change) => change.type === "security");

    if (added.length > 0) {
        markdown += `### Added\n\n`;
        added.slice(0, 5).forEach((change) => {
            markdown += `- ${change.description}\n`;
        });
        markdown += `\n`;
    }

    if (security.length > 0) {
        markdown += `### Security\n\n`;
        security.slice(0, 3).forEach((change) => {
            markdown += `- ${change.description}\n`;
        });
        markdown += `\n`;
    }

    if (added.length === 0 && security.length === 0) {
        markdown += `### Changed\n\n`;
        files.slice(0, 5).forEach((file) => {
            markdown += `- Updated ${file.name}\n`;
        });
    }

    return markdown;
}

// GET available changelog formats/options
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        return NextResponse.json({
            formats: [
                { id: "keepachangelog", name: "Keep a Changelog", description: "Standard changelog format" },
                { id: "conventional", name: "Conventional", description: "Based on conventional commits" },
                { id: "simple", name: "Simple", description: "Minimal bullet list" },
            ],
            options: [
                { id: "includeDetails", name: "Include Details", default: true },
                { id: "groupByFile", name: "Group by File", default: false },
            ],
        });
    } catch (error) {
        console.error("Changelog formats error:", error);
        return NextResponse.json({ error: "Failed to load changelog options" }, { status: 500 });
    }
}

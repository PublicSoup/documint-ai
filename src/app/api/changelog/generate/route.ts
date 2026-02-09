import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateText } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";

interface ChangelogEntry {
    version?: string;
    date: string;
    changes: {
        type: "added" | "changed" | "fixed" | "removed" | "security";
        description: string;
    }[];
}

export async function POST(request: NextRequest) {
    try {
        // Check feature access
        const gateError = await requireFeature("changelog");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { fileIds, format = "keepachangelog", includeDetails = true } = await request.json();

        if (!fileIds || !fileIds.length) {
            return NextResponse.json({ error: "No files specified" }, { status: 400 });
        }

        // Get files with documentation
        const files = await db.file.findMany({
            where: {
                id: { in: fileIds },
                userId: session.user.id,
            },
            include: {
                documentation: true,
            },
            orderBy: { updatedAt: "desc" }
        });

        if (files.length === 0) {
            return NextResponse.json({ error: "No files found" }, { status: 404 });
        }

        // Extract changes from documentation metadata
        const changes: { type: string; file: string; description: string; date: Date }[] = [];

        files.forEach(file => {
            if (file.documentation?.content) {
                try {
                    const doc = JSON.parse(file.documentation.content);

                    // Check for entities (functions, classes added)
                    if (doc.entities?.length > 0) {
                        doc.entities.slice(0, 5).forEach((entity: any) => {
                            changes.push({
                                type: "added",
                                file: file.name,
                                description: `${entity.type} \`${entity.name}\`: ${entity.doc?.slice(0, 100) || "New implementation"}`,
                                date: file.updatedAt
                            });
                        });
                    }

                    // Check for security insights (fixes)
                    if (doc.securityInsights?.length > 0) {
                        doc.securityInsights.forEach((insight: string) => {
                            changes.push({
                                type: "security",
                                file: file.name,
                                description: insight,
                                date: file.updatedAt
                            });
                        });
                    }
                } catch { }
            }
        });

        // Use AI to generate a polished changelog
        const fileSummary = files.map(f => {
            let summary = "";
            if (f.documentation?.content) {
                try {
                    const doc = JSON.parse(f.documentation.content);
                    summary = doc.summary || "";
                } catch { }
            }
            return `- ${f.name} (${f.language}): ${summary.slice(0, 100)}`;
        }).join("\n");

        const changesSummary = changes.slice(0, 20).map(c =>
            `- [${c.type.toUpperCase()}] ${c.file}: ${c.description.slice(0, 80)}`
        ).join("\n");

        const prompt = `Generate a professional CHANGELOG.md entry based on these code changes:

## Files Updated
${fileSummary}

## Detected Changes
${changesSummary}

Generate a ${format === "keepachangelog" ? "Keep a Changelog" : "conventional"} format entry with:
- A version header (use v1.0.0 or similar)
- Today's date
- Categories: Added, Changed, Fixed, Security (only include non-empty categories)
- Clear, user-facing descriptions (not code details)
- 5-10 bullet points maximum

${includeDetails ? "Include specific function/class names where relevant." : "Keep descriptions high-level."}

Output ONLY the markdown changelog entry, no explanation.`;

        const aiChangelog = await generateText(
            "You are a technical writer creating professional changelogs. Output clean markdown only.",
            prompt,
            { maxTokens: 1500 }
        );

        // Fallback if AI fails
        const changelog = aiChangelog || generateFallbackChangelog(files, changes);

        // Log the generation for audit
        await db.auditLog.create({
            data: {
                userId: session.user.id,
                action: "GENERATE_CHANGELOG",
                entity: "Changelog",
                entityId: fileIds.join(","),
                details: { fileCount: files.length, format }
            }
        });

        return NextResponse.json({
            changelog,
            stats: {
                filesAnalyzed: files.length,
                changesDetected: changes.length
            }
        });

    } catch (error) {
        console.error("Changelog generation error:", error);
        return NextResponse.json({ error: "Failed to generate changelog" }, { status: 500 });
    }
}

function generateFallbackChangelog(files: any[], changes: any[]): string {
    const today = new Date().toISOString().split("T")[0];

    let md = `## [1.0.0] - ${today}\n\n`;

    const added = changes.filter(c => c.type === "added");
    const security = changes.filter(c => c.type === "security");

    if (added.length > 0) {
        md += `### Added\n\n`;
        added.slice(0, 5).forEach(c => {
            md += `- ${c.description}\n`;
        });
        md += `\n`;
    }

    if (security.length > 0) {
        md += `### Security\n\n`;
        security.slice(0, 3).forEach(c => {
            md += `- ${c.description}\n`;
        });
        md += `\n`;
    }

    if (added.length === 0 && security.length === 0) {
        md += `### Changed\n\n`;
        files.slice(0, 5).forEach(f => {
            md += `- Updated ${f.name}\n`;
        });
    }

    return md;
}

// GET available formats
export async function GET() {
    return NextResponse.json({
        formats: [
            { id: "keepachangelog", name: "Keep a Changelog", description: "Standard changelog format" },
            { id: "conventional", name: "Conventional", description: "Based on conventional commits" },
            { id: "simple", name: "Simple", description: "Minimal bullet list" }
        ],
        options: [
            { id: "includeDetails", name: "Include Details", default: true },
            { id: "groupByFile", name: "Group by File", default: false }
        ]
    });
}

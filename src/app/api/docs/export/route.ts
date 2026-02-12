import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { resolveUserId } from "../../../../lib/resolve-user";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileIds } = await req.json();

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return NextResponse.json({ error: "fileIds array is required" }, { status: 400 });
    }

    // Resolve user
    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    try {
        // Fetch valid files owned by user (or team logic if added later)
        const files = await db.file.findMany({
            where: {
                id: { in: fileIds },
                userId: userId, // Ensure ownership
            },
            include: {
                documentation: true,
            },
        });

        const exportData = files.reduce((acc, file) => {
            let content = "";
            let metadata = {};

            if (file.documentation) {
                try {
                    const docJson = JSON.parse(file.documentation.content);
                    // Reconstruct markdown from JSON for export
                    content = `# ${file.name}\n\n${docJson.summary}\n\n`;
                    if (Array.isArray(docJson.entities)) {
                        content += docJson.entities.map((e: any) => `## ${e.name}\n\n${e.doc}`).join("\n\n");
                    }
                    metadata = docJson.metadata || {};
                } catch (e) {
                    content = "Error parsing documentation content.";
                }
            } else {
                content = "No documentation generated.";
            }

            acc[file.id] = {
                name: file.name,
                language: file.language,
                content: content,
                metadata: metadata
            };
            return acc;
        }, {} as Record<string, any>);

        return NextResponse.json({ files: exportData });

    } catch (error) {
        console.error("Batch export error:", error);
        return NextResponse.json({ error: "Failed to fetch files" }, { status: 500 });
    }
}

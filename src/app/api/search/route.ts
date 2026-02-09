import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q");
        const type = searchParams.get("type") || "all"; // all, code, docs, files

        if (!query || query.length < 2) {
            return NextResponse.json({ error: "Query too short" }, { status: 400 });
        }

        const results: any[] = [];

        // Search in file names
        if (type === "all" || type === "files") {
            const files = await db.file.findMany({
                where: {
                    userId: session.user.id,
                    name: { contains: query, mode: 'insensitive' }
                },
                select: { id: true, name: true, language: true },
                take: 10
            });

            files.forEach(f => {
                results.push({
                    type: "file",
                    id: f.id,
                    title: f.name,
                    subtitle: `File (${f.language})`,
                    match: "filename"
                });
            });
        }

        // Search in code content
        if (type === "all" || type === "code") {
            const codeMatches = await db.file.findMany({
                where: {
                    userId: session.user.id,
                    content: { contains: query, mode: 'insensitive' }
                },
                select: { id: true, name: true, content: true, language: true },
                take: 10
            });

            codeMatches.forEach((f: any) => {
                // Find the line with the match
                if (!f.content) return;
                const lines = f.content.split('\n');
                const matchLine = lines.findIndex((l: string) => l.toLowerCase().includes(query.toLowerCase()));
                const snippet = matchLine >= 0 ? lines.slice(Math.max(0, matchLine - 1), matchLine + 2).join('\n') : "";

                results.push({
                    type: "code",
                    id: f.id,
                    title: f.name,
                    subtitle: `Line ${matchLine + 1}`,
                    snippet: snippet.substring(0, 200),
                    match: "code"
                });
            });
        }

        // Search in documentation
        if (type === "all" || type === "docs") {
            const docs = await db.documentation.findMany({
                where: {
                    content: { contains: query, mode: 'insensitive' },
                    file: { userId: session.user.id }
                },
                select: {
                    fileId: true,
                    content: true,
                    file: { select: { name: true } }
                },
                take: 10
            });

            docs.forEach(d => {
                try {
                    const parsed = JSON.parse(d.content);
                    const summary = parsed.summary || "";
                    if (summary.toLowerCase().includes(query.toLowerCase())) {
                        results.push({
                            type: "doc",
                            id: d.fileId,
                            title: d.file.name,
                            subtitle: "Documentation",
                            snippet: summary.substring(0, 200),
                            match: "documentation"
                        });
                    }
                } catch { }
            });
        }

        return NextResponse.json({
            query,
            results,
            total: results.length
        });

    } catch (error) {
        console.error("Search Error:", error);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}

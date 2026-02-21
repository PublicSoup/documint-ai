import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

const searchQuerySchema = z.object({
    q: z.string().trim().min(2).max(200),
    type: z.enum(["all", "code", "docs", "files"]).default("all"),
}).strict();

interface SearchResult {
    type: "file" | "code" | "doc";
    id: string;
    title: string;
    subtitle: string;
    match: "filename" | "code" | "documentation";
    snippet?: string;
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const params = new URL(req.url).searchParams;
        const parsed = searchQuerySchema.safeParse({
            q: params.get("q") ?? "",
            type: params.get("type") ?? "all",
        });

        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
        }

        const { q: query, type } = parsed.data;
        const queryLower = query.toLowerCase();

        const results: SearchResult[] = [];

        if (type === "all" || type === "files") {
            const files = await db.file.findMany({
                where: {
                    userId: session.user.id,
                    name: { contains: query, mode: "insensitive" },
                },
                select: { id: true, name: true, language: true },
                take: 10,
            });

            files.forEach((file) => {
                results.push({
                    type: "file",
                    id: file.id,
                    title: file.name,
                    subtitle: `File (${file.language || "unknown"})`,
                    match: "filename",
                });
            });
        }

        if (type === "all" || type === "code") {
            const codeMatches = await db.file.findMany({
                where: {
                    userId: session.user.id,
                    content: { contains: query, mode: "insensitive" },
                },
                select: { id: true, name: true, content: true },
                take: 10,
            });

            codeMatches.forEach((file) => {
                if (!file.content) return;
                const lines = file.content.split("\n");
                const matchLine = lines.findIndex((line) => line.toLowerCase().includes(queryLower));
                const snippet = matchLine >= 0 ? lines.slice(Math.max(0, matchLine - 1), matchLine + 2).join("\n") : "";

                results.push({
                    type: "code",
                    id: file.id,
                    title: file.name,
                    subtitle: `Line ${Math.max(matchLine + 1, 1)}`,
                    snippet: snippet.slice(0, 200),
                    match: "code",
                });
            });
        }

        if (type === "all" || type === "docs") {
            const docs = await db.documentation.findMany({
                where: {
                    content: { contains: query, mode: "insensitive" },
                    file: { userId: session.user.id },
                },
                select: {
                    fileId: true,
                    content: true,
                    file: { select: { name: true } },
                },
                take: 10,
            });

            docs.forEach((doc) => {
                try {
                    const parsedDoc = JSON.parse(doc.content) as { summary?: string };
                    const summary = typeof parsedDoc.summary === "string" ? parsedDoc.summary : "";
                    if (!summary.toLowerCase().includes(queryLower)) return;

                    results.push({
                        type: "doc",
                        id: doc.fileId,
                        title: doc.file.name,
                        subtitle: "Documentation",
                        snippet: summary.slice(0, 200),
                        match: "documentation",
                    });
                } catch {
                    // Ignore malformed documentation payloads.
                }
            });
        }

        return NextResponse.json({ query, results, total: results.length });
    } catch (error) {
        console.error("Search Error:", error);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}

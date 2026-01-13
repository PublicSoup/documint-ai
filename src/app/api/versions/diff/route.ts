import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as Diff from "diff";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const versionId1 = searchParams.get("v1");
        const versionId2 = searchParams.get("v2");

        if (!versionId1 || !versionId2) {
            return NextResponse.json({ error: "v1 and v2 required" }, { status: 400 });
        }

        // Fetch both versions
        const [v1, v2] = await Promise.all([
            db.docVersion.findUnique({
                where: { id: versionId1 },
                include: { documentation: { include: { file: true } } }
            }),
            db.docVersion.findUnique({
                where: { id: versionId2 },
                include: { documentation: { include: { file: true } } }
            })
        ]);

        if (!v1 || !v2) {
            return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }

        // Verify access
        if (v1.documentation.file.userId !== session.user.id) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Parse content
        let content1 = "", content2 = "";
        try {
            const parsed1 = JSON.parse(v1.content);
            const parsed2 = JSON.parse(v2.content);
            content1 = parsed1.summary || v1.content;
            content2 = parsed2.summary || v2.content;
        } catch {
            content1 = v1.content;
            content2 = v2.content;
        }

        // Generate diff
        const diffResult = Diff.diffLines(content1, content2);

        // Format for display
        const changes = diffResult.map(part => ({
            type: part.added ? "added" : part.removed ? "removed" : "unchanged",
            value: part.value,
            lines: part.value.split("\n").filter(l => l)
        }));

        // Stats
        const stats = {
            additions: diffResult.filter(p => p.added).reduce((a, p) => a + (p.count || 0), 0),
            deletions: diffResult.filter(p => p.removed).reduce((a, p) => a + (p.count || 0), 0)
        };

        return NextResponse.json({
            v1: { id: v1.id, version: v1.version, createdAt: v1.createdAt },
            v2: { id: v2.id, version: v2.version, createdAt: v2.createdAt },
            fileName: v1.documentation.file.name,
            changes,
            stats
        });

    } catch (error) {
        console.error("Diff Error:", error);
        return NextResponse.json({ error: "Diff failed" }, { status: 500 });
    }
}

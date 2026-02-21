import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import * as Diff from "diff";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeJsonParse } from "@/lib/utils";

const diffQuerySchema = z.object({
    v1: z.string().min(1),
    v2: z.string().min(1),
}).strict();

interface ParsedDocContent {
    summary?: string;
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = diffQuerySchema.safeParse({
            v1: new URL(req.url).searchParams.get("v1") ?? "",
            v2: new URL(req.url).searchParams.get("v2") ?? "",
        });

        if (!parsed.success) {
            return NextResponse.json({ error: "v1 and v2 required" }, { status: 400 });
        }

        const { v1: versionId1, v2: versionId2 } = parsed.data;

        const [version1, version2] = await Promise.all([
            db.docVersion.findUnique({
                where: { id: versionId1 },
                include: { documentation: { include: { file: true } } },
            }),
            db.docVersion.findUnique({
                where: { id: versionId2 },
                include: { documentation: { include: { file: true } } },
            }),
        ]);

        if (!version1 || !version2) {
            return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }

        if (version1.documentationId !== version2.documentationId) {
            return NextResponse.json({ error: "Versions must belong to the same documentation" }, { status: 400 });
        }

        const canView = await checkFilePermission(session.user.id, version1.documentation.fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const parsed1 = safeJsonParse<ParsedDocContent>(version1.content, {});
        const parsed2 = safeJsonParse<ParsedDocContent>(version2.content, {});

        const content1 = (parsed1.summary && parsed1.summary.trim()) ? parsed1.summary : version1.content;
        const content2 = (parsed2.summary && parsed2.summary.trim()) ? parsed2.summary : version2.content;

        const diffResult = Diff.diffLines(content1, content2);

        const changes = diffResult.map((part) => ({
            type: part.added ? "added" : part.removed ? "removed" : "unchanged",
            value: part.value,
            lines: part.value.split("\n").filter((line) => line.trim().length > 0),
        }));

        const stats = {
            additions: diffResult.filter((part) => part.added).reduce((acc, part) => acc + (part.count || 0), 0),
            deletions: diffResult.filter((part) => part.removed).reduce((acc, part) => acc + (part.count || 0), 0),
        };

        return NextResponse.json({
            v1: { id: version1.id, version: version1.version, createdAt: version1.createdAt },
            v2: { id: version2.id, version: version2.version, createdAt: version2.createdAt },
            fileName: version1.documentation.file.name,
            changes,
            stats,
        });
    } catch (error) {
        console.error("Diff error:", error);
        return NextResponse.json({ error: "Diff failed" }, { status: 500 });
    }
}

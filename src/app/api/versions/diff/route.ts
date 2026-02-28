import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import * as Diff from "diff";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeJsonParse } from "@/lib/utils";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const diffQuerySchema = z
    .object({
        v1: z.string().trim().min(1).max(100),
        v2: z.string().trim().min(1).max(100),
    })
    .strict();

interface ParsedDocContent {
    summary?: string;
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { v1: versionId1, v2: versionId2 } = validateQuery(req.nextUrl.searchParams, diffQuerySchema);

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
            throw ApiErrors.notFound("Version");
        }

        if (version1.documentationId !== version2.documentationId) {
            throw ApiErrors.badRequest("Versions must belong to the same documentation");
        }

        const canView = await checkFilePermission(session.user.id, version1.documentation.fileId, "view");
        if (!canView) {
            throw ApiErrors.forbidden("Access denied");
        }

        const parsed1 = safeJsonParse<ParsedDocContent>(version1.content, {});
        const parsed2 = safeJsonParse<ParsedDocContent>(version2.content, {});

        const content1 = parsed1.summary && parsed1.summary.trim() ? parsed1.summary : version1.content;
        const content2 = parsed2.summary && parsed2.summary.trim() ? parsed2.summary : version2.content;

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
        return errorResponse(error);
    }
}

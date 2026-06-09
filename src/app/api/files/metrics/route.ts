import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
    computeWorkspaceSummary,
    computeFileMetrics,
    type WorkspaceSummary,
    type FileMetrics,
} from "@/lib/file-insights";
import { unstable_cache as cache } from "next/cache";
import type { File as PrismaFile } from "@prisma/client";

export interface MetricsResponse {
    summary: WorkspaceSummary;
    files: Array<{
        id: string;
        name: string;
        language: string;
        updatedAt: string;
        docStatus: string | null;
        metrics: FileMetrics;
    }>;
}

const getCachedMetrics = cache(
    async (userId: string, teamId?: string | null): Promise<MetricsResponse> => {
        const whereClause = teamId ? { teamId } : { userId, teamId: null };

        const files = await db.file.findMany({
            where: whereClause,
            include: { documentation: { select: { status: true } } },
            orderBy: { updatedAt: "desc" },
            take: 200,
        });

        // Compute metrics per file
        const fileMetrics = files.map((file: typeof files[number]) => {
            const content = file.content || "";
            const metrics = computeFileMetrics(content, file.language || "plaintext");
            return {
                id: file.id,
                name: file.name,
                language: file.language,
                updatedAt: file.updatedAt.toISOString(),
                docStatus: file.documentation?.status ?? null,
                metrics,
            };
        });

        // Compute workspace summary from all files
        const summary = computeWorkspaceSummary(
            files.map((f: typeof files[number]) => ({
                content: f.content,
                language: f.language || "plaintext",
                documentation: f.documentation,
            }))
        );

        return { summary, files: fileMetrics };
    },
    ["workspace-metrics"],
    { revalidate: 60 }
);

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const teamId = request.nextUrl.searchParams.get("teamId");

        // Validate team access if teamId is provided
        if (teamId) {
            const membership = await db.teamMember.findFirst({
                where: { userId: session.user.id, teamId },
            });
            if (!membership) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const data = await getCachedMetrics(session.user.id, teamId);
        return NextResponse.json(data);
    } catch (error) {
        console.error("[GET /api/files/metrics]", error);
        return NextResponse.json(
            { error: "Failed to compute metrics" },
            { status: 500 }
        );
    }
}
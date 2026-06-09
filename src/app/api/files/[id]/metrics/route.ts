import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeFileMetrics, type FileMetrics } from "@/lib/file-insights";
import { unstable_cache as cache } from "next/cache";

export interface FileMetricsResponse {
    file: {
        id: string;
        name: string;
        language: string;
        size: number;
        createdAt: string;
        updatedAt: string;
    };
    metrics: FileMetrics;
    documentation: {
        exists: boolean;
        status: string | null;
        verifiedAt: string | null;
        summary: string | null;
    };
}

const getCachedFileMetrics = cache(
    async (fileId: string) => {
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: {
                documentation: {
                    select: {
                        content: true,
                        status: true,
                        verifiedAt: true,
                    },
                },
            },
        });

        if (!file) return null;

        const content = file.content || "";
        const metrics = computeFileMetrics(content, file.language || "plaintext");

        // Extract summary from documentation JSON
        let docSummary: string | null = null;
        if (file.documentation?.content) {
            try {
                const parsed = JSON.parse(file.documentation.content);
                if (parsed && typeof parsed.summary === "string") {
                    docSummary = parsed.summary;
                }
            } catch {
                // Ignore parse errors
            }
        }

        return {
            file: {
                id: file.id,
                name: file.name,
                language: file.language,
                size: file.size,
                createdAt: file.createdAt.toISOString(),
                updatedAt: file.updatedAt.toISOString(),
            },
            metrics,
            documentation: {
                exists: !!file.documentation,
                status: file.documentation?.status ?? null,
                verifiedAt: file.documentation?.verifiedAt?.toISOString() ?? null,
                summary: docSummary,
            },
        };
    },
    ["file-metrics"],
    { revalidate: 60 }
);

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify access: file belongs to user or user is team member
        const file = await db.file.findUnique({
            where: { id },
            select: {
                userId: true,
                teamId: true,
            },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Check access
        const hasAccess =
            file.userId === session.user.id ||
            (file.teamId
                ? !!(await db.teamMember.findFirst({
                      where: { userId: session.user.id, teamId: file.teamId },
                  }))
                : false);

        if (!hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const data = await getCachedFileMetrics(id);
        if (!data) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("[GET /api/files/[id]/metrics]", error);
        return NextResponse.json(
            { error: "Failed to compute metrics" },
            { status: 500 }
        );
    }
}
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

function getCoverageColor(coverage: number): string {
    if (coverage >= 90) return "#10b981";
    if (coverage >= 70) return "#3b82f6";
    if (coverage >= 50) return "#f59e0b";
    return "#ef4444";
}

function renderBadgeSvg(value: string, color: string): string {
    const label = "docs";
    const labelWidth = label.length * 7 + 10;
    const valueWidth = value.length * 8 + 10;
    const totalWidth = labelWidth + valueWidth;

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <path fill="#555" d="M0 0h${labelWidth}v20H0z"/>
    <path fill="${color}" d="M${labelWidth} 0h${valueWidth}v20H${labelWidth}z"/>
    <path fill="url(#b)" d="M0 0h${totalWidth}v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`.trim();
}

/**
 * GET /api/teams/[teamId]/badge
 * Returns a public documentation coverage badge for a team.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const ip = await getClientIP(request);
        await enforceRateLimit(ip, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return new NextResponse("Invalid team ID", { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const team = await db.team.findUnique({
            where: { id: teamId },
            select: { id: true },
        });

        if (!team) {
            return new NextResponse("Team Not Found", { status: 404 });
        }

        const [totalFiles, documentedFiles] = await Promise.all([
            db.file.count({ where: { teamId } }),
            db.file.count({
                where: {
                    teamId,
                    documentation: {
                        isNot: null,
                    },
                },
            }),
        ]);

        const coverage = totalFiles > 0 ? Math.round((documentedFiles / totalFiles) * 100) : 0;
        const value = `${coverage}%`;
        const color = getCoverageColor(coverage);
        const svg = renderBadgeSvg(value, color);

        return new NextResponse(svg, {
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
            },
        });
    } catch (error) {
        console.error("[Badge_API] Error:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

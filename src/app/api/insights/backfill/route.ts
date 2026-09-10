import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { analyzeAndPersistFile } from "@/lib/deterministic-analysis";
import { autoReviewDocumentation } from "@/lib/doc-review";

export const maxDuration = 300;

const BATCH = 200; // files analyzed per call (analysis is CPU-bound; keep bounded)

/**
 * POST /api/insights/backfill
 * Runs the deterministic (AI-free) analyzer over the caller's files and their
 * teams' files, populating `FileInsight` so the dashboard has data without
 * waiting for each file to be re-saved. Idempotent and safe to re-run —
 * unchanged files are skipped by content hash.
 *
 * GET reports progress (how many files already have insights).
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        await enforceRateLimit(session.user.id, "upload");

        const scope = await buildScope(session.user.id);

        const files = await db.file.findMany({
            where: scope,
            select: { id: true },
            orderBy: { updatedAt: "desc" },
            take: BATCH,
        });

        let analyzed = 0;
        let skipped = 0;
        for (const f of files) {
            const result = await analyzeAndPersistFile(f.id);
            if (result) analyzed++;
            else skipped++;
            // Deterministic doc review — flags stale/drifted docs into the review
            // queue. No-op for files without a documentation record.
            await autoReviewDocumentation(f.id).catch(() => undefined);
        }

        const remaining = await countRemaining(scope);

        return NextResponse.json({
            analyzed,
            skipped,
            processed: files.length,
            remaining,
            done: remaining === 0,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        await enforceRateLimit(session.user.id, "api");

        const scope = await buildScope(session.user.id);
        const [total, withInsight] = await db.$transaction([
            db.file.count({ where: scope }),
            db.fileInsight.count({ where: { file: scope } }),
        ]);

        return NextResponse.json({ total, withInsight, remaining: Math.max(0, total - withInsight) });
    } catch (error) {
        return errorResponse(error);
    }
}

/** Files the caller owns plus files in teams they belong to. */
async function buildScope(userId: string): Promise<Prisma.FileWhereInput> {
    const teamIds = (
        await db.teamMember.findMany({ where: { userId }, select: { teamId: true } })
    ).map((m: { teamId: string }) => m.teamId);

    return {
        OR: [{ userId }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
    };
}

async function countRemaining(scope: Prisma.FileWhereInput): Promise<number> {
    const [total, withInsight] = await db.$transaction([
        db.file.count({ where: scope }),
        db.fileInsight.count({ where: { file: scope } }),
    ]);
    return Math.max(0, total - withInsight);
}

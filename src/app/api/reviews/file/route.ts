import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody, validateQuery } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { analyzeSource } from "@/lib/code-review";
import { runRuleEngine, mergeReviews } from "@/lib/code-review-rules";

const runSchema = z.object({
    fileId: z.string().trim().min(1).max(100),
}).strict();

const listSchema = z.object({
    fileId: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

/**
 * POST /api/reviews/file
 * Reviews a single file the user owns/can access: a deterministic rule engine
 * always runs (instant, no AI), and AI enrichment is layered on when a provider
 * is configured. Persists the result and returns the full report (quality score,
 * strengths, security issues, and actionable findings).
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();

        // Heavier limit tier — analysis is CPU-bound and may call AI.
        await enforceRateLimit(session.user.id, "upload");

        const { fileId } = await validateBody(req, runSchema);

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) throw ApiErrors.forbidden();

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, name: true, language: true, content: true, teamId: true },
        });
        if (!file) throw ApiErrors.notFound("File");
        if (!file.content || !file.content.trim()) {
            throw ApiErrors.badRequest("This file has no code content to review");
        }

        // 1. Deterministic rule engine — always runs, instant, no AI. This is the
        //    review's baseline and works on Railway with no key configured.
        const deterministic = await runRuleEngine(file.content, file.language, file.name);

        // 2. Optional AI enrichment — appended when a provider is available.
        //    Failures (e.g. no key) are non-fatal; we still return the review.
        let aiResult = null;
        try {
            aiResult = await analyzeSource(file.content, file.language, {
                fileName: file.name,
                userId: session.user.id,
            });
        } catch {
            aiResult = null;
        }

        const result = mergeReviews(deterministic, aiResult);

        const review = await db.codeReview.create({
            data: {
                kind: "FILE",
                title: file.name,
                fileId: file.id,
                status: "COMPLETED",
                source: "MANUAL",
                summary: result.summary,
                qualityScore: result.qualityScore,
                grade: result.grade,
                riskLevel: result.riskLevel,
                strengths: result.strengths as unknown as Prisma.InputJsonValue,
                findings: result.findings as unknown as Prisma.InputJsonValue,
                userId: session.user.id,
                teamId: file.teamId,
            },
        });

        try {
            await logAudit({
                userId: session.user.id,
                action: "AI_CODE_REVIEW_FILE",
                entity: "File",
                entityId: file.id,
                details: {
                    reviewId: review.id,
                    qualityScore: result.qualityScore,
                    grade: result.grade,
                    riskLevel: result.riskLevel,
                    findingCount: result.findings.length,
                },
            });
        } catch {
            // non-blocking
        }

        return NextResponse.json({ review });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * GET /api/reviews/file            → your recent file reviews
 * GET /api/reviews/file?fileId=... → reviews for a specific file
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        await enforceRateLimit(session.user.id, "api");

        const { fileId, limit } = validateQuery(req.nextUrl.searchParams, listSchema);

        if (fileId) {
            const canView = await checkFilePermission(session.user.id, fileId, "view");
            if (!canView) throw ApiErrors.forbidden();
        }

        const reviews = await db.codeReview.findMany({
            where: {
                kind: "FILE",
                ...(fileId ? { fileId } : { userId: session.user.id }),
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            include: { file: { select: { id: true, name: true, language: true } } },
        });

        return NextResponse.json({ reviews });
    } catch (error) {
        return errorResponse(error);
    }
}

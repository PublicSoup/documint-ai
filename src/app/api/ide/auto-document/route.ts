import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkFilePermission, checkTeamPermission } from "@/lib/permissions";
import { autoDocumentFile, autoDocumentUserFiles } from "@/lib/auto-documentation";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const bodySchema = z
    .object({
        fileId: z.string().trim().min(1).max(100).optional(),
        all: z.boolean().optional(),
        force: z.boolean().optional(),
        teamId: z.string().trim().min(1).max(100).optional(),
        cap: z.number().int().min(1).max(50).optional(),
    })
    .strict()
    .refine((b) => Boolean(b.all) || Boolean(b.fileId), {
        message: "Provide either `fileId` (single file) or `all: true` (whole workspace).",
    });

/**
 * POST /api/ide/auto-document
 *
 * Automatically generates documentation for IDE workspace files.
 *   - `{ fileId }`      → document one file
 *   - `{ all: true }`   → document every file that has no documentation yet
 *   - `{ force: true }` → regenerate even if documentation already exists
 *   - `{ teamId }`      → operate within a team scope (requires edit permission)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }
        const userId = session.user.id;

        // AI-heavy: bound with the pro-tier rate limit.
        await enforceRateLimit(userId, "pro");

        const body = await validateBody(request, bodySchema);

        // Team scope requires edit permission on the team.
        if (body.teamId) {
            const canEditTeam = await checkTeamPermission(userId, body.teamId, "edit");
            if (!canEditTeam) {
                throw ApiErrors.forbidden();
            }
        }

        if (body.all) {
            const result = await autoDocumentUserFiles(userId, {
                teamId: body.teamId,
                cap: body.cap,
                force: body.force,
            });
            return NextResponse.json(result);
        }

        // Single file: verify the caller may edit it before spending AI budget.
        const fileId = body.fileId as string;
        const canEdit = await checkFilePermission(userId, fileId, "edit");
        if (!canEdit) {
            throw ApiErrors.forbidden();
        }

        const result = await autoDocumentFile(fileId, userId, {
            force: body.force,
            reason: "manual",
        });

        return NextResponse.json({
            results: [result],
            documented: result.status === "generated" ? 1 : 0,
            skipped: result.status.startsWith("skipped") ? 1 : 0,
            failed: result.status === "error" ? 1 : 0,
            scanned: 1,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

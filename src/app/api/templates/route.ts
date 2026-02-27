import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody, validateQuery } from "@/lib/api-utils";

const jsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(jsonValueSchema),
        z.record(z.string(), jsonValueSchema),
    ]),
);

const querySchema = z
    .object({
        teamId: z.string().trim().min(1).max(100).optional(),
    })
    .strict();

const createTemplateSchema = z
    .object({
        name: z.string().trim().min(1).max(120),
        content: z.string().trim().min(1).max(200_000),
        description: z.string().trim().max(500).optional(),
        teamId: z.string().trim().min(1).max(100).optional(),
        structure: z.record(z.string(), jsonValueSchema).optional(),
        isPublic: z.boolean().optional(),
    })
    .strict();

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { teamId } = validateQuery(request.nextUrl.searchParams, querySchema);

        if (teamId) {
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
            if (!hasPermission) {
                throw ApiErrors.forbidden();
            }
        }

        const templateWhere: Prisma.DocTemplateWhereInput = {
            OR: [
                { userId: session.user.id, teamId: null },
                { isPublic: true },
                ...(teamId ? [{ teamId }] : []),
            ],
        };

        const templates = await db.docTemplate.findMany({
            where: templateWhere,
            orderBy: { updatedAt: "desc" },
        });

        return NextResponse.json({ templates });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    const gateResponse = await requireFeature("customTemplates");
    if (gateResponse) return gateResponse;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { name, content, description, teamId, structure, isPublic } = await validateBody(request, createTemplateSchema);

        if (teamId) {
            const canEditTeam = await checkTeamPermission(session.user.id, teamId, "edit");
            if (!canEditTeam) {
                throw ApiErrors.forbidden();
            }
        }

        const template = await db.docTemplate.create({
            data: {
                userId: session.user.id,
                teamId: teamId ?? null,
                name,
                content,
                description,
                structure: structure ?? {},
                isPublic: Boolean(isPublic),
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_TEMPLATE",
                entity: "DocTemplate",
                entityId: template.id,
                details: {
                    name,
                    teamId: teamId ?? null,
                    isPublic: Boolean(isPublic),
                },
            });
        } catch {
            // Keep write path resilient if audit persistence fails.
        }

        return NextResponse.json({ template }, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}

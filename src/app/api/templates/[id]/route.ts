import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

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

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

const updateTemplateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    content: z.string().trim().min(1).max(200_000).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    structure: z.record(z.string(), jsonValueSchema).optional(),
    isPublic: z.boolean().optional(),
}).strict().refine(
    (value) => Object.keys(value).length > 0,
    { message: "At least one field is required" },
);

async function getAuthedUserId() {
    const session = await getServerSession(authOptions);
    return session?.user?.id ?? null;
}

async function getOwnedTemplate(templateId: string, userId: string) {
    const template = await db.docTemplate.findUnique({
        where: { id: templateId },
    });

    if (!template || template.userId !== userId) {
        return null;
    }

    return template;
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const gateResponse = await requireFeature("customTemplates");
    if (gateResponse) return gateResponse;

    const userId = await getAuthedUserId();
    if (!userId) {
        throw ApiErrors.unauthorized();
    }

    try {
        await enforceRateLimit(userId, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid template ID", parsedParams.error.flatten());
        }

        const parsedBody = await validateBody(request, updateTemplateSchema);

        const existingTemplate = await getOwnedTemplate(parsedParams.data.id, userId);
        if (!existingTemplate) {
            throw ApiErrors.notFound("Template");
        }

        const { name, content, description, structure, isPublic } = parsedBody;

        const template = await db.docTemplate.update({
            where: { id: parsedParams.data.id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(content !== undefined ? { content } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(structure !== undefined ? { structure } : {}),
                ...(isPublic !== undefined ? { isPublic } : {}),
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId,
                action: "UPDATE_TEMPLATE",
                entity: "DocTemplate",
                entityId: template.id,
                details: {
                    updatedFields: Object.keys(parsedBody),
                },
            });
        } catch {
            // Keep mutation non-blocking when audit logging fails.
        }

        return NextResponse.json({ template });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const gateResponse = await requireFeature("customTemplates");
    if (gateResponse) return gateResponse;

    const userId = await getAuthedUserId();
    if (!userId) {
        throw ApiErrors.unauthorized();
    }

    try {
        await enforceRateLimit(userId, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid template ID", parsedParams.error.flatten());
        }

        const existingTemplate = await getOwnedTemplate(parsedParams.data.id, userId);
        if (!existingTemplate) {
            throw ApiErrors.notFound("Template");
        }

        await db.docTemplate.delete({
            where: { id: parsedParams.data.id },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId,
                action: "DELETE_TEMPLATE",
                entity: "DocTemplate",
                entityId: parsedParams.data.id,
            });
        } catch {
            // Keep mutation non-blocking when audit logging fails.
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}

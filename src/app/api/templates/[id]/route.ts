import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";

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
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(userId, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
        }

        const parsedBody = updateTemplateSchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid template payload" }, { status: 400 });
        }

        const existingTemplate = await getOwnedTemplate(parsedParams.data.id, userId);
        if (!existingTemplate) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        const { name, content, description, structure, isPublic } = parsedBody.data;

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
                    updatedFields: Object.keys(parsedBody.data),
                },
            });
        } catch {
            // Keep mutation non-blocking when audit logging fails.
        }

        return NextResponse.json({ template });
    } catch (error) {
        console.error("Failed to update template:", error);
        return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
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
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(userId, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
        }

        const existingTemplate = await getOwnedTemplate(parsedParams.data.id, userId);
        if (!existingTemplate) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
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
        console.error("Failed to delete template:", error);
        return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
    }
}

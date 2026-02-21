import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { checkTeamPermission } from "@/lib/permissions";
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

const querySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

const createTemplateSchema = z.object({
    name: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(200_000),
    description: z.string().trim().max(500).optional(),
    teamId: z.string().trim().min(1).max(100).optional(),
    structure: z.record(z.string(), jsonValueSchema).optional(),
    isPublic: z.boolean().optional(),
}).strict();

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = querySchema.safeParse({
            teamId: request.nextUrl.searchParams.get("teamId") ?? undefined,
        });

        if (!parsedQuery.success) {
            return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
        }

        const { teamId } = parsedQuery.data;

        if (teamId) {
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
            if (!hasPermission) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        console.error("Failed to fetch templates:", error);
        return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const gateResponse = await requireFeature("customTemplates");
    if (gateResponse) return gateResponse;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(session.user.id, "api");

        const parsedBody = createTemplateSchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid template payload" }, { status: 400 });
        }

        const { name, content, description, teamId, structure, isPublic } = parsedBody.data;

        if (teamId) {
            const canEditTeam = await checkTeamPermission(session.user.id, teamId, "edit");
            if (!canEditTeam) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        console.error("Create template error:", error);
        return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
    }
}

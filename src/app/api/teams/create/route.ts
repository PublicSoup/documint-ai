import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const createTeamSchema = z
    .object({
        name: z.string().trim().min(2).max(100),
    })
    .strict();

function slugifyTeamName(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "team";
}

function isSlugConflictError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
        return target.includes("slug");
    }

    return typeof target === "string" && target.includes("slug");
}

async function createUniqueTeamSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 0;

    while (true) {
        const existing = await db.team.findUnique({
            where: { slug: candidate },
            select: { id: true },
        });

        if (!existing) {
            return candidate;
        }

        suffix += 1;
        candidate = `${base}-${suffix}`;
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const body = await validateBody(req, createTeamSchema);

        const slug = await createUniqueTeamSlug(slugifyTeamName(body.name));

        const team = await db.team.create({
            data: {
                name: body.name,
                slug,
                members: {
                    create: {
                        userId: session.user.id,
                        role: "OWNER",
                    },
                },
            },
            select: {
                id: true,
                name: true,
                slug: true,
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_TEAM",
                entity: "Team",
                entityId: team.id,
                details: {
                    name: team.name,
                    slug: team.slug,
                },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ team }, { status: 201 });
    } catch (error) {
        if (isSlugConflictError(error)) {
            return errorResponse(ApiErrors.conflict("A team with this slug already exists"));
        }

        return errorResponse(error);
    }
}

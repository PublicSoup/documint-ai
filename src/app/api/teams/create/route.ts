import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

const createTeamSchema = z.object({
    name: z.string().trim().min(2).max(100),
}).strict();

function slugifyTeamName(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "team";
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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedBody = createTeamSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Team name must be between 2 and 100 characters" }, { status: 400 });
        }

        const { name } = parsedBody.data;
        const slug = await createUniqueTeamSlug(slugifyTeamName(name));

        const team = await db.team.create({
            data: {
                name,
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
    } catch (error: unknown) {
        console.error("Create team error:", error);

        const message = error instanceof Error ? error.message : "";
        if (message.includes("Rate limit")) {
            return NextResponse.json({ error: message }, { status: 429 });
        }

        return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }
}

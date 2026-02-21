import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const body = await req.json().catch(() => ({}));
        const { name } = body;

        if (!name || name.trim().length < 2) {
            return NextResponse.json({ error: "Team name must be at least 2 characters" }, { status: 400 });
        }

        // Generate slug from name
        let slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
            .replace(/^-+|-+$/g, '');   // Remove leading/trailing hyphens

        // Ensure uniqueness with deterministic incremental suffix.
        let suffix = 0;
        let candidate = slug;
        while (true) {
            const existing = await db.team.findUnique({ where: { slug: candidate } });
            if (!existing) break;
            suffix += 1;
            candidate = `${slug}-${suffix}`;
        }
        slug = candidate;

        const team = await db.team.create({
            data: {
                name,
                slug,
                members: {
                    create: {
                        userId: session.user.id,
                        role: "OWNER"
                    }
                }
            }
        });

        // Audit Logging
        try {
            const { logAudit } = await import("../../../../lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_TEAM",
                entity: "Team",
                entityId: team.id,
                details: { name: team.name, slug: team.slug }
            });
        } catch (e) {
            console.error("Failed to log audit for team creation:", e);
        }

        return NextResponse.json({ team });
    } catch (error: unknown) {
        console.error("Create team error:", error);

        const message = error instanceof Error ? error.message : "";
        if (message.includes("Rate limit")) {
            return NextResponse.json({ error: message }, { status: 429 });
        }

        return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }
}

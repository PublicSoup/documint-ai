import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await req.json();

    if (!name || name.trim().length < 2) {
        return NextResponse.json({ error: "Team name must be at least 2 characters" }, { status: 400 });
    }

    // Generate slug from name
    let slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, '');   // Remove leading/trailing hyphens

    // Ensure uniqueness (append random string if needed)
    // For MVP we'll just append a random number if it exists
    const existing = await db.team.findUnique({ where: { slug } });
    if (existing) {
        slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
    }

    try {
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

        return NextResponse.json({ team });
    } catch (error) {
        console.error("Create team error:", error);
        return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }
}

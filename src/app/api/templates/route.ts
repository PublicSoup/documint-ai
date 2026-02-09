import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const templates = await db.docTemplate.findMany({
            where: {
                OR: [
                    { userId: session.user.id },
                    { isPublic: true }
                ]
            },
            orderBy: { updatedAt: 'desc' }
        });

        return NextResponse.json({ templates });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    // 1. Feature Gate
    const gateResponse = await requireFeature("customTemplates");
    if (gateResponse) return gateResponse;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json();
        const { name, content, description } = body;

        if (!name || !content) {
            return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
        }

        const template = await db.docTemplate.create({
            data: {
                userId: session.user.id,
                name,
                content,
                description,
                structure: {},
            }
        });

        // Audit Log
        await db.auditLog.create({
            data: {
                userId: session.user.id,
                action: "CREATE_TEMPLATE",
                entity: "DocTemplate",
                entityId: template.id,
                details: { name },
            }
        });

        return NextResponse.json({ template });
    } catch (error) {
        console.error("Create template error:", error);
        return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    // Feature Gate
    const gateResponse = await requireFeature("customTemplates");
    if (gateResponse) return gateResponse;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json();
        const { name, content, description } = body;

        // Verify ownership
        const existing = await db.docTemplate.findUnique({
            where: { id: params.id }
        });

        if (!existing || existing.userId !== session.user.id) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        const template = await db.docTemplate.update({
            where: { id: params.id },
            data: {
                name,
                content,
                description
            }
        });

        // Audit Log
        await db.auditLog.create({
            data: {
                userId: session.user.id,
                action: "UPDATE_TEMPLATE",
                entity: "DocTemplate",
                entityId: template.id,
                details: { name },
            }
        });

        return NextResponse.json({ template });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    // Feature Gate
    const gateResponse = await requireFeature("customTemplates");
    if (gateResponse) return gateResponse;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        // Verify ownership
        const existing = await db.docTemplate.findUnique({
            where: { id: params.id }
        });

        if (!existing || existing.userId !== session.user.id) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        await db.docTemplate.delete({
            where: { id: params.id }
        });

        // Audit Log
        await db.auditLog.create({
            data: {
                userId: session.user.id,
                action: "DELETE_TEMPLATE",
                entity: "DocTemplate",
                entityId: params.id,
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
    }
}

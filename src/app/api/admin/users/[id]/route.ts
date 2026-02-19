import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { validateAdmin } from "@/lib/admin-auth";

// UPDATE USER
export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const adminCheck = await validateAdmin();
    if (!adminCheck.authorized) return adminCheck.response;

    try {
        const { id } = await params;
        const body = await req.json();
        const { name, email, password } = body;

        const dataToUpdate: Prisma.UserUpdateInput = {};
        if (name) dataToUpdate.name = name;
        if (email) dataToUpdate.email = email;
        if (password) {
            dataToUpdate.password = await hash(password, 12);
        }

        const updatedUser = await db.user.update({
            where: { id },
            data: dataToUpdate
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: adminCheck.session?.user?.id,
                action: "ADMIN_UPDATE_USER_DETAILS",
                entity: "User",
                entityId: id,
                details: { 
                    updatedFields: Object.keys(dataToUpdate).filter(f => f !== 'password'),
                    passwordChanged: !!password
                }
            });
        } catch {}

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Admin User UPDATE Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// DELETE USER
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const adminCheck = await validateAdmin();
    if (!adminCheck.authorized) return adminCheck.response;

    try {
        const { id } = await params;

        // Prevent deleting self
        if (adminCheck.session?.user?.id === id) {
            return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
        }

        await db.user.delete({
            where: { id }
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: adminCheck.session?.user?.id,
                action: "ADMIN_DELETE_USER",
                entity: "User",
                entityId: id,
                details: { targetUserId: id }
            });
        } catch {}

        return NextResponse.json({ message: "User Deleted" });
    } catch (error) {
        console.error("Admin User DELETE Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

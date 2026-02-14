import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hash, compare } from "bcryptjs";

export async function PATCH(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { name, currentPassword, newPassword, settings } = body;

        const updateData: any = {};

        // Update display name
        if (name !== undefined) {
            updateData.name = name;
        }

        // Update settings/preferences (JSON field)
        if (settings !== undefined) {
            updateData.settings = settings;
        }

        // Password change (requires current password verification)
        if (newPassword) {
            if (!currentPassword) {
                return NextResponse.json(
                    { error: "Current password is required to set a new password" },
                    { status: 400 }
                );
            }

            const user = await db.user.findUnique({
                where: { id: session.user.id },
                select: { password: true },
            });

            if (!user?.password) {
                return NextResponse.json(
                    { error: "Cannot change password for OAuth accounts" },
                    { status: 400 }
                );
            }

            const isValid = await compare(currentPassword, user.password);
            if (!isValid) {
                return NextResponse.json(
                    { error: "Current password is incorrect" },
                    { status: 403 }
                );
            }

            if (newPassword.length < 8) {
                return NextResponse.json(
                    { error: "New password must be at least 8 characters" },
                    { status: 400 }
                );
            }

            updateData.password = await hash(newPassword, 12);
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const updatedUser = await db.user.update({
            where: { id: session.user.id },
            data: updateData,
            select: { id: true, name: true, email: true },
        });

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Failed to update user:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
}

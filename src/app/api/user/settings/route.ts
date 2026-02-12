import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true }
        });

        return NextResponse.json({ settings: user?.settings || {} });
    } catch (error) {
        console.error("Error fetching settings:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const updates = await req.json();

        // Get existing settings to merge (though Prisma's Json update is typically a replace, we want to be careful)
        // Actually, we can just save the new object if the client sends the full state, or do a shallow merge here.
        // For simplicity and robustness, we'll fetch then update.
        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true }
        });

        const currentSettings = (user?.settings as Record<string, any>) || {};
        const newSettings = { ...currentSettings, ...updates };

        const updatedUser = await db.user.update({
            where: { id: session.user.id },
            data: { settings: newSettings },
            select: { settings: true }
        });

        return NextResponse.json({ settings: updatedUser.settings });
    } catch (error) {
        console.error("Error updating settings:", error);
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}

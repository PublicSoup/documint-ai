
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin Check
    const isEnvAdmin = process.env.ADMIN_EMAIL === session.user.email;
    const userFn = await db.user.findUnique({
        where: { email: session.user.email },
        select: { role: true }
    });

    if (!isEnvAdmin && userFn?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";

    try {
        const where: any = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
            ];
        }

        const [users, total] = await db.$transaction([
            db.user.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    role: true,
                    emailVerified: true,
                    createdAt: true,
                    subscription: {
                        select: { plan: true, status: true }
                    },
                    _count: {
                        select: { files: true }
                    }
                }
            }),
            db.user.count({ where })
        ]);

        return NextResponse.json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error("Admin user fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isEnvAdmin = process.env.ADMIN_EMAIL === session.user.email;
    const admin = await db.user.findUnique({
        where: { email: session.user.email },
        select: { role: true }
    });

    if (!isEnvAdmin && admin?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { userId, role } = await req.json();

        if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

        const updateData: any = {};
        if (role) updateData.role = role;

        const updatedUser = await db.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, email: true, role: true }
        });

        return NextResponse.json({ user: updatedUser });

    } catch (error) {
        console.error("Admin user update error:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}

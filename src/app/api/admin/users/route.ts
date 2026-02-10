
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user?.email !== "admin@documintai.dev") {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const users = await db.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                subscription: {
                    select: {
                        plan: true,
                        status: true
                    }
                },
                _count: {
                    select: {
                        files: true,
                        auditLogs: true
                    }
                }
            },
            orderBy: {
                id: 'desc' // Newest first
            }
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error("Admin Users GET Error:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

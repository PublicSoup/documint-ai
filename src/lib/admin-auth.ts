import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Validates if the current user has administrative privileges.
 * Admin privileges are granted if:
 * 1. The user's email matches the ADMIN_EMAIL environment variable.
 * 2. The user's role in the database is "ADMIN".
 */
export async function validateAdmin() {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id || !session?.user?.email) {
        return { 
            authorized: false, 
            session: null, 
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) 
        };
    }

    const adminEmail = process.env.ADMIN_EMAIL || "admin@documintai.dev";
    const isEnvAdmin = session.user.email === adminEmail;

    // We trust the session role if available, but for critical admin actions, 
    // we should verify against the database.
    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { role: true }
    });

    const isAdmin = isEnvAdmin || user?.role === "ADMIN";

    if (!isAdmin) {
        return { 
            authorized: false, 
            session, 
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) 
        };
    }

    return { authorized: true, session, user };
}

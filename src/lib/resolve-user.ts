import { db } from "./db";
import { Session } from "next-auth";

/**
 * Resolves the actual database user ID from a NextAuth session.
 * This is necessary because session.user.id from JWT may not match the database primary key,
 * especially with OAuth providers like GitHub.
 * 
 * @param session - The NextAuth session object
 * @returns The database user ID, or null if user not found
 */
export async function resolveUserId(session: Session | null): Promise<string | null> {
    if (!session?.user?.email) {
        return null;
    }

    const dbUser = await db.user.findUnique({
        where: { email: session.user.email }
    });

    return dbUser?.id || null;
}

/**
 * Gets the resolved user ID or throws an error if not found.
 * Use this when you need to guarantee a valid user ID.
 * 
 * @param session - The NextAuth session object
 * @throws Error if user is not found in database
 * @returns The database user ID
 */
export async function requireUserId(session: Session | null): Promise<string> {
    const userId = await resolveUserId(session);
    if (!userId) {
        throw new Error("User not found in database");
    }
    return userId;
}

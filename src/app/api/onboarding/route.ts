import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveUserId } from "@/lib/resolve-user";
import { getUserSubscription } from "@/lib/subscription";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // No dev-only onboarding shortcuts in production paths.

        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 1. Check if user has uploaded any files
        const fileCount = await db.file.count({
            where: { userId }
        });

        // 2. Check if user has shared any document (isPublic = true)
        // We need to look up documentation associated with user's files
        // Or directly if we had userId on documentation, but we only have fileId.
        // Files are filtered by userId, so we filter documentation by those files.
        const sharedCount = await db.documentation.count({
            where: {
                isPublic: true,
                file: {
                    userId: userId
                }
            }
        });

        // 3. Check subscription status
        const subscription = await getUserSubscription(userId);
        const isPro = subscription.isPro || subscription.isTeam;

        // 4. Check if they have set a custom name (profile setup - simple proxy)
        const user = await db.user.findUnique({
            where: { id: userId },
            select: { name: true, settings: true }
        });

        // Determine dismissed state from user settings
        const settings = (user?.settings as { onboardingDismissed?: boolean } | null) || {};
        const isDismissed = !!settings.onboardingDismissed;

        return NextResponse.json({
            steps: {
                hasAccount: true, // Always true if logged in
                hasScanned: fileCount > 0,
                hasShared: sharedCount > 0,
                hasUpgraded: isPro,
            },
            isDismissed
        });

    } catch (error) {
        console.error("Onboarding API Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const { dismissed } = await req.json();

        // Update user settings
        const user = await db.user.findUnique({ where: { id: userId }, select: { settings: true } });
        const currentSettings = (user?.settings as Record<string, unknown> | null) || {};

        await db.user.update({
            where: { id: userId },
            data: {
                settings: {
                    ...currentSettings,
                    onboardingDismissed: dismissed
                }
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Onboarding Update Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

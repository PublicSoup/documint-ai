import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUserSubscription } from "@/lib/subscription";
import { Metadata } from "next";
import { Suspense } from "react";
import CodeClient from "./code-client";

export const metadata: Metadata = {
    title: "Web IDE | DocuMint AI",
    description: "Cloud Development Environment",
};

// Triggering production build for Cloud IDE access fix
export default async function CodePage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/login");
    }

    const subscription = await getUserSubscription(session.user.id);

    // Gate Access: Pro or Team only
    if (!subscription.isPro && !subscription.isTeam) {
        redirect("/dashboard/billing");
    }

    // Fetch user files - bypass if in dev mode (no DB)
    let files: import("@prisma/client").File[] = [];
    if (!subscription.isDevMode) {
        files = await db.file.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            take: 100
        });
    } else {
        console.log("⚠️ Dev mode: Skipping DB file fetch");
    }

    return (
        <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#1e1e1e] overscroll-none z-[9999]">
            {/* IDE takes over full screen, no dashboard layout wrapper */}
            <Suspense fallback={<div className="flex items-center justify-center h-full text-white/50">Loading IDE...</div>}>
                <CodeClient files={files} user={session.user} subscription={subscription} />
            </Suspense>
        </div>
    );
}

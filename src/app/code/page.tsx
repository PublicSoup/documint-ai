import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUserSubscription } from "@/lib/subscription";
import IDELayout from "@/components/ide/enhanced-ide-layout";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Web IDE | DocuMint AI",
    description: "Cloud Development Environment",
};

// Triggering production build for Cloud IDE access fix
export default async function CodePage() {
    console.log("Rendering /code page...");
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/login");
    }

    const subscription = await getUserSubscription(session.user.id);

    console.log("IDE Access Check:", {
        userId: session.user.id,
        plan: subscription.plan,
        status: subscription.status,
        isPro: subscription.isPro,
        isTeam: subscription.isTeam,
        isDevMode: subscription.isDevMode
    });

    // Gate Access: Pro or Team only
    if (!subscription.isPro && !subscription.isTeam) {
        console.log("Redirecting to billing - Not Pro/Team");
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
            <IDELayout files={files} user={session.user} subscription={subscription} />
        </div>
    );
}

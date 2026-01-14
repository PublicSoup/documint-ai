import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUserSubscription } from "@/lib/subscription";
import IDELayout from "@/components/ide-layout";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Web IDE | DocuMint AI",
    description: "Cloud Development Environment",
};

// Force rebuild
export default async function CodePage() {
    console.log("Rendering /code page...");
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/login");
    }

    const subscription = await getUserSubscription(session.user.id);

    // Gate Access: Pro or Team only
    if (!subscription.isPro && !subscription.isTeam) {
        redirect("/dashboard/billing");
    }

    // Fetch user files
    // In a real app we might fetch folders too, but for now flat list
    const files = await db.file.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 100
    });

    return (
        <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#1e1e1e] overscroll-none">
            {/* IDE takes over full screen, no dashboard layout wrapper */}
            <IDELayout files={files} user={session.user} subscription={subscription} />
        </div>
    );
}

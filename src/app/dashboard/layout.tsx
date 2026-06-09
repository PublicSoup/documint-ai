import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ChatWidget } from "@/components/chat-widget";
import { DashboardHeader } from "@/components/dashboard-header";
import { SiteFooter } from "@/components/site-footer";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect("/auth/login");
    }

    return (
        <div className="min-h-screen bg-transparent relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-black/0 to-black/0 pointer-events-none -z-10" />

            <DashboardHeader />

            {/* Main Content */}
            <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-12 transition-all duration-300 ease-in-out animate-fade-in">
                {children}
            </main>

            {/* Footer */}
            <SiteFooter />

            {/* Chat Widget */}
            <ChatWidget />
        </div>
    );
}

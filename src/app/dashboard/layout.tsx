import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ChatWidget } from "@/components/chat-widget";
import { DashboardShell } from "@/components/dashboard-shell";
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
        <div className="relative min-h-screen overflow-hidden bg-[#030014]">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,0.22),transparent_34%),radial-gradient(circle_at_80%_12%,rgba(76,29,149,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03)_0%,transparent_22%)]" />
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40" />

            <DashboardShell>{children}</DashboardShell>

            {/* Chat Widget */}
            <ChatWidget />
        </div>
    );
}

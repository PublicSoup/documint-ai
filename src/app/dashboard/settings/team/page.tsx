import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TeamManagement from "@/components/team-management";

export default async function TeamSettingsPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/login");
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-white mb-4">Team Management</h2>
            <TeamManagement />
        </div>
    );
}

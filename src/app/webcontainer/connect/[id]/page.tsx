import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";

interface WebContainerConnectPageProps {
    params: Promise<{ id: string }>;
}

/**
 * Route used by share/connect flows to open a file directly in IDE context.
 */
export default async function WebContainerConnectPage({ params }: WebContainerConnectPageProps) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        redirect("/auth/login");
    }

    const { id } = await params;
    const canView = await checkFilePermission(session.user.id, id, "view");
    if (!canView) {
        redirect("/dashboard?error=forbidden");
    }

    const file = await db.file.findUnique({
        where: { id },
        select: { id: true, teamId: true },
    });

    if (!file) {
        redirect("/dashboard?error=file-not-found");
    }

    const target = file.teamId
        ? `/dashboard?teamId=${encodeURIComponent(file.teamId)}&docId=${encodeURIComponent(file.id)}`
        : `/dashboard?docId=${encodeURIComponent(file.id)}`;

    redirect(target);
}

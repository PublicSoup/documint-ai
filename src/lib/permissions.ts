import { db } from "./db";

type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" | "MEMBER";
type Permission = "view" | "edit" | "delete" | "manage" | "approve";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    OWNER: ["view", "edit", "delete", "manage", "approve"],
    ADMIN: ["view", "edit", "delete", "manage", "approve"],
    EDITOR: ["view", "edit"],
    VIEWER: ["view"],
    MEMBER: ["view", "edit"]
};

export async function checkFilePermission(
    userId: string,
    fileId: string,
    permission: Permission
): Promise<boolean> {
    // 1. Check if user owns the file directly
    const file = await db.file.findUnique({
        where: { id: fileId },
        select: { userId: true, teamId: true }
    });

    if (!file) return false;
    if (file.userId === userId) return true; // Owner has all permissions

    // 2. Check file-level permission override
    const filePermission = await db.filePermission.findUnique({
        where: { fileId_userId: { fileId, userId } }
    });

    if (filePermission) {
        const role = filePermission.role as Role;
        return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
    }

    // 3. Check team membership if file belongs to team
    if (file.teamId) {
        const membership = await db.teamMember.findUnique({
            where: { teamId_userId: { teamId: file.teamId, userId } }
        });

        if (membership) {
            const role = membership.role as Role;
            return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
        }
    }

    return false;
}

export async function checkTeamPermission(
    userId: string,
    teamId: string,
    permission: Permission
): Promise<boolean> {
    const membership = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } }
    });

    if (!membership) return false;

    const role = membership.role as Role;
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export async function getUserRole(userId: string, teamId: string): Promise<Role | null> {
    const membership = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } }
    });
    return membership?.role as Role | null;
}

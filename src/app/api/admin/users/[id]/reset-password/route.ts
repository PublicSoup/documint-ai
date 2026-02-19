import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { validateAdmin } from "@/lib/admin-auth";

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const adminCheck = await validateAdmin();
    if (!adminCheck.authorized) return adminCheck.response;

    try {
        const { id: userId } = await context.params;

        // Generate a random 12-character password
        const cleanPassword = randomBytes(8).toString('hex').slice(0, 12);
        const hashedPassword = await hash(cleanPassword, 12);

        await db.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
            },
        });

        // Log the action
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: 'ADMIN_RESET_PASSWORD',
                entityId: userId,
                entity: 'User',
                userId: adminCheck.session?.user?.id,
                details: { targetUser: userId },
            });
        } catch (e) {
            console.error("Failed to log audit for admin password reset", e);
        }

        return NextResponse.json({ password: cleanPassword });
    } catch (error) {
        console.error('Password reset error:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

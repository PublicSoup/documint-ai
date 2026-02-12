
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user?.email !== 'admin@documintai.dev') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

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
        await db.auditLog.create({
            data: {
                action: 'PASSWORD_RESET',
                entityId: userId,
                entity: 'User',
                userId: session.user.id,
                details: { targetUser: userId },
            },
        });

        return NextResponse.json({ password: cleanPassword });
    } catch (error) {
        console.error('Password reset error:', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

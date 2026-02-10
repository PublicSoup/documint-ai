
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const email = process.argv[2] || 'admin@documintai.dev';
    const newPassword = process.argv[3] || '123Jackhayes';

    console.log(`🔒 Resetting password for: ${email}`);

    try {
        const hashedPassword = await hash(newPassword, 12);

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (user) {
            await prisma.user.update({
                where: { email },
                data: { password: hashedPassword }
            });
            console.log(`✅ Password updated successfully for existing user: ${email}`);
        } else {
            console.log(`⚠️ User ${email} not found. Creating new admin user...`);
            await prisma.user.create({
                data: {
                    email,
                    name: 'Admin User',
                    password: hashedPassword,
                    emailVerified: new Date(),
                }
            });
            console.log(`✅ Created new admin user: ${email}`);
        }

        console.log(`\n🔑 Credentials:\nEmail: ${email}\nPassword: ${newPassword}`);

    } catch (e) {
        console.error("❌ Error resetting password:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();

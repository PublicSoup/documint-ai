const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const email = 'admin@documintai.dev';
    const password = 'DocuMintAdmin2026!'; // Temporary secure password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 1. Create or Update the User
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
        },
        create: {
            email,
            name: 'Admin User',
            password: hashedPassword,
        },
    });

    // 2. Upsert Pro Subscription (The "second plan" is usually Starter -> Pro -> Team, so Pro)
    // Based on src/lib/subscription.ts: starter, pro, team
    await prisma.subscription.upsert({
        where: { userId: user.id },
        update: {
            status: 'active',
            plan: 'pro',
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1 year
            stripeCustomerId: 'cus_admin_manual',
            stripePriceId: process.env.STRIPE_PRICE_ID_PRO || 'price_manual_pro',
            stripeSubscriptionId: 'sub_admin_manual'
        },
        create: {
            userId: user.id,
            status: 'active',
            plan: 'pro',
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
            stripeCustomerId: 'cus_admin_manual',
            stripePriceId: process.env.STRIPE_PRICE_ID_PRO || 'price_manual_pro',
            stripeSubscriptionId: 'sub_admin_manual'
        },
    });

    console.log(`✅ Admin account ${email} is ready with PRO plan.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
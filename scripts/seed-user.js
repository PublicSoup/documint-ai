
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const password = await hash('password', 12);
    const email = 'admin@documint.ai';

    const user = await prisma.user.upsert({
        where: { email },
        update: { password },
        create: {
            email,
            name: 'Admin User',
            password,
        },
    });

    console.log(`Created user: ${user.email}`);

    // Upsert Pro Subscription
    await prisma.subscription.upsert({
        where: { userId: user.id },
        update: {
            status: 'active',
            plan: 'pro',
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
            stripeCustomerId: 'cus_test',
            stripePriceId: 'price_pro_test',
            stripeSubscriptionId: 'sub_test'
        },
        create: {
            userId: user.id,
            status: 'active',
            plan: 'pro',
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            stripeCustomerId: 'cus_test',
            stripePriceId: 'price_pro_test',
            stripeSubscriptionId: 'sub_test'
        },
    });

    console.log(`Updated subscription for: ${user.email}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

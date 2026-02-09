
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@documint.ai';

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        console.error(`User ${email} not found!`);
        return;
    }

    // Upsert Team Subscription
    await prisma.subscription.upsert({
        where: { userId: user.id },
        update: {
            status: 'active',
            plan: 'team', // Max plan
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1 year
            stripeCustomerId: 'cus_test_team',
            stripePriceId: 'price_team_test',
            stripeSubscriptionId: 'sub_test_team'
        },
        create: {
            userId: user.id,
            status: 'active',
            plan: 'team',
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
            stripeCustomerId: 'cus_test_team',
            stripePriceId: 'price_team_test',
            stripeSubscriptionId: 'sub_test_team'
        },
    });

    console.log(`Upgraded ${user.email} to TEAM (Max) plan.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

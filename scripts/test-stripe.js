// Script to test Stripe configuration
// Run: node scripts/test-stripe.js

const Stripe = require('stripe');
require('dotenv').config();

async function testStripe() {
    console.log('🔍 Testing Stripe Configuration...\n');

    // Check env vars
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const priceIdStarter = process.env.STRIPE_PRICE_ID_STARTER;
    const priceIdPro = process.env.STRIPE_PRICE_ID_PRO;
    const priceIdTeam = process.env.STRIPE_PRICE_ID_TEAM;

    console.log('Environment Variables:');
    console.log('✓ STRIPE_SECRET_KEY:', stripeKey ? `${stripeKey.substring(0, 20)}...` : '❌ MISSING');
    console.log('✓ STRIPE_PRICE_ID_STARTER:', priceIdStarter || '❌ MISSING');
    console.log('✓ STRIPE_PRICE_ID_PRO:', priceIdPro || '❌ MISSING');
    console.log('✓ STRIPE_PRICE_ID_TEAM:', priceIdTeam || '❌ MISSING');
    console.log('');

    if (!stripeKey) {
        console.error('❌ STRIPE_SECRET_KEY is missing!');
        process.exit(1);
    }

    // Detect if using test or live keys
    const keyType = stripeKey.startsWith('sk_test_') ? 'TEST' : 'LIVE';
    console.log(`🔑 Using ${keyType} mode keys\n`);

    const stripe = new Stripe(stripeKey);

    // Test 1: Can we connect to Stripe?
    try {
        const account = await stripe.accounts.retrieve();
        console.log('✅ Stripe Connection: SUCCESS');
        console.log(`   Account ID: ${account.id}`);
        console.log(`   Email: ${account.email || 'N/A'}`);
        console.log('');
    } catch (error) {
        console.error('❌ Stripe Connection: FAILED');
        console.error(`   Error: ${error.message}`);
        process.exit(1);
    }

    // Test 2: Verify price IDs exist
    console.log('🔍 Verifying Price IDs...');
    const priceIds = {
        starter: priceIdStarter,
        pro: priceIdPro,
        team: priceIdTeam
    };

    for (const [tier, priceId] of Object.entries(priceIds)) {
        if (!priceId) {
            console.log(`❌ ${tier.toUpperCase()}: Price ID not configured`);
            continue;
        }

        try {
            const price = await stripe.prices.retrieve(priceId);
            console.log(`✅ ${tier.toUpperCase()}: ${priceId}`);
            console.log(`   Amount: $${price.unit_amount / 100}/${price.recurring?.interval || 'one-time'}`);
            console.log(`   Product: ${price.product}`);
        } catch (error) {
            console.log(`❌ ${tier.toUpperCase()}: ${priceId}`);
            console.log(`   Error: ${error.message}`);
        }
    }

    console.log('\n✅ Stripe configuration test complete!');
}

testStripe().catch(console.error);

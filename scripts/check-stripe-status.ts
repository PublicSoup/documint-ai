import * as dotenv from "dotenv";
import path from "path";
import Stripe from "stripe";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
});

async function checkStripe() {
    console.log("🔌 Connecting to Stripe...");

    try {
        // 1. Verify Account
        const account = await stripe.accounts.retrieve();
        console.log(`✅ Connected to Stripe Account: ${account.settings?.dashboard?.display_name || account.id}`);

        // 2. Verify Prices
        const requiredPrices = {
            STARTER: process.env.STRIPE_PRICE_ID_STARTER,
            PRO: process.env.STRIPE_PRICE_ID_PRO,
            TEAM: process.env.STRIPE_PRICE_ID_TEAM
        };

        console.log("\n🔍 Verifying Products & Prices:");
        let allGood = true;

        for (const [name, id] of Object.entries(requiredPrices)) {
            if (!id) {
                console.error(`❌ Missing ENV Var for ${name}`);
                allGood = false;
                continue;
            }

            try {
                const price = await stripe.prices.retrieve(id);
                console.log(`   ✅ ${name}: Found Price ${id} (${price.unit_amount! / 100} ${price.currency.toUpperCase()})`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Unknown Stripe error";
                console.error(`   ❌ ${name}: Failed to find price ${id} - ${message}`);
                allGood = false;
            }
        }

        if (allGood) {
            console.log("\n🚀 Stripe System Status: OPERATIONAL");
            process.exit(0);
        } else {
            console.error("\nnm⚠️ Stripe System Status: ISSUES DETECTED");
            process.exit(1);
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown Stripe connection error";
        console.error(`❌ Failed to connect to Stripe: ${message}`);
        process.exit(1);
    }
}

checkStripe();

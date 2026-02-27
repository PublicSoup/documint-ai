import * as dotenv from "dotenv";
import path from "path";
import Stripe from "stripe";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

async function verifyConfig() {
  console.log("🔍 Verifying Stripe Configuration...");
  console.log("Secret Key starts with:", process.env.STRIPE_SECRET_KEY?.substring(0, 7));

  const prices = [
    { id: process.env.STRIPE_PRICE_ID_STARTER, name: "Starter" },
    { id: process.env.STRIPE_PRICE_ID_PRO, name: "Pro" },
    { id: process.env.STRIPE_PRICE_ID_TEAM, name: "Team" },
  ];

  for (const price of prices) {
    if (!price.id) {
      console.error(`❌ Price ID for ${price.name} is missing in .env`);
      continue;
    }

    try {
      const stripePrice = await stripe.prices.retrieve(price.id);
      console.log(`✅ Price ${price.name} (${price.id}) is VALID in Stripe.`);
      console.log(`   - Product: ${stripePrice.product}`);
      console.log(`   - Amount: ${stripePrice.unit_amount! / 100} ${stripePrice.currency.toUpperCase()}`);
      console.log(`   - Active: ${stripePrice.active}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown Stripe error";
      console.error(`❌ Price ${price.name} (${price.id}) is INVALID:`, message);
    }
  }

  try {
    const account = await stripe.accounts.retrieve();
    console.log(`✅ Stripe Account Verified: ${account.id} (${account.email || 'no email'})`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown Stripe account retrieval error";
    console.error("❌ Failed to retrieve Stripe account info:", message);
  }
}

verifyConfig();
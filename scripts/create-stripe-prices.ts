import * as dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file BEFORE importing anything else
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import Stripe from "stripe";

// Manually initialize Stripe here to ensure it uses the loaded env vars
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
});

async function createPrices() {
  console.log("🚀 Starting Stripe price creation...");

  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    console.warn("⚠️ Warning: STRIPE_SECRET_KEY is missing or is a TEST key.");
    console.log("Please ensure you have pasted the sk_live_ key into .env");
  }

  try {
    // 1. Create Product for DocuMint AI
    const product = await stripe.products.create({
      name: "DocuMint AI Subscription",
      description: "AI-powered documentation and code analysis",
    });

    console.log(`✅ Product created: ${product.id}`);

    // 2. Create Prices
    const starterPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 1900, // $19.00
      currency: "usd",
      recurring: { interval: "month" },
      nickname: "Starter",
    });
    console.log(`✅ Starter Price created: ${starterPrice.id}`);

    const proPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 2900, // $29.00
      currency: "usd",
      recurring: { interval: "month" },
      nickname: "Pro",
    });
    console.log(`✅ Pro Price created: ${proPrice.id}`);

    const teamPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 9900, // $99.00
      currency: "usd",
      recurring: { interval: "month" },
      nickname: "Team",
    });
    console.log(`✅ Team Price created: ${teamPrice.id}`);

    console.log("\n🎉 All prices created successfully!");
    console.log("\n--- COPY THESE TO YOUR .env FILE ---");
    console.log(`STRIPE_PRICE_ID_STARTER="${starterPrice.id}"`);
    console.log(`STRIPE_PRICE_ID_PRO="${proPrice.id}"`);
    console.log(`STRIPE_PRICE_ID_TEAM="${teamPrice.id}"`);
    console.log("------------------------------------");

  } catch (error) {
    console.error("❌ Error creating prices:", error);
    process.exit(1);
  }
}

createPrices();
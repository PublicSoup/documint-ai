import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-11-20.acacia" as any, // Bypass strict version check if types are slightly off, or use a known stable one
    typescript: true,
});

import Stripe from "stripe";
import { env } from "./env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-11-20.acacia" as any, // Bypass strict version check if types are slightly off, or use a known stable one
    typescript: true,
    maxNetworkRetries: 3,
    timeout: 10000, // 10 seconds
});

import { z } from 'zod';

/**
 * Environment variable configuration with type-safe validation
 * All env vars are validated at startup - app will crash if required vars are missing
 */
const envSchema = z.object({
    // Database
    DATABASE_URL: z.string().url(),

    // Redis (Optional - for rate limiting)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // AI Backend - Google Gemini
    GOOGLE_API_KEY: z.string().default(""),

    // Stripe Billing
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
    STRIPE_PRICE_ID_STARTER: z.string().min(1, "STRIPE_PRICE_ID_STARTER is required"),
    STRIPE_PRICE_ID_PRO: z.string().min(1, "STRIPE_PRICE_ID_PRO is required"),
    STRIPE_PRICE_ID_TEAM: z.string().min(1, "STRIPE_PRICE_ID_TEAM is required"),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required"),
    NEXT_PUBLIC_DEV_PRO: z.enum(['true', 'false']).default('false'),

    // Email (Resend)
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('noreply@documintai.dev'),

    // Storage (Supabase - Optional)
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    // Authentication (NextAuth)
    NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
    NEXTAUTH_URL: z.string().url().default("https://documintai.dev"),
    NEXT_PUBLIC_APP_URL: z.string().url().default("https://documintai.dev"),

    // OAuth Providers (Optional)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GITLAB_CLIENT_ID: z.string().optional(),
    GITLAB_CLIENT_SECRET: z.string().optional(),
    AUTH0_CLIENT_ID: z.string().optional(),
    AUTH0_CLIENT_SECRET: z.string().optional(),
    AUTH0_ISSUER: z.string().url().optional(),

    // GitHub Integration
    GITHUB_WEBHOOK_SECRET: z.string().optional(),

    // Admin
    ADMIN_EMAIL: z.string().email().optional(),

    // System
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    VERCEL: z.string().optional(),
});

export const env = envSchema.parse({
    // Database
    DATABASE_URL: process.env.DATABASE_URL,

    // Redis
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

    // AI
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || undefined,

    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    STRIPE_PRICE_ID_STARTER: process.env.STRIPE_PRICE_ID_STARTER || undefined,
    STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO || undefined,
    STRIPE_PRICE_ID_TEAM: process.env.STRIPE_PRICE_ID_TEAM || undefined,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
    NEXT_PUBLIC_DEV_PRO: (process.env.NEXT_PUBLIC_DEV_PRO || 'false'),

    // Email
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: (process.env.EMAIL_FROM && process.env.EMAIL_FROM.includes('@')) ? process.env.EMAIL_FROM : undefined,

    // Storage
    SUPABASE_URL: process.env.SUPABASE_URL || undefined,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,

    // Auth
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,

    // OAuth
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ID || undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET || undefined,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID || undefined,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET || undefined,
    GITLAB_CLIENT_ID: process.env.GITLAB_CLIENT_ID || undefined,
    GITLAB_CLIENT_SECRET: process.env.GITLAB_CLIENT_SECRET || undefined,
    AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID || undefined,
    AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET || undefined,
    AUTH0_ISSUER: process.env.AUTH0_ISSUER || undefined,


    // Admin
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,

    // System
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
});

export type Env = z.infer<typeof envSchema>;

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { db } from "./db";
import { compare } from "bcryptjs";
import { env } from "./env";
import { z } from "zod";
import { logAudit } from "./audit-logger";

function getAuthLoggerMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (metadata instanceof Error) {
        return {
            name: metadata.name,
            message: metadata.message,
            stack: metadata.stack,
        };
    }

    if (!metadata || typeof metadata !== "object") {
        return undefined;
    }

    const record = metadata as Record<string, unknown>;
    const error = record.error;

    return {
        provider: typeof record.provider === "string" ? record.provider : undefined,
        message: typeof record.message === "string" ? record.message : undefined,
        error: error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : typeof error === "string"
                ? error
                : undefined,
    };
}

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(db as any),
    secret: env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt"
    },
    logger: {
        error(code, metadata) {
            console.error("[next-auth][error]", code, getAuthLoggerMetadata(metadata));
        },
        warn(code) {
            console.warn("[next-auth][warn]", code);
        },
        debug(code, metadata) {
            if (process.env.NEXTAUTH_DEBUG === "true") {
                console.debug("[next-auth][debug]", code, getAuthLoggerMetadata(metadata));
            }
        },
    },
    pages: {
        signIn: "/auth/login",
    },
    providers: [
        ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? [GoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
        })] : []),
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                const { getClientIP, enforceRateLimit } = await import("./rate-limit");
                const clientIp = await getClientIP();
                await enforceRateLimit(clientIp, "auth-ip");

                const LoginCredentialsSchema = z.object({
                    email: z.string().email({ message: "Invalid email address." }),
                    password: z.string().min(8, { message: "Password must be at least 8 characters." }),
                });

                const parsedCredentials = LoginCredentialsSchema.safeParse(credentials);

                if (!parsedCredentials.success) {
                    await logAudit({
                        action: "AUTH_FAILED",
                        entity: "Login",
                        entityId: "N/A",
                        details: {
                            reason: "Invalid credentials format",
                            errors: parsedCredentials.error.flatten(),
                            providedEmail: credentials?.email || "N/A",
                        },
                    });
                    return null;
                }

                const { email, password } = parsedCredentials.data;
                const trimmedEmail = email.trim();

                // High-Security Rate Limiting: 10 attempts per 30 minutes per email
                try {
                    const { enforceRateLimit } = await import("./rate-limit");
                    // Relaxed for ADMIN_EMAIL: use 'api' tier (300/m) instead of 'security' (10/30m)
                    const tier = email === env.ADMIN_EMAIL ? "api" : "security";
                    await enforceRateLimit(email, tier);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Too many attempts. Try again in 30 minutes.";
                    await logAudit({
                        action: "AUTH_BLOCKED_RATE_LIMIT",
                        entity: "Login",
                        entityId: "N/A",
                        userId: trimmedEmail, // Use email as identifier for rate limit
                        details: {
                            reason: message,
                            email: trimmedEmail,
                        },
                    });
                    throw new Error(message);
                }

                // DEV BYPASS: Allow login without DB if in dev mode or DB is down


                const user = await db.user.findUnique({
                    where: {
                        email
                    }
                });

                if (!user) {
                    await logAudit({
                        action: "AUTH_FAILED",
                        entity: "User",
                        entityId: "N/A",
                        details: {
                            reason: "User not found",
                            email: trimmedEmail,
                        },
                    });
                    return null;
                }

                if (!user.password) {
                    await logAudit({
                        action: "AUTH_FAILED",
                        entity: "User",
                        entityId: user.id,
                        details: {
                            reason: "User has no password (likely OAuth user)",
                            email: trimmedEmail,
                        },
                    });
                    return null;
                }

                let isPasswordValid = false;
                try {
                    isPasswordValid = await compare(password, user.password);
                } catch (error) {
                    await logAudit({
                        action: "AUTH_ERROR",
                        entity: "User",
                        entityId: user.id,
                        details: {
                            reason: "Bcrypt compare error",
                            email: trimmedEmail,
                            error: (error as Error).message,
                        },
                    });
                    return null;
                }

                if (!isPasswordValid) {
                    await logAudit({
                        action: "AUTH_FAILED",
                        entity: "User",
                        entityId: user.id,
                        details: {
                            reason: "Invalid password",
                            email: trimmedEmail,
                        },
                    });
                    return null;
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                    role: user.role, // Pass role
                };
            }
        })
    ],
    callbacks: {
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as string; // Pass to session
            }
            return session;
        },
        async jwt({ token, user, account }) {
            if (user) {
                token.id = user.id;
                token.role = user.role; // Pass to token
            }
            return token;
        }
    },
};

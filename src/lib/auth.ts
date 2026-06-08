import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
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

function normalizeEmail(email: unknown): string | null {
    if (typeof email !== "string") {
        return null;
    }

    const normalized = email.trim().toLowerCase();
    return z.string().email().safeParse(normalized).success ? normalized : null;
}

function getProfileString(profile: unknown, key: string): string | null {
    if (!profile || typeof profile !== "object") {
        return null;
    }

    const value = (profile as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isGoogleEmailVerified(profile: unknown): boolean {
    if (!profile || typeof profile !== "object") {
        return true;
    }

    return (profile as Record<string, unknown>).email_verified !== false;
}

function getOAuthImage(profile: unknown, fallback?: string | null): string | null {
    return getProfileString(profile, "picture") ?? getProfileString(profile, "avatar_url") ?? fallback ?? null;
}

function warnOnNextAuthUrlMismatch(): void {
    // Best-effort guard: warns (does not throw) if the configured NEXTAUTH_URL
    // would produce an OAuth callback URI that does not match the request's
    // actual host. A mismatch here causes Google's "redirect_uri_mismatch"
    // 400. We can't read request headers from this module, so we just log the
    // effective callback URL at boot so it can be diffed against the Google
    // Cloud Console's "Authorized redirect URIs" list.
    if (process.env.NODE_ENV === "test") return;
    const base = env.NEXTAUTH_URL.replace(/\/+$/, "");
    const callbacks = ["google", "github", "gitlab", "auth0"]
        .map((p) => `${base}/api/auth/callback/${p}`)
        .join(", ");
    console.info(`[next-auth] OAuth callback URIs in use: ${callbacks}`);
}

warnOnNextAuthUrlMismatch();

export const authOptions: NextAuthOptions = {
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
        })] : []),
        ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? [GitHubProvider({
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
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
                    email: z.string().trim().toLowerCase().email({ message: "Invalid email address." }),
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
                const trimmedEmail = email.trim().toLowerCase();

                // High-Security Rate Limiting: 10 attempts per 30 minutes per email
                try {
                    const { enforceRateLimit } = await import("./rate-limit");
                    // Relaxed for ADMIN_EMAIL: use 'api' tier (300/m) instead of 'security' (10/30m)
                    const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
                    const tier = trimmedEmail === adminEmail ? "api" : "security";
                    await enforceRateLimit(trimmedEmail, tier);
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
                        email: trimmedEmail
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
        async signIn({ user, account, profile }) {
            if (account?.type !== "oauth") {
                return true;
            }

            if (account.provider === "google" && !isGoogleEmailVerified(profile)) {
                console.warn("[next-auth][oauth] rejected unverified Google email", { provider: account.provider });
                return false;
            }

            const email = normalizeEmail(getProfileString(profile, "email") ?? user.email);
            if (!email) {
                console.warn("[next-auth][oauth] rejected sign-in without verified email", { provider: account.provider });
                return false;
            }

            const name = user.name ?? getProfileString(profile, "name");
            const image = getOAuthImage(profile, user.image);
            const updateData: { name?: string | null; image?: string | null } = {};

            if (name) updateData.name = name;
            if (image) updateData.image = image;

            try {
                const dbUser = await db.user.upsert({
                    where: { email },
                    update: updateData,
                    create: {
                        email,
                        name,
                        image,
                        role: "USER",
                    },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        image: true,
                        role: true,
                    },
                });

                user.id = dbUser.id;
                user.email = dbUser.email;
                user.name = dbUser.name;
                user.image = dbUser.image;
                user.role = dbUser.role;

                return true;
            } catch (error) {
                console.error("[next-auth][oauth] failed to upsert OAuth user", {
                    provider: account.provider,
                    email,
                    error: getAuthLoggerMetadata(error),
                });

                return false;
            }
        },
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

            if (account?.type === "oauth") {
                const email = normalizeEmail(user?.email ?? token.email);

                if (email) {
                    const dbUser = await db.user.findUnique({
                        where: { email },
                        select: { id: true, role: true },
                    });

                    if (dbUser) {
                        token.id = dbUser.id;
                        token.role = dbUser.role;
                    }
                }
            }

            return token;
        }
    },
};

import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import GitLabProvider from "next-auth/providers/gitlab";
import { db } from "./db";
import { compare } from "bcryptjs";
import { sendEmail, emailTemplates } from "./email";
import { env } from "./env";
import { encrypt } from "./security/encryption";
import { z } from "zod";
import { logAudit } from "./audit-logger";
import { AuditLogSeverity } from "@prisma/client";

const Auth0ProfileSchema = z.object({
    sub: z.string(),
    name: z.string().optional(),
    email: z.string().email().optional(),
    picture: z.string().url().optional(),
});

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(db),
    session: {
        strategy: "jwt"
    },
    pages: {
        signIn: "/auth/login",
    },
    providers: [
        // Only register OAuth providers when credentials are configured
        ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? [GitHubProvider({
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
        })] : []),
        ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? [GoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        })] : []),
        ...(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET ? [GitLabProvider({
            clientId: env.GITLAB_CLIENT_ID,
            clientSecret: env.GITLAB_CLIENT_SECRET,
        })] : []),
        ...(env.AUTH0_CLIENT_ID && env.AUTH0_CLIENT_SECRET && env.AUTH0_ISSUER ? [{
            id: 'auth0',
            name: 'Auth0',
            type: 'oauth' as const,
            version: '2.0',
            wellKnown: `${env.AUTH0_ISSUER}/.well-known/openid-configuration`,
            authorization: { params: { scope: "openid email profile" } },
            idToken: true,
            profile(profile: z.infer<typeof Auth0ProfileSchema>) {

                const parsedProfile = Auth0ProfileSchema.safeParse(profile);

                if (!parsedProfile.success) {
                    logAudit({
                        action: "AUTH0_PROFILE_PARSE_FAILED",
                        entity: "Auth0",
                        entityId: "N/A",
                        details: {
                            reason: "Failed to parse Auth0 profile",
                            errors: parsedProfile.error.flatten(),
                            profileData: profile,
                        },
                    });
                    // Return a minimal profile to avoid breaking the authentication flow
                    return {
                        id: profile.sub as string || 'unknown-auth0-id',
                        name: 'Unknown Auth0 User',
                        email: 'unknown-auth0-email',
                        image: null,
                    };
                }

                const { sub, name, email, picture } = parsedProfile.data;

                return {
                    id: sub,
                    name: name || "Auth0 User",
                    email: email || "N/A",
                    image: picture || null,
                };
            },
            clientId: env.AUTH0_CLIENT_ID,
            clientSecret: env.AUTH0_CLIENT_SECRET,
            issuer: env.AUTH0_ISSUER,
        }] : []),
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
            // Capture GitHub Access Token on Sign In
            if (account && account.provider === "github" && account.access_token) {
                try {
                    // We must use the user ID from the token (which is already set) or the user object
                    let userId: string = (token.id as string) || "N/A";
                    if (userId) {
                        await db.gitHubConnection.upsert({
                            where: { userId },
                            update: {
                                accessToken: encrypt(account.access_token),
                                updatedAt: new Date(),
                            },
                            create: {
                                userId,
                                accessToken: encrypt(account.access_token),
                                githubId: parseInt(account.providerAccountId),
                                username: "github_user", // Fallback, updated later if needed
                            },
                        });
                    }
                } catch (e: unknown) {
                    await logAudit({
                        action: "GITHUB_TOKEN_SAVE_FAILED",
                        entity: "GitHubConnection",
                        entityId: "N/A",
                        details: {
                            reason: "Failed to save GitHub access token",
                            error: (e instanceof Error ? e.message : String(e)),
                        },
                    });
                }
            }
            return token;
        }
    },
    events: {
        async signIn({ user, account, isNewUser }) {
            try {

                await logAudit({
                    userId: user.id,
                    action: isNewUser ? "SIGN_UP" : "SIGN_IN",
                    entity: "User",
                    entityId: user.id,
                    details: {
                        method: account?.provider || "credentials",
                        isNewUser: !!isNewUser
                    }
                });
            } catch (e: unknown) {
                await logAudit({
                    action: "AUDIT_LOG_ERROR",
                    entity: "Auth",
                    entityId: user.id,
                    details: {
                        reason: "Failed to log auth audit event",
                        event: isNewUser ? "SIGN_UP" : "SIGN_IN",
                        error: (e instanceof Error ? e.message : String(e)),
                    },
                    severity: AuditLogSeverity.ERROR,
                });
            }
        },
        async signOut({ token }) {
            try {
                if (token?.id) {
                    await logAudit({
                        userId: token.id as string,
                        action: "SIGN_OUT",
                        entity: "User",
                        entityId: token.id as string,
                        details: { method: "session-end" }
                    });
                }
            } catch (e: unknown) {
                await logAudit({
                    action: "AUDIT_LOG_ERROR",
                    entity: "Auth",
                    entityId: token?.id || "N/A",
                    details: {
                        reason: "Failed to log signOut audit event",
                        error: (e instanceof Error ? e.message : String(e)),
                    },
                    severity: AuditLogSeverity.ERROR,
                });
            }
        },
        async createUser({ user }) {
            if (user.email) {
                try {
                    await sendEmail({
                        to: user.email,
                        subject: "Welcome to DocuMint AI! 🎉",
                        html: emailTemplates.welcome(user.name || "Developer", `${env.NEXT_PUBLIC_APP_URL}/dashboard`)
                    });
                    await logAudit({
                        action: "WELCOME_EMAIL_SENT",
                        entity: "User",
                        entityId: user.id,
                        details: {
                            email: user.email,
                            reason: "Welcome email successfully sent."
                        },
                        severity: AuditLogSeverity.INFO,
                    });
                } catch (e: unknown) {
                    await logAudit({
                        action: "WELCOME_EMAIL_FAILED",
                        entity: "User",
                        entityId: user.id,
                        details: {
                            email: user.email,
                            reason: "Failed to send welcome email",
                            error: (e instanceof Error ? e.message : String(e)),
                        },
                    });
                }
            }
        }
    }
};

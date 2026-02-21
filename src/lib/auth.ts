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

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(db) as NextAuthOptions['adapter'],
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
            profile(profile: Record<string, unknown>) {
                return {
                    id: profile.sub as string,
                    name: profile.name as string,
                    email: profile.email as string,
                    image: profile.picture as string,
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
                if (!credentials?.email || !credentials?.password) {
                    console.log("Auth failed: Missing credentials");
                    return null;
                }

                const email = credentials.email.trim();

                // High-Security Rate Limiting: 5 attempts per hour per email
                try {
                    const { enforceRateLimit } = await import("./rate-limit");
                    await enforceRateLimit(email, "security");
                } catch (limitError: unknown) {
                    console.warn(`Auth blocked: Rate limit for ${email}`);
                    const message = limitError instanceof Error ? limitError.message : "Too many attempts. Try again in an hour.";
                    throw new Error(message);
                }

                // DEV BYPASS: Allow login without DB if in dev mode or DB is down


                const user = await db.user.findUnique({
                    where: {
                        email
                    }
                });

                if (!user) {
                    console.log("Auth failed: User not found for email:", email);
                    return null;
                }

                if (!user.password) {
                    console.log("Auth failed: User has no password (likely OAuth user):", email);
                    return null;
                }

                let isPasswordValid = false;
                try {
                    isPasswordValid = await compare(credentials.password, user.password);
                } catch (error) {
                    console.error("Auth failed: Bcrypt compare error:", error);
                    return null;
                }

                if (!isPasswordValid) {
                    console.log("Auth failed: Invalid password for:", email);
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
                    const userId = token.id as string;
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
                } catch (e) {
                    console.error("Failed to save GitHub token", e);
                }
            }
            return token;
        }
    },
    events: {
        async signIn({ user, account, isNewUser }) {
            try {
                const { logAudit } = await import("./audit-logger");
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
            } catch (e) {
                console.error("Failed to log auth audit event", e);
            }
        },
        async signOut({ token }) {
            try {
                const { logAudit } = await import("./audit-logger");
                if (token?.id) {
                    await logAudit({
                        userId: token.id as string,
                        action: "SIGN_OUT",
                        entity: "User",
                        entityId: token.id as string,
                        details: { method: "session-end" }
                    });
                }
            } catch (e) {
                console.error("Failed to log signOut audit event", e);
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
                    console.log(`Welcome email sent to ${user.email}`);
                } catch (error) {
                    console.error("Failed to send welcome email:", error);
                }
            }
        }
    }
};

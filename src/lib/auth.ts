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
    adapter: PrismaAdapter(db) as any,
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

                // DEV BYPASS: Allow login without DB if in dev mode or DB is down
                if (process.env.NODE_ENV === "development" &&
                    email === "admin@documintai.dev" &&
                    credentials.password === "password") {
                    console.log("⚠️ Using Dev Auth Bypass for admin@documintai.dev");
                    return {
                        id: "dev-admin-id",
                        email: "admin@documintai.dev",
                        name: "Dev Admin",
                        image: null,
                    };
                }

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
                };
            }
        })
    ],
    callbacks: {
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
            }
            return session;
        },
        async jwt({ token, user, account }) {
            if (user) {
                token.id = user.id;
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

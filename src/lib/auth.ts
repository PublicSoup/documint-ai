import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import GitLabProvider from "next-auth/providers/gitlab";
import { db } from "./db";
import { compare } from "bcryptjs";
import { sendEmail, emailTemplates } from "./email";

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(db) as any,
    session: {
        strategy: "jwt"
    },
    pages: {
        signIn: "/auth/login",
    },
    providers: [
        GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID || "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
        GitLabProvider({
            clientId: process.env.GITLAB_CLIENT_ID || "",
            clientSecret: process.env.GITLAB_CLIENT_SECRET || "",
        }),
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
                                accessToken: account.access_token,
                                updatedAt: new Date(),
                            },
                            create: {
                                userId,
                                accessToken: account.access_token,
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
                        html: emailTemplates.welcome(user.name || "Developer", `${process.env.NEXT_PUBLIC_APP_URL || "https://documint.ai"}/dashboard`)
                    });
                    console.log(`Welcome email sent to ${user.email}`);
                } catch (error) {
                    console.error("Failed to send welcome email:", error);
                }
            }
        }
    }
};

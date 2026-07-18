import { z } from "zod";
import { env } from "@/lib/env";
import { upsertOAuthUser } from "@/lib/auth";
import { issueMobileSession } from "@/lib/mobile-auth-tokens";
import { ApiErrors, errorResponse, successResponse, validateBody } from "@/lib/api-utils";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

const oauthSchema = z
    .object({
        provider: z.enum(["google", "github"]),
        code: z.string().trim().min(1).max(2048),
        redirectUri: z.string().trim().url(),
        codeVerifier: z.string().trim().max(256).optional(),
        deviceInfo: z.string().trim().max(200).optional(),
    })
    .strict();

interface OAuthProfile {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    avatar_url?: string;
}

async function exchangeGoogleCode(code: string, redirectUri: string, codeVerifier?: string): Promise<OAuthProfile> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        throw ApiErrors.serviceUnavailable("Google sign-in");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
    });

    if (!tokenRes.ok) {
        throw ApiErrors.badRequest("Google code exchange failed.");
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
        throw ApiErrors.badRequest("Google code exchange returned no access token.");
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileRes.ok) {
        throw ApiErrors.badRequest("Failed to fetch Google profile.");
    }

    return (await profileRes.json()) as OAuthProfile;
}

async function exchangeGitHubCode(code: string, redirectUri: string): Promise<OAuthProfile> {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        throw ApiErrors.serviceUnavailable("GitHub sign-in");
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
        }),
    });

    if (!tokenRes.ok) {
        throw ApiErrors.badRequest("GitHub code exchange failed.");
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) {
        throw ApiErrors.badRequest(tokenJson.error ?? "GitHub code exchange returned no access token.");
    }

    const headers = {
        Authorization: `token ${tokenJson.access_token}`,
        "User-Agent": "documint-ai-mobile",
        Accept: "application/vnd.github+json",
    };

    const [profileRes, emailsRes] = await Promise.all([
        fetch("https://api.github.com/user", { headers }),
        fetch("https://api.github.com/user/emails", { headers }),
    ]);

    if (!profileRes.ok) {
        throw ApiErrors.badRequest("Failed to fetch GitHub profile.");
    }

    const profile = (await profileRes.json()) as { name?: string; avatar_url?: string; email?: string };

    // GitHub only includes a primary email on /user when it's public; the
    // dedicated /user/emails endpoint is the only reliable source for a
    // verified primary address, mirroring what next-auth's GitHubProvider
    // effectively relies on for the web OAuth flow.
    let email = profile.email ?? undefined;
    if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
        if (primary) email = primary.email;
    }

    return { email, email_verified: true, name: profile.name, avatar_url: profile.avatar_url };
}

/**
 * Mobile OAuth exchange: the app runs the provider's authorization-code
 * (+PKCE, for Google) flow in an in-app browser (`expo-auth-session`) and
 * hands the resulting code to this endpoint, which performs the token
 * exchange + profile fetch server-side and upserts the `User` row through
 * the exact same `upsertOAuthUser` helper the web `signIn` callback uses —
 * so both clients produce identical rows regardless of who signed in.
 */
export async function POST(req: Request) {
    try {
        const clientIp = await getClientIP(req);
        await enforceRateLimit(clientIp, "auth-ip");

        const { provider, code, redirectUri, codeVerifier, deviceInfo } = await validateBody(req, oauthSchema);

        const profile = provider === "google"
            ? await exchangeGoogleCode(code, redirectUri, codeVerifier)
            : await exchangeGitHubCode(code, redirectUri);

        const user = await upsertOAuthUser({
            provider,
            profile,
            fallbackEmail: profile.email ?? null,
            fallbackName: profile.name ?? null,
            fallbackImage: profile.picture ?? profile.avatar_url ?? null,
        });

        if (!user) {
            throw ApiErrors.unauthorized("Sign-in was rejected (unverified or missing email).");
        }

        const session = await issueMobileSession(user, deviceInfo);
        return successResponse(session);
    } catch (error) {
        return errorResponse(error);
    }
}

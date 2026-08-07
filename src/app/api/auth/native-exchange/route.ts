import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mintSessionCookie, verifyNativeHandoffToken } from "@/lib/native-auth";

// Node runtime: uses node:crypto (HMAC) and Prisma.
export const runtime = "nodejs";

/**
 * Final leg of the native OAuth hand-off (see src/lib/native-auth.ts). The app
 * WebView is deep-linked here with a single-use hand-off token; we verify+consume
 * it, mint a real NextAuth session cookie ON THE WEBVIEW, and land the user in the
 * app. This is intentionally public — the hand-off token IS the credential.
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    const fail = () => NextResponse.redirect(new URL("/auth/login?error=Callback", url.origin));

    if (!token) return fail();

    const verified = await verifyNativeHandoffToken(token);
    if (!verified) return fail();

    const user = await db.user.findUnique({
        where: { id: verified.userId },
        select: { id: true, email: true, name: true, image: true, role: true },
    });
    if (!user) return fail();

    const cookie = await mintSessionCookie({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
    });

    const response = NextResponse.redirect(new URL("/dashboard", url.origin));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { createNativeHandoffToken } from "@/lib/native-auth";
import NativeHandoffRedirect from "./native-handoff-redirect";

// Always evaluated per-request: it reads the just-established session.
export const dynamic = "force-dynamic";

/**
 * Landing page for the native OAuth flow, reached IN THE SYSTEM BROWSER after a
 * successful Google/GitHub sign-in. If authenticated, mint a single-use hand-off
 * token and bounce back into the app via the documintai:// deep link. See
 * src/lib/native-auth.ts for the full flow.
 */
export default async function NativeCallbackPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect("/auth/login?error=SessionRequired");
    }

    const token = createNativeHandoffToken(session.user.id);
    const deepLink = `documintai://auth/callback?token=${encodeURIComponent(token)}`;

    return <NativeHandoffRedirect deepLink={deepLink} />;
}

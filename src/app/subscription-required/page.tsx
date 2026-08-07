import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Subscription required | DocuMint AI",
};

/**
 * Neutral gate shown to non-subscribers INSIDE the native app in place of the
 * Stripe billing page. Per Apple guideline 3.1.1 it deliberately shows no price,
 * no "Upgrade" button, and no link to web checkout — it only explains that a
 * subscription managed on the web is required. Internal navigation (back to the
 * dashboard) is fine.
 */
export default function SubscriptionRequiredPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#030014] px-6 text-center">
            <div className="max-w-md">
                <h1 className="text-2xl font-bold text-white">A subscription is required</h1>
                <p className="mt-4 text-sm leading-relaxed text-white/60">
                    The DocuMint IDE is available to Pro and Team members. Your account
                    doesn&rsquo;t currently have an active plan on this device.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/60">
                    Manage your DocuMint subscription from a web browser, then return here
                    and sign in again to unlock the IDE.
                </p>
                <Link
                    href="/dashboard"
                    className="mt-8 inline-block rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                    Back to dashboard
                </Link>
            </div>
        </div>
    );
}

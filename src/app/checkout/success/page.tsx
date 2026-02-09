"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";

function SuccessContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

    useEffect(() => {
        const sessionId = searchParams.get("session_id");

        // If no session ID, still show success (they might have navigated directly)
        const timer = setTimeout(() => {
            setStatus("success");
        }, 1500);

        return () => clearTimeout(timer);
    }, [searchParams]);

    if (status === "loading") {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-white mx-auto mb-4" />
                    <p className="text-white text-lg">Processing your subscription...</p>
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
                    <p className="text-gray-600 mb-6">
                        We couldn't verify your subscription. Please contact support if this persists.
                    </p>
                    <button
                        onClick={() => router.push("/dashboard/billing")}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Return to Billing
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Pro!</h1>
                <p className="text-gray-600 mb-8">
                    Your subscription is now active. You have access to all premium features.
                </p>

                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 mb-8">
                    <h3 className="font-semibold text-gray-900 mb-2">What's unlocked:</h3>
                    <ul className="text-sm text-gray-600 space-y-1 text-left">
                        <li>✓ Unlimited file uploads</li>
                        <li>✓ Unlimited AI regenerations</li>
                        <li>✓ Team collaboration</li>
                        <li>✓ GitHub integration</li>
                        <li>✓ Priority support</li>
                    </ul>
                </div>

                <button
                    onClick={() => router.push("/dashboard")}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
                >
                    Go to Dashboard
                </button>
            </div>
        </div>
    );
}

export default function SuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-white" />
            </div>
        }>
            <SuccessContent />
        </Suspense>
    );
}

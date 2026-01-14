
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Dashboard Error:", error);
    }, [error]);

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 max-w-md text-center space-y-4 backdrop-blur-xl">
                <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white mb-2">Something went wrong!</h2>
                    <p className="text-sm text-gray-400 mb-4">{error.message || "An unexpected error occurred while loading the dashboard."}</p>
                    {error.digest && (
                        <code className="text-xs bg-black/30 px-2 py-1 rounded text-gray-500 block mb-4 font-mono w-full overflow-hidden text-ellipsis">
                            Digest: {error.digest}
                        </code>
                    )}
                </div>
                <div className="flex gap-3 justify-center">
                    <Button onClick={() => reset()} variant="secondary">
                        Try again
                    </Button>
                    <Button onClick={() => window.location.href = "/"} variant="ghost">
                        Go Home
                    </Button>
                </div>
            </div>
        </div>
    );
}

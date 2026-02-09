import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FeatureGateOverlayProps {
    children: React.ReactNode;
    isLocked: boolean;
    title?: string;
    description?: string;
}

export function FeatureGateOverlay({
    children,
    isLocked,
    title = "Pro Feature Locked",
    description = "Upgrade to the Pro plan to unlock this advanced feature."
}: FeatureGateOverlayProps) {
    if (!isLocked) return <>{children}</>;

    return (
        <div className="relative w-full h-full min-h-[300px]">
            {/* Blurred Content */}
            <div className="absolute inset-0 filter blur-sm opacity-50 pointer-events-none select-none overflow-hidden">
                {children}
            </div>

            {/* Overlay */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/5 backdrop-blur-[2px] p-6 text-center animate-in fade-in duration-500">
                <div className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-xl shadow-2xl max-w-md w-full flex flex-col items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-full">
                        <Lock className="w-8 h-8 text-amber-500" />
                    </div>

                    <div className="space-y-1">
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <p className="text-zinc-400 text-sm">{description}</p>
                    </div>

                    <Link
                        href="/dashboard/billing"
                        className={cn(
                            buttonVariants.primary,
                            "w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold border-0 no-underline"
                        )}
                    >
                        Upgrade to Unlock
                    </Link>
                </div>
            </div>
        </div>
    );
}

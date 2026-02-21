"use client";

import { motion } from "framer-motion";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";

interface EnterpriseFeatureGateProps {
    children: React.ReactNode;
    isPro: boolean;
    featureName: string;
    description: string;
}

export function EnterpriseFeatureGate({ children, isPro, featureName, description }: EnterpriseFeatureGateProps) {
    const router = useRouter();

    if (isPro) return <>{children}</>;

    return (
        <div className="relative overflow-hidden rounded-xl border border-white/5 group">
            <div className="blur-sm pointer-events-none select-none opacity-50 grayscale transition-all duration-500 group-hover:blur-md group-hover:scale-[1.01]">
                {children}
            </div>

            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center p-6 max-w-sm bg-black/80 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl"
                >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400/20 to-yellow-600/20 flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
                        <Lock className="w-6 h-6 text-amber-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{featureName}</h3>
                    <p className="text-sm text-gray-400 mb-6">{description}</p>
                    <Button
                        onClick={() => router.push("/dashboard/billing")}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Upgrade to Enterprise
                    </Button>
                </motion.div>
            </div>
        </div>
    );
}

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Crown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
}

export default function UpgradeModal({ isOpen, onClose, title = "Limit Reached", description = "You've reached the limits of your current plan." }: UpgradeModalProps) {
    const router = useRouter();

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-lg bg-[#0A0A0B] border border-primary/20 rounded-3xl shadow-2xl overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-32 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 text-white/40 hover:text-white rounded-full hover:bg-white/5 transition-colors z-20"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="p-8 relative z-10 text-center space-y-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 mx-auto flex items-center justify-center shadow-lg shadow-primary/20">
                            <Crown className="w-8 h-8 text-white" />
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
                            <p className="text-muted-foreground">{description}</p>
                        </div>

                        <div className="bg-white/5 rounded-2xl p-6 border border-white/5 space-y-4">
                            <h3 className="font-semibold text-white flex items-center justify-center gap-2">
                                <Zap className="w-4 h-4 text-amber-400" />
                                Unlock Pro Features
                            </h3>
                            <ul className="space-y-3 text-left">
                                <li className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                    <span>Unlimited file analysis & uploads</span>
                                </li>
                                <li className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                    <span>Advanced architecture & security audits</span>
                                </li>
                                <li className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                    <span>Smart refactoring suggestions</span>
                                </li>
                                <li className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                    <span>Team collaboration tools</span>
                                </li>
                            </ul>
                        </div>

                        <div className="grid gap-3">
                            <Button
                                onClick={() => router.push("/dashboard/billing")}
                                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/25"
                            >
                                Upgrade Now
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="w-full text-muted-foreground hover:text-white"
                            >
                                Maybe Later
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

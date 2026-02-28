"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, X, PartyPopper, Share2, UploadCloud, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TrackedLink } from "@/components/marketing/tracked-link";

interface OnboardingState {
    steps: {
        hasAccount: boolean;
        hasScanned: boolean;
        hasShared: boolean;
        hasUpgraded: boolean;
    };
    isDismissed: boolean;
}

interface OnboardingChecklistProps {
    onboardingContext?: {
        intent: "signup" | "trial";
        plan: "starter" | "pro" | "team" | null;
        source: string | null;
    };
}

export function OnboardingChecklist({ onboardingContext }: OnboardingChecklistProps) {
    const [state, setState] = useState<OnboardingState | null>(null);
    const [loading, setLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const fetchState = async () => {
            try {
                const res = await fetch("/api/onboarding");
                if (res.ok) {
                    const data = await res.json();
                    setState(data);
                    if (data.isDismissed) setIsVisible(false);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchState();
    }, []);

    const handleDismiss = async () => {
        setIsVisible(false);
        try {
            await fetch("/api/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dismissed: true,
                    intent: onboardingContext?.intent,
                    plan: onboardingContext?.plan ?? undefined,
                    source: onboardingContext?.source ?? undefined,
                }),
            });
        } catch (e) {
            console.error(e);
        }
    };

    if (loading || !state || !isVisible) return null;

    const billingHref = (() => {
        const query = new URLSearchParams();

        if (onboardingContext?.intent === "trial") {
            query.set("intent", "trial");
        }

        if (onboardingContext?.plan) {
            query.set("plan", onboardingContext.plan);
        }

        if (onboardingContext?.source) {
            query.set("source", onboardingContext.source);
        }

        return query.toString().length > 0 ? `/dashboard/billing?${query.toString()}` : "/dashboard/billing";
    })();

    const steps = [
        {
            id: "hasAccount",
            label: "Create your account",
            description: "You're all set up!",
            completed: state.steps.hasAccount,
            icon: CheckCircle2,
            action: null
        },
        {
            id: "hasScanned",
            label: "Run your first scan",
            description: "Upload a file or import a repo to analyze code.",
            completed: state.steps.hasScanned,
            icon: UploadCloud,
            action: <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => document.getElementById("upload-trigger")?.click()}>Scan Now</Button>
        },
        {
            id: "hasShared",
            label: "Share a document",
            description: "Make a documentation file public and share the link.",
            completed: state.steps.hasShared,
            icon: Share2,
            action: <span className="text-xs text-muted-foreground">Select a file &rarr; Click &quot;Share&quot;</span>
        },
        {
            id: "hasUpgraded",
            label: onboardingContext?.intent === "trial" ? "Activate Trial Plan" : "Start Free Trial",
            description: onboardingContext?.plan
                ? `Unlock advanced AI analysis with the ${onboardingContext.plan} plan.`
                : "Unlock advanced AI analysis and team features.",
            completed: state.steps.hasUpgraded,
            icon: CreditCard,
            action: (
                <TrackedLink
                    href={billingHref}
                    eventName="trial_upgrade_cta_click"
                    location="onboarding_checklist_upgrade"
                    variant={onboardingContext?.intent === "trial" ? "trial_intent_v1" : "control"}
                >
                    <Button size="sm" variant="primary" className="h-7 text-xs border-0">
                        {onboardingContext?.intent === "trial" ? "Activate Trial" : "Upgrade"}
                    </Button>
                </TrackedLink>
            )
        }
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const progress = (completedCount / steps.length) * 100;

    if (completedCount === steps.length) return null; // Hide if all done

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-8"
                >
                    <div className="glass-card bg-gradient-to-r from-indigo-950/40 to-black/40 border border-indigo-500/20 p-6 rounded-2xl relative overflow-hidden">
                        {/* Background Splashes */}


                        <div className="flex items-start justify-between mb-6 relative z-10">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <PartyPopper className="w-5 h-5 text-yellow-400" />
                                    {onboardingContext?.intent === "trial" ? "Trial Activation" : "Getting Started"}
                                </h3>
                                <p className="text-muted-foreground text-sm mt-1">
                                    {onboardingContext?.intent === "trial"
                                        ? "Complete these steps to unlock your full trial value quickly."
                                        : "Complete these steps to get the most out of DocuMint AI."}
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={handleDismiss} className="text-white/40 hover:text-white">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="flex items-center gap-4 mb-6 relative z-10">
                            <Progress value={progress} className="h-2 bg-white/10" />
                            <span className="text-xs font-mono text-indigo-300 whitespace-nowrap">{completedCount}/{steps.length} Done</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
                            {steps.map((step) => (
                                <div
                                    key={step.id}
                                    className={`p-4 rounded-xl border transition-all ${step.completed
                                        ? "bg-green-500/5 border-green-500/20"
                                        : "bg-white/5 border-white/5 hover:border-white/10"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`p-1.5 rounded-lg ${step.completed ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/60"}`}>
                                            <step.icon className="w-4 h-4" />
                                        </div>
                                        {step.completed ? (
                                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                                        ) : (
                                            <Circle className="w-5 h-5 text-white/20" />
                                        )}
                                    </div>
                                    <h4 className={`font-semibold text-sm ${step.completed ? "text-green-100" : "text-white"}`}>
                                        {step.label}
                                    </h4>
                                    <p className="text-xs text-white/50 mt-1 mb-3 line-clamp-2 min-h-[2.5em]">
                                        {step.description}
                                    </p>
                                    {!step.completed && step.action && (
                                        <div className="mt-auto">
                                            {step.action}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

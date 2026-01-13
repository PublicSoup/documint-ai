"use client";

import React, { useEffect, useState } from "react";
import { CreditCard, Zap, CheckCircle2, Loader2, BarChart3, Crown } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface UsageData {
    filesProcessed: number;
    filesLimit: number;
    plan: string;
    validUntil: string;
}

export default function Billing() {
    const { toast } = useToast();
    const { data: session } = useSession();
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [upgrading, setUpgrading] = useState<string | null>(null);

    useEffect(() => {
        fetchUsage();
    }, []);

    const fetchUsage = async () => {
        try {
            const res = await fetch("/api/usage");
            if (res.ok) {
                const data = await res.json();
                setUsage(data);
            }
        } catch (error) {
            console.error("Failed to fetch usage:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpgrade = async (tier: string) => {
        setUpgrading(tier);
        try {
            const res = await fetch(`/api/checkout?tier=${tier}`, {
                method: "POST",
            });
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                }
            } else {
                const errorData = await res.json().catch(() => ({}));
                toast(errorData.error || "Failed to start checkout. Please try again.", "error");
            }
        } catch (error) {
            console.error("Checkout error:", error);
            toast("Failed to start checkout.", "error");
        } finally {
            setUpgrading(null);
        }
    };

    const handleManageBilling = async () => {
        try {
            const res = await fetch("/api/customer-portal", {
                method: "POST",
            });
            const data = await res.json();

            if (res.ok && data.url) {
                window.location.href = data.url;
            } else {
                toast(data.error || "Error connecting to billing", "error");
            }
        } catch (error) {
            console.error("Portal error:", error);
            toast("Connection failed. Please check your network.", "error");
        }
    };

    const plans = [
        {
            id: "starter",
            name: "Starter",
            price: "$19",
            limit: "100 files/mo",
            features: ["All languages", "Standard Documentation", "Basic Quality Scoring"],
        },
        {
            id: "pro",
            name: "Pro",
            price: "$29",
            limit: "1,000 files/mo",
            features: ["Enterprise Diagnostic Engine", "Security & Secret Audit", "Architecture Alerts", "Refactoring Suggestions"],
            popular: true,
        },
        {
            id: "team",
            name: "Team",
            price: "$99",
            limit: "10,000 files/mo",
            features: ["Onboarding Time Metrics", "Performance Profiling", "Team Collab", "Custom API Access"],
        },
    ];

    const usagePercentage = usage ? Math.min((usage.filesProcessed / usage.filesLimit) * 100, 100) : 0;

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Billing & Subscription</h1>
                <p className="text-muted-foreground">Manage your plan and usage limits.</p>
            </header>

            {/* Current Plan & Usage Card */}
            <Card className="glass-card bg-gradient-to-br from-primary/10 to-purple-900/10 border-primary/20">
                <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-8">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 rounded-3xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                                <Zap className="text-primary w-10 h-10" />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Current Plan</div>
                                <h2 className="text-3xl font-bold text-white mb-1">{usage?.plan || "Free Tier"}</h2>
                                <p className="text-white/60 text-sm">
                                    {usage?.validUntil ? `Valid until ${usage.validUntil}` : "Basic feature set"}
                                </p>
                            </div>
                        </div>
                        {usage?.plan && usage.plan !== "Free Tier" && (
                            <Button
                                onClick={handleManageBilling}
                                className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
                                leftIcon={<CreditCard className="w-4 h-4" />}
                            >
                                Manage Subscription
                            </Button>
                        )}
                    </div>

                    {/* Usage Bar */}
                    <div className="pt-6 border-t border-white/10">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium text-white/80">Monthly File Usage</span>
                            </div>
                            <span className="text-sm font-mono text-white/80">
                                {loading ? (
                                    <Loader2 className="w-3 h-3 animate-spin inline" />
                                ) : (
                                    `${usage?.filesProcessed || 0} / ${usage?.filesLimit || 10}`
                                )}
                            </span>
                        </div>
                        <div className="w-full bg-black/40 h-4 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ease-out ${usagePercentage > 90 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                                    usagePercentage > 60 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-primary shadow-[0_0_10px_rgba(124,58,237,0.5)]'
                                    }`}
                                style={{ width: `${usagePercentage}%` }}
                            />
                        </div>
                        {usagePercentage > 80 && (
                            <p className="text-sm text-red-400 mt-2 animate-pulse">
                                ⚠️ You're approaching your limit. Consider upgrading for more capacity.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Plan Cards */}
            <div>
                <h2 className="text-xl font-bold text-white mb-6">Available Plans</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                        <Card
                            key={plan.id}
                            className={`flex flex-col relative overflow-hidden transition-all duration-300 hover:scale-105 ${plan.popular ? 'border-primary/50 bg-primary/5 shadow-2xl shadow-primary/10' : 'bg-black/20 hover:bg-black/30'}`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary blur-[40px] opacity-40"></div>
                            )}

                            <CardHeader>
                                {plan.popular && (
                                    <div className="text-xs font-bold text-white bg-primary px-3 py-1 rounded-full w-max mb-2 shadow-lg shadow-primary/20">
                                        MOST POPULAR
                                    </div>
                                )}
                                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                                <div className="mt-2">
                                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                                    <span className="text-white/40 text-sm"> / month</span>
                                </div>
                            </CardHeader>

                            <CardContent className="flex-grow flex flex-col">
                                <ul className="space-y-4 mb-8 flex-grow">
                                    <li className="flex items-center gap-3 text-sm text-white">
                                        <div className="p-1 rounded-full bg-primary/20">
                                            <Zap className="w-3 h-3 text-primary" />
                                        </div>
                                        <span className="font-bold">{plan.limit}</span>
                                    </li>
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-center gap-3 text-sm text-white/70">
                                            <CheckCircle2 className="w-4 h-4 text-green-400/80 flex-shrink-0" />
                                            {feature}
                                        </li>
                                    ))}
                                    {plan.id !== "starter" && (
                                        <li className="flex items-center gap-3 text-[10px] text-primary font-bold uppercase tracking-widest mt-2 bg-primary/5 p-2 rounded-lg border border-primary/20">
                                            <Crown className="w-3 h-3 translate-y-[-1px]" />
                                            Includes Logic Depth AI
                                        </li>
                                    )}
                                </ul>

                                <Button
                                    onClick={() => handleUpgrade(plan.id)}
                                    disabled={upgrading === plan.id}
                                    variant={plan.popular ? "primary" : "outline"}
                                    isLoading={upgrading === plan.id}
                                    className={`w-full ${plan.popular ? "shadow-lg shadow-primary/20" : "border-white/10 hover:bg-white/5"}`}
                                >
                                    {upgrading === plan.id ? "Processing..." : `Upgrade to ${plan.name}`}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Footer Info */}
            <div className="mt-8 text-center text-sm text-white/30">
                <p>All plans include automatic documentation with Qwen 2.5 Coder AI.</p>
                <p className="mt-1">Annual billing saves 20%. Contact us for enterprise pricing.</p>
            </div>
        </div>
    );
}

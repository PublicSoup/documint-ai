"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Mail } from "lucide-react";
import { motion } from "framer-motion";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            if (res.ok) {
                setSubmitted(true);
            } else {
                const data = await res.json();
                setError(data.error || "Something went wrong");
            }
        } catch {
            setError("Failed to send request. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black" />
            <div className="absolute top-0 left-0 p-32 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

            <div className="w-full max-w-md p-8 relative z-10">
                <Link href="/auth/signin" className="inline-flex items-center text-sm text-white/50 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Sign In
                </Link>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent mb-2">
                        Reset Password
                    </h1>
                    <p className="text-white/50">
                        Enter your email address and we'll send you a link to reset your password.
                    </p>
                </div>

                {submitted ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center"
                    >
                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-green-400">
                            <Check className="w-6 h-6" />
                        </div>
                        <h3 className="text-green-400 font-semibold mb-2">Check your inbox</h3>
                        <p className="text-sm text-green-500/60 mb-6">
                            We've sent a password reset link to <strong>{email}</strong>.
                        </p>
                        <Button
                            variant="outline"
                            className="w-full border-green-500/20 text-green-400 hover:bg-green-500/10"
                            onClick={() => {
                                setSubmitted(false);
                                setEmail("");
                            }}
                        >
                            Send another email
                        </Button>
                    </motion.div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-white/70">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-white/30" />
                                <Input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 glass-input"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <Button type="submit" className="w-full h-11" isLoading={loading}>
                            Send Reset Link
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}

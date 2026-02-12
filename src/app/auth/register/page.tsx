"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileCode2, Sparkles, Github, ArrowRight, User, Mail, Lock } from "lucide-react";
import { signIn, getProviders, type ClientSafeProvider } from "next-auth/react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    // OAuth buttons are always shown
    const showSocial = true;

    /* ... handlers ... */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            if (res.ok) {
                toast("Account created! Redirecting to login...", "success");
                setTimeout(() => router.push("/auth/login"), 1500);
            } else {
                const data = await res.json();
                // Show specific validation errors if available
                if (data.details?.errors && Array.isArray(data.details.errors)) {
                    const messages = data.details.errors.map((e: any) => e.message).join(". ");
                    toast(messages || "Registration failed", "error");
                } else {
                    toast(data.message || "Registration failed", "error");
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#030014] px-4 selection:bg-primary/30 relative overflow-hidden">
            {/* Animated background highlights */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full animate-float" />

            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-10">
                    <Link href="/" className="inline-flex items-center gap-2 group transition-transform hover:scale-105">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20">
                            <Sparkles className="w-7 h-7 text-white" />
                        </div>
                        <span className="text-2xl font-black tracking-tighter text-white">
                            DOCUMINT <span className="text-primary italic">AI</span>
                        </span>
                    </Link>
                </div>

                <div className="glass-card p-8 rounded-[2.5rem] border border-white/10 shadow-2xl relative">
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-600/10 blur-3xl -z-10" />

                    <div className="mb-8 text-center">
                        <h2 className="text-3xl font-bold text-white tracking-tight">Create workspace</h2>
                        <p className="mt-2 text-sm text-white/50">Join the elite circle of AI-driven developers</p>
                    </div>

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Full Name</label>
                                <div className="relative group">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                                    <input
                                        type="text"
                                        required
                                        className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                                        placeholder="John Doe"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Work Email</label>
                                <div className="relative group">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                                    <input
                                        type="email"
                                        required
                                        className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                                        placeholder="john@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Secure Password</label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                                    <input
                                        type="password"
                                        required
                                        minLength={8}
                                        className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                                <p className="text-[10px] text-white/25 ml-1 mt-1">Min 8 chars • 1 uppercase • 1 lowercase • 1 number</p>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 bg-white text-black hover:bg-white/90 rounded-xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 mt-4"
                        >
                            {loading ? "Creating..." : "Launch Account"}
                            {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                        </Button>
                    </form>

                    {/* ALWAYS show OAuth section */}
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/5"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] font-black tracking-[0.2em] uppercase">
                            <span className="px-4 bg-[#030014] text-white/20">Fast Track</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Button
                            variant="outline"
                            onClick={() => signIn("auth0", { callbackUrl: "/dashboard" }, { connection: "google-oauth2" })}
                            className="w-full h-11 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl gap-2 font-medium"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Join with Google
                        </Button>

                        <Button
                            variant="outline"
                            onClick={() => signIn("auth0", { callbackUrl: "/dashboard" }, { connection: "github" })}
                            className="w-full h-11 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl gap-2 font-medium"
                        >
                            <Github className="w-4 h-4" />
                            Join with GitHub
                        </Button>
                    </div>
                </div>

                <p className="mt-8 text-center text-sm text-white/40">
                    Already a member?{" "}
                    <Link href="/auth/login" className="font-bold text-primary hover:text-primary/10 transition-colors">
                        Sign In
                    </Link>
                </p>
            </div>
        </div>
    );
}

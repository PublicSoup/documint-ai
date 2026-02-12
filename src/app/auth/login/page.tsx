"use client";

import { signIn, getProviders, type ClientSafeProvider } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileCode2, Sparkles, Github, ArrowRight, Mail, Lock } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
    const { toast } = useToast();
    const router = useRouter();
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
            const res = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (res?.error) {
                toast(res.error === "CredentialsSignin" ? "Invalid email or password" : `Authentication Error: ${res.error}`, "error");
            } else {
                router.push("/dashboard");
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

                <div className="glass-card p-8 rounded-[2rem] border border-white/10 shadow-2xl relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -z-10" />

                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-white tracking-tight">Welcome back</h2>
                        <p className="mt-2 text-sm text-white/50">Enter your credentials to access your workspace</p>
                    </div>
p-[[]]
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">
                                    Email address
                                </label>
                                <div className="relative group">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-primary transition-colors" />
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all font-medium"
                                        placeholder="name@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <label htmlFor="password" className="text-xs font-black uppercase tracking-widest text-white/40">
                                        Password
                                    </label>
                                    <Link
                                        href="/auth/forgot-password"
                                        className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                                    >
                                        Forgot?
                                    </Link>
                                </div>
                                <div className="relative group">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-primary transition-colors" />
                                    <input
                                        id="password"
                                        type="password"
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20 font-bold transition-all disabled:opacity-50"
                        >
                            {loading ? "Authenticating..." : "Sign In"}
                            {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                        </Button>
                    </form>

                    {/* ALWAYS show OAuth section */}
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/5"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
                            <span className="px-4 bg-[#030014]/50 text-white/20">Access via Social</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Button
                            variant="outline"
                            onClick={() => signIn("auth0", { callbackUrl: "/dashboard" }, { connection: "google-oauth2" })}
                            className="h-11 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl gap-2 font-medium"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Sign in with Google
                        </Button>

                        <Button
                            variant="outline"
                            onClick={() => signIn("auth0", { callbackUrl: "/dashboard" }, { connection: "github" })}
                            className="h-11 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl gap-2 font-medium"
                        >
                            <Github className="w-4 h-4" />
                            Sign in with GitHub
                        </Button>
                    </div>

                    <div className="mt-4">
                        <Button
                            variant="ghost"
                            onClick={() => signIn("auth0", { callbackUrl: "/dashboard" })}
                            className="w-full h-10 border border-white/5 bg-white/5 hover:bg-white/10 text-white/60 text-xs rounded-xl gap-2 font-medium"
                        >
                            <Mail className="w-4 h-4 mr-2" />
                            Sign in with Email Link
                        </Button>
                    </div>
                </div>

                <p className="mt-8 text-center text-sm text-white/40">
                    New to DocuMint?{" "}
                    <Link href="/auth/register" className="font-bold text-primary hover:text-primary/80 transition-colors">
                        Create an account
                    </Link>
                </p>
            </div>
        </div>
    );
}

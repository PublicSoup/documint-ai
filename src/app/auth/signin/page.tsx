"use client";

import React from "react";
import { signIn } from "next-auth/react";
import { FileCode2, Github, Mail } from "lucide-react";
import { motion } from "framer-motion";

export default function SignIn() {
    return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg aspect-square bg-primary/20 blur-[120px] rounded-full -z-10 opacity-30" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md glass p-8 rounded-3xl border border-white/5 shadow-2xl"
            >
                <div className="flex flex-col items-center text-center mb-10">
                    <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-6">
                        <FileCode2 className="text-white w-7 h-7" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
                    <p className="text-white/40">Sign in to your DocuMint AI account</p>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all"
                    >
                        <Github className="w-5 h-5" />
                        Continue with GitHub
                    </button>

                    <button
                        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 glass text-white font-bold rounded-xl hover:bg-white/5 transition-all"
                    >
                        <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale invert" alt="Google" />
                        Continue with Google
                    </button>
                </div>

                <div className="mt-8 flex items-center gap-4 text-white/10 uppercase text-[10px] font-bold tracking-widest">
                    <div className="h-px flex-grow bg-white/5" />
                    <span>Security Guaranteed</span>
                    <div className="h-px flex-grow bg-white/5" />
                </div>

                <p className="mt-8 text-center text-xs text-white/30 px-6">
                    By continuing, you agree to DocuMint AI's <a href="#" className="underline">Terms of Service</a> and <a href="#" className="underline">Privacy Policy</a>.
                </p>
            </motion.div>
        </div>
    );
}

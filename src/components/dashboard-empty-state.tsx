"use client";

import { motion } from "framer-motion";
import FileUpload from "./file-upload";
import GitHubImport from "./github-import";
import { Card } from "./ui/card";
import { Sparkles, Code2, GitBranch, Zap } from "lucide-react";

interface DashboardEmptyStateProps {
    teamId?: string;
    isPro: boolean;
}

export function DashboardEmptyState({ teamId, isPro }: DashboardEmptyStateProps) {
    return (
        <div className="h-full flex flex-col items-center justify-center p-6 space-y-8 overflow-y-auto custom-scrollbar">
            <div className="text-center space-y-4 max-w-2xl mx-auto">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="relative inline-block"
                >
                    <Sparkles className="w-16 h-16 text-primary relative z-10 mx-auto" />
                </motion.div>

                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <h2 className="text-3xl font-bold text-white">
                        Welcome to DocuMint AI
                    </h2>
                    <p className="text-zinc-400 mt-2 text-lg">
                        Your intelligent documentation engine. Connect your codebase to get started.
                    </p>
                </motion.div>
            </div>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="w-full max-w-3xl grid gap-6"
            >
                <div className="bg-white/5 border border-white/10 rounded-2xl p-1">
                    <div className="grid grid-cols-3 gap-2 p-1 bg-black/20 rounded-xl mb-6">
                        <FileUpload
                            teamId={teamId}
                            isPro={isPro}
                            customTrigger={
                                <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary/10 text-primary font-bold text-sm transition-all border border-primary/20 hover:bg-primary/20 hover:scale-[1.02]">
                                    <Code2 className="w-4 h-4" />
                                    Upload Code
                                </button>
                            }
                        />

                        <button
                            onClick={async () => {
                                const { createDemoProject } = await import("@/app/dashboard/client-actions");
                                await createDemoProject(teamId);
                                window.location.href = "/dashboard?demo=true";
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-bold text-sm transition-all hover:scale-[1.02]"
                        >
                            <Zap className="w-4 h-4 text-yellow-500" />
                            Try Demo
                        </button>

                        <GitHubImport
                            customTrigger={
                                <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-bold text-sm transition-all hover:scale-[1.02]">
                                    <GitBranch className="w-4 h-4" />
                                    GitHub Repo
                                </button>
                            }
                        />
                    </div>

                    <div className="px-4 pb-4">
                        <FileUpload teamId={teamId} isPro={isPro} />
                    </div>
                </div>

                {!isPro && (
                    <div className="bg-gradient-to-r from-primary/10 to-purple-600/10 border border-primary/20 rounded-2xl p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                                Unlock Enterprise Grade
                            </h3>
                            <p className="text-xs text-zinc-400">
                                Get access to the Project Graph, Audit Logs, and Autonomous Agents.
                            </p>
                        </div>
                        <button className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 transition-colors">
                            Upgrade
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-4 bg-white/5 border-white/5">
                        <Zap className="w-5 h-5 text-amber-400 mb-2" />
                        <h3 className="font-bold text-sm text-white">Instant Analysis</h3>
                        <p className="text-xs text-zinc-400 mt-1">Get documentation, complexity scores, and security insights in seconds.</p>
                    </Card>
                    <Card className="p-4 bg-white/5 border-white/5">
                        <GitBranch className="w-5 h-5 text-blue-400 mb-2" />
                        <h3 className="font-bold text-sm text-white">Deep Context</h3>
                        <p className="text-xs text-zinc-400 mt-1">AI understands cross-file dependencies and architectural patterns.</p>
                    </Card>
                    <Card className="p-4 bg-white/5 border-white/5">
                        <Sparkles className="w-5 h-5 text-purple-400 mb-2" />
                        <h3 className="font-bold text-sm text-white">Pro Suggestions</h3>
                        <p className="text-xs text-zinc-400 mt-1">Receive actionable refactoring tips and optimization advice.</p>
                    </Card>
                </div>
            </motion.div>
        </div>
    );
}

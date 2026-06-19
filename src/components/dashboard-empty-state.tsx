"use client";

import { motion } from "framer-motion";
import { Code2, GitBranch, Network, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

import FileUpload from "./file-upload";
import GitHubImport from "./github-import";
import { Card } from "./ui/card";

interface DashboardEmptyStateProps {
  teamId?: string;
  isPro: boolean;
}

const capabilityCards = [
  {
    title: "Instant analysis",
    description: "Generate documentation, complexity signals, and operational coverage in seconds.",
    icon: Zap,
    tone: "text-amber-300",
  },
  {
    title: "Deep context",
    description: "Map cross-file dependencies and architecture patterns across imported codebases.",
    icon: Network,
    tone: "text-blue-300",
  },
  {
    title: "Governed reviews",
    description: "Promote verified docs, audit logs, and remediation queues for team workflows.",
    icon: ShieldCheck,
    tone: "text-emerald-300",
  },
] as const;

export function DashboardEmptyState({ teamId, isPro }: DashboardEmptyStateProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d12]/95 shadow-2xl shadow-black/30">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative grid gap-8 p-5 md:p-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <div className="space-y-5">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.45 }}
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New workspace
            </motion.div>

            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="max-w-3xl"
            >
              <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Bring your first codebase online
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/55 md:text-base">
                Start with an upload, a demo project, or a GitHub repository to
                activate DocuMint’s documentation control plane.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-white/10 bg-black/25 p-2"
          >
            <div className="grid gap-2 md:grid-cols-3">
              <FileUpload
                teamId={teamId}
                isPro={isPro}
                customTrigger={
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-bold text-primary transition-all hover:bg-primary/20">
                    <Code2 className="h-4 w-4" />
                    Upload code
                  </button>
                }
              />

              <button
                onClick={async () => {
                  const { createDemoProject } = await import("@/app/dashboard/client-actions");
                  await createDemoProject(teamId);
                  window.location.href = "/dashboard?demo=true";
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/65 transition-all hover:bg-white/[0.08] hover:text-white"
              >
                <Zap className="h-4 w-4 text-amber-300" />
                Try demo
              </button>

              <GitHubImport
                customTrigger={
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/65 transition-all hover:bg-white/[0.08] hover:text-white">
                    <GitBranch className="h-4 w-4" />
                    GitHub repo
                  </button>
                }
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {capabilityCards.map(({ title, description, icon: Icon, tone }) => (
              <Card
                key={title}
                className="border-white/10 bg-black/20 p-4 shadow-none"
                hoverEffect={false}
              >
                <Icon className={`mb-3 h-5 w-5 ${tone}`} />
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-white/45">{description}</p>
              </Card>
            ))}
          </div>
        </div>

        <aside className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                Activation path
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white">Enterprise setup</h3>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Ready
            </span>
          </div>

          <div className="space-y-3 text-sm">
            {["Import codebase", "Generate documentation", "Review hotspots", "Verify and monitor"].map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[10px] font-bold text-primary">
                  {index + 1}
                </span>
                <span className="text-white/65">{step}</span>
              </div>
            ))}
          </div>

          {!isPro && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-primary" />
                Unlock enterprise controls
              </div>
              <p className="mt-2 text-xs leading-5 text-white/45">
                Project graph, audit logs, and advanced team workflows unlock on paid plans.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-white px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-white/90"
              >
                View plans
              </Link>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

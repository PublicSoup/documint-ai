import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listCodebasesForUser } from "@/lib/codebases/queries";
import { getCodebasePlanLimits } from "@/lib/codebases/plan-limits";
import { getUserSubscription } from "@/lib/subscription";
import { CodebasesShell } from "./codebases-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FolderGit2, Github, Sparkles } from "lucide-react";
import Link from "next/link";

/**
 * Server-rendered entry point for the unified Codebases view.
 *
 * Replaces the old "Command Center" placeholder and the "Sync Status"
 * stub on the dashboard. Renders the data the client shell needs; the
 * shell handles sort/filter interactions and the GitHub sync button.
 *
 * Feature flag: this component is rendered unconditionally; the parent
 * dashboard page is responsible for showing it (or the legacy Command
 * Center) based on the rollout flag.
 */
export async function CodebasesView({
    teamId,
    source,
    sort,
    includeArchived,
}: {
    teamId?: string | null;
    source?: "LOCAL" | "GITHUB";
    sort?: "recent" | "name" | "size";
    includeArchived?: boolean;
}) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;

    const [result, subscription] = await Promise.all([
        listCodebasesForUser(
            session.user.id,
            { source, sort, includeArchived: includeArchived ?? false },
            { teamId: teamId ?? null, requesterId: session.user.id },
        ),
        getUserSubscription(session.user.id).catch(() => null),
    ]);

    const limits = getCodebasePlanLimits(subscription?.plan ?? "free");
    const cap = limits.maxCodebases;
    const used = result.totalCount;

    return (
        <div className="space-y-4">
            <header className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">
                        <FolderGit2 className="w-5 h-5 text-primary" />
                        Your Codebases
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                        Local projects and GitHub-synced repos, all in one place.
                    </p>
                </div>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-black">
                    {cap === -1 ? (
                        <span className="text-emerald-400/80">Unlimited codebases</span>
                    ) : (
                        <span className="text-white/50">
                            {used} / {cap} used
                        </span>
                    )}
                </div>
            </header>

            {result.items.length === 0 ? (
                <CodebasesEmptyState hasGithubConnection={result.items.some((i) => i.source === "GITHUB")} />
            ) : (
                <CodebasesShell
                    initialItems={result.items.map((c) => ({
                        ...c,
                        lastActivityAt: c.lastActivityAt.toISOString(),
                        archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
                    }))}
                    canSyncGithub={limits.canSyncGithub}
                    teamId={teamId ?? null}
                />
            )}

            <CodebasesPlanHint
                plan={subscription?.plan ?? "free"}
                used={used}
                cap={cap}
                canSyncGithub={limits.canSyncGithub}
            />
        </div>
    );
}

function CodebasesEmptyState({ hasGithubConnection }: { hasGithubConnection: boolean }) {
    return (
        <Card className="glass-card border-white/5">
            <CardContent className="p-10 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                    <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-white">No codebases yet</h3>
                <p className="text-sm text-white/60 max-w-md mx-auto">
                    Create your first local project, or connect GitHub to import a repository.
                    Both will appear here, side by side.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                    <Link
                        href="/dashboard?intent=upload"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
                    >
                        Create a codebase
                    </Link>
                    {!hasGithubConnection && (
                        <Link
                            href="/dashboard/settings"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
                        >
                            <Github className="w-4 h-4" />
                            Connect GitHub
                        </Link>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function CodebasesPlanHint({
    plan,
    used,
    cap,
    canSyncGithub,
}: {
    plan: "free" | "starter" | "pro" | "team";
    used: number;
    cap: number;
    canSyncGithub: boolean;
}) {
    if (plan === "team") return null;
    if (cap !== -1 && used >= cap) {
        return (
            <p className="text-[11px] text-amber-400/80 text-center">
                You've reached the {plan} plan's codebase cap ({cap}).{" "}
                <Link href="/dashboard/billing" className="underline">
                    Upgrade
                </Link>{" "}
                to add more.
            </p>
        );
    }
    if (!canSyncGithub) {
        return (
            <p className="text-[11px] text-white/40 text-center">
                GitHub sync is available on Starter and above.{" "}
                <Link href="/dashboard/billing" className="underline hover:text-white/60">
                    See plans
                </Link>
            </p>
        );
    }
    return null;
}
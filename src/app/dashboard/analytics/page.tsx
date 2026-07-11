import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BarChart3, TrendingUp, Users, FileText, CheckSquare, Eye, Crown, ArrowUpRight, AlertCircle } from "lucide-react";
import Link from 'next/link';
import { hasFeatureAccess } from "@/lib/subscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalyticsCharts } from "@/components/analytics-charts";
import { getAnalyticsData, getMarketingCtaAnalytics } from "@/lib/analytics";
import { checkTeamPermission } from "@/lib/permissions";

export const metadata = {
    title: "Analytics | DocuMint AI",
    description: "Documentation health and usage metrics"
};

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{ teamId?: string }>;
}) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) redirect("/");

    const { teamId } = await searchParams;

    // Gate: Analytics is Pro Feature
    const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-6 animate-fade-in">
                <div className="w-20 h-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mb-4 relative shadow-[0_0_30px_-5px_rgba(124,58,237,0.3)]">
                    <BarChart3 className="w-10 h-10" />
                    <Crown className="w-6 h-6 absolute -top-2 -right-2 text-amber-500 fill-amber-500" />
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Unlock Advanced Analytics</h2>
                <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
                    Gain deep insights into your documentation coverage, team activity, and usage trends.
                </p>
                <Link href="/dashboard/settings?tab=billing"
                    aria-label="Upgrade to Pro and unlock advanced analytics">
                    <Button size="lg" className="px-8 shadow-lg shadow-primary/20">
                        Upgrade to Pro
                        <Crown className="w-4 h-4 ml-2 text-amber-200" />
                    </Button>
                </Link>
            </div>
        );
    }

    if (teamId) {
        const canViewTeam = await checkTeamPermission(session.user.id, teamId, "view");
        if (!canViewTeam) {
            redirect("/dashboard/analytics");
        }
    }

    // Fetch data using the helper
    const [data, marketingCtas] = await Promise.all([
        getAnalyticsData(session.user.id, teamId),
        getMarketingCtaAnalytics(session.user.id, 30),
    ]);

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-10">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-white tracking-tight">Analytics Dashboard</h1>
                <p className="text-muted-foreground">Overview of your documentation ecosystem.</p>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    label="Total Files"
                    value={data.overview.totalFiles.toString()}
                    icon={<FileText className="w-5 h-5 text-blue-400" />}
                    bg="bg-blue-500/10"
                />
                <StatCard
                    label="Doc Coverage"
                    value={`${data.coverage.percentage}%`}
                    icon={<TrendingUp className="w-5 h-5 text-green-400" />}
                    bg="bg-green-500/10"
                />
                <StatCard
                    label="Active Velocity"
                    value={`+${data.overview.velocity.score}%`}
                    icon={<BarChart3 className="w-5 h-5 text-amber-400" />}
                    bg="bg-amber-500/10"
                />
                <StatCard
                    label="Total Views"
                    value={data.overview.totalViews.toString()}
                    icon={<Eye className="w-5 h-5 text-pink-400" />}
                    bg="bg-pink-500/10"
                />
            </div>

            {/* Marketing CTA Signals */}
            <Card className="border-white/5 bg-black/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                        Landing CTA Performance (Last 30 Days)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {marketingCtas.ctas.length === 0 ? (
                        <div className="text-sm text-muted-foreground border border-dashed border-white/10 rounded-xl p-6 bg-white/5">
                            No CTA event data yet. Trigger a few landing-page clicks to start collecting conversion signals.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="text-xs uppercase tracking-wider text-white/50 font-semibold">
                                Total tracked CTA clicks: <span className="text-white">{marketingCtas.totalEvents}</span>
                            </div>
                            {marketingCtas.ctas.slice(0, 8).map((cta) => (
                                <div key={`${cta.eventName}-${cta.location}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                    <div>
                                        <p className="text-sm text-white font-medium">{cta.location.replaceAll("_", " ")}</p>
                                        <p className="text-xs text-white/50">{cta.eventName}</p>
                                    </div>
                                    <div className="text-primary font-bold">{cta.count}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Documentation Growth Chart */}
            <AnalyticsCharts data={data.recentActivity.map(a => ({
                name: new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                docs: a.creations,
                views: a.views
            }))} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                {/* Popular Documentation */}
                <Card className="h-full border-white/5 bg-black/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                            <Users className="w-4 h-4 text-purple-400" />
                            Most Viewed Documentation
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.topDocs.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-white/5 rounded-xl bg-white/5">
                                    No views recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {data.topDocs.map((doc, i) => (
                                        <div key={doc.id} className="p-3 rounded-xl hover:bg-white/5 transition-all flex items-center justify-between group cursor-default border border-transparent hover:border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-muted-foreground font-bold text-xs group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                          <span aria-hidden="true">{i + 1}</span>
                                        </div>
                                                <div>
                                                    <div className="font-medium text-sm text-white group-hover:text-primary transition-colors truncate max-w-[200px]">{doc.name}</div>
                                                    <div className="text-[10px] text-zinc-500 uppercase font-black">{doc.language}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-md border border-primary/20">
                                                <span aria-hidden="true"><Eye className="w-3 h-3" /></span>
                                                {doc.views}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Stale Documentation */}
                <Card className="h-full border-white/5 bg-black/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                            <AlertCircle className="w-4 h-4 text-amber-400" />
                            Documentation Debt
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            {data.staleDocs.length === 0 ? (
                                <div className="p-8 border-2 border-dashed border-white/5 rounded-xl text-center text-muted-foreground bg-white/5">
                                    Your documentation is up to date.
                                </div>
                            ) : (
                                data.staleDocs.map((doc) => (
                                    <div key={doc.id} className="flex items-start gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors group relative border border-transparent hover:border-white/5">
                                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20 group-hover:border-amber-500/50 transition-colors">
                                            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-white/90">
                                                <span className="text-amber-400 group-hover:text-amber-300 transition-colors">{doc.name}</span>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider">
                                                {doc.reason === "OUT_OF_SYNC" ? "Code changed after docs" : "Update recommended"} • {doc.daysSinceUpdate} days ago
                                            </p>
                                        </div>
                                        <ArrowUpRight className="w-4 h-4 text-white/20 group-hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all" />
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, bg }: { label: string, value: string, icon: React.ReactNode, bg: string }) {
    return (
        <Card className="border-white/5 bg-black/20 hover:bg-black/40 transition-all group hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-300`}>
                    <span aria-hidden="true">{icon}</span>
                </div>
                <div>
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-white/60 transition-colors">{label}</p>
                    <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
                </div>
            </CardContent>
        </Card>
    );
}

//

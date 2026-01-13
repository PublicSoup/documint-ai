import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { redirect } from "next/navigation";
import { BarChart3, TrendingUp, Users, FileText, CheckSquare, Eye, Crown, ArrowUpRight } from "lucide-react";
import Link from 'next/link';
import { hasFeatureAccess } from "../../../lib/subscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = {
    title: "Analytics | DocuMint AI",
    description: "Documentation health and usage metrics"
};

export default async function AnalyticsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/");

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
                <Link href="/dashboard/settings?tab=billing">
                    <Button size="lg" className="px-8 shadow-lg shadow-primary/20" rightIcon={<Crown className="w-4 h-4 text-amber-200" />}>
                        Upgrade to Pro
                    </Button>
                </Link>
            </div>
        );
    }

    // Fetch Stats
    const fileCount = await db.file.count({ where: { userId: session.user.id } });
    const docCount = await db.documentation.count({ where: { file: { userId: session.user.id } } });
    const reviewCount = await db.reviewRequest.count({
        where: {
            OR: [
                { requesterId: session.user.id },
                { reviewerId: session.user.id }
            ],
            status: "PENDING"
        }
    });

    // Real View Count
    const totalViewsConfig = await db.docView.aggregate({
        where: { file: { userId: session.user.id } },
        _count: {
            _all: true,
        }
    });
    const totalViews = totalViewsConfig._count._all;

    // Calculate Coverage
    const coverage = fileCount > 0 ? Math.round((docCount / fileCount) * 100) : 0;

    // Fetch Recent Activity
    const recentDocs = await db.documentation.findMany({
        where: { file: { userId: session.user.id } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
            file: {
                select: { name: true, language: true }
            }
        }
    });

    // Fetch Top Viewed Docs
    const topViewedFiles = await db.docView.groupBy({
        by: ['fileId'],
        where: { file: { userId: session.user.id } },
        _count: {
            fileId: true,
        },
        orderBy: {
            _count: {
                fileId: 'desc'
            }
        },
        take: 5,
    });

    // Get file names for top views
    const fileIds = topViewedFiles.map(t => t.fileId);
    const topFiles = await db.file.findMany({
        where: { id: { in: fileIds } },
        select: { id: true, name: true, language: true }
    });

    // Merge count with file details
    const topDocs = topViewedFiles.map(view => {
        const file = topFiles.find(f => f.id === view.fileId);
        return {
            ...file,
            views: view._count.fileId
        };
    }).filter(d => d.name);

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
                    value={fileCount.toString()}
                    icon={<FileText className="w-5 h-5 text-blue-400" />}
                    bg="bg-blue-500/10"
                />
                <StatCard
                    label="Doc Coverage"
                    value={`${coverage}%`}
                    icon={<TrendingUp className="w-5 h-5 text-green-400" />}
                    bg="bg-green-500/10"
                />
                <StatCard
                    label="Pending Reviews"
                    value={reviewCount.toString()}
                    icon={<CheckSquare className="w-5 h-5 text-amber-400" />}
                    bg="bg-amber-500/10"
                />
                <StatCard
                    label="Total Views"
                    value={totalViews.toString()}
                    icon={<Eye className="w-5 h-5 text-pink-400" />}
                    bg="bg-pink-500/10"
                />
            </div>

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
                            {topDocs.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-white/5 rounded-xl bg-white/5">
                                    No views recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {topDocs.map((doc, i) => (
                                        <div key={i} className="p-3 rounded-xl hover:bg-white/5 transition-all flex items-center justify-between group cursor-default border border-transparent hover:border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-muted-foreground font-bold text-xs group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                                    {i + 1}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm text-white group-hover:text-primary transition-colors">{doc.name}</div>
                                                    <div className="text-xs text-muted-foreground">{doc.language}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-md border border-primary/20">
                                                <Eye className="w-3 h-3" />
                                                {doc.views}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Activity Feed */}
                <Card className="h-full border-white/5 bg-black/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                            <FileText className="w-4 h-4 text-blue-400" />
                            Recent Updates
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            {recentDocs.length === 0 ? (
                                <div className="p-8 border-2 border-dashed border-white/5 rounded-xl text-center text-muted-foreground bg-white/5">
                                    No recent documentation activity.
                                </div>
                            ) : (
                                recentDocs.map((doc, i) => (
                                    <div key={doc.id} className="flex items-start gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors group relative border border-transparent hover:border-white/5">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20 group-hover:border-blue-500/50 transition-colors">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-white/90">
                                                Updated <span className="text-blue-400 group-hover:text-blue-300 transition-colors">{doc.file.name}</span>
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {new Date(doc.updatedAt).toLocaleDateString()} at {new Date(doc.updatedAt).toLocaleTimeString()}
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
                    {icon}
                </div>
                <div>
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-white/60 transition-colors">{label}</p>
                    <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
                </div>
            </CardContent>
        </Card>
    );
}

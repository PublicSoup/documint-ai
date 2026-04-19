import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription } from "@/lib/subscription";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
    Plus,
    Database,
    Github,
    Crown,
    BarChart3,
    TrendingUp,
    AlertCircle,
    FileText,
    FolderTree,
    Code2,
    Zap,
    Activity,
    Clock,
    ShieldCheck,
    ShieldAlert,
    Search,
    ChevronRight,
    Terminal,
    Lock,
    Check,
    ArrowRight
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import FileUpload from "@/components/file-upload";
import DocEditor from "@/components/doc-editor";
import UsageMeter from "@/components/usage-meter";
import GitHubImport from "@/components/github-import";
import ReadmeGenerator from "@/components/readme-generator";
import ChangelogGenerator from "@/components/changelog-generator";
import TeamSwitcher from "@/components/team-switcher";
import { DashboardFileTree } from "@/components/dashboard-file-tree";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import AuditLogViewer from "@/components/audit-log-viewer";
import { EnterpriseFeatureGate } from "@/components/enterprise-feature-gate";
import { ArchitectureTab } from "@/components/architecture-tab";
import AnalyticsDashboard from "@/components/analytics-dashboard";
import { TeamProjectOverview } from "@/components/analytics/team-overview";
import { TeamLeaderboard } from "@/components/team-leaderboard";
import { TeamWeeklyReview } from "@/components/analytics/weekly-review";
import { TeamReviewQueue } from "@/components/analytics/review-queue";
import { TeamScorecard } from "@/components/analytics/team-scorecard";
import { TeamSecurityAudit } from "@/components/analytics/team-security-audit";
import { TeamAIAudit } from "@/components/team-ai-audit";
import { CodeHealthIndex } from "@/components/analytics/health-index";
import { GlobalSearch } from "@/components/global-search";
import { TrackedLink } from "@/components/marketing/tracked-link";
import { getPriorityActions } from "./actions";
import { Network, Sparkles, BrainCircuit, Fingerprint } from "lucide-react";
import { File, Prisma } from "@prisma/client";

interface TeamMembership {
    teamId: string;
    role: string;
    team: {
        id: string;
        name: string;
        slug: string;
        plan: string;
        updatedAt: Date;
    };
}

interface TeamConfig {
    lockApproved?: boolean;
    [key: string]: unknown;
}

type Hotspot = File & {
    riskScore: number;
    isDocumented: boolean;
};

export default async function DashboardPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const session = await getServerSession(authOptions);

    const onboardingIntentRaw = Array.isArray(searchParams?.intent) ? searchParams.intent[0] : searchParams?.intent;
    const onboardingPlanRaw = Array.isArray(searchParams?.plan) ? searchParams.plan[0] : searchParams?.plan;
    const onboardingSourceRaw = Array.isArray(searchParams?.source) ? searchParams.source[0] : searchParams?.source;

    const onboardingIntent = onboardingIntentRaw === "trial" ? "trial" : "signup";
    const onboardingPlan = onboardingPlanRaw === "starter" || onboardingPlanRaw === "pro" || onboardingPlanRaw === "team"
        ? onboardingPlanRaw
        : null;
    const onboardingSource = onboardingSourceRaw && /^[a-z0-9_\-]{1,80}$/i.test(onboardingSourceRaw)
        ? onboardingSourceRaw
        : null;

    if (!session) {
        redirect("/auth/login");
    }

    if (!session.user?.id) {
        console.error("Dashboard Error: Session exists but user ID is missing", session);
        throw new Error("User ID missing from session");
    }

    // Fail-safe data fetching
    let subscription = { isPro: false, isTeam: false, plan: "free" };
    try {
        subscription = await getUserSubscription(session.user.id);
    } catch (e) {
        console.error("Failed to fetch subscription:", e);
    }

    // Fetch user teams
    let memberships: TeamMembership[] = [];
    let teams: TeamMembership["team"][] = [];
    try {
        memberships = await db.teamMember.findMany({
            where: { userId: session.user.id },
            include: { team: true }
        });
        teams = memberships.map(m => m.team);
    } catch (e) {
        console.error("Failed to fetch teams:", e);
    }

    // Determine context (Personal vs Team)
    const teamId = searchParams?.teamId as string | undefined;
    let whereClause: Prisma.FileWhereInput = { userId: session.user.id, teamId: null };
    let userRole = "OWNER"; // Default for personal files

    if (teamId) {
        const membership = memberships.find(m => m.teamId === teamId);
        if (membership) {
            whereClause = { teamId };
            userRole = membership.role;
        }
    }

    // Fetch dashboard data in parallel to reduce TTFB.
    let totalFilesCount = 0;
    let verifiedDocsCount = 0;
    let files: FileWithDocs[] = [];

    try {
        const [totalFiles, verifiedDocs, fetchedFiles] = await Promise.all([
            db.file.count({ where: whereClause }),
            db.documentation.count({
                where: {
                    file: whereClause,
                    verifiedAt: { not: null },
                },
            }),
            db.file.findMany({
                where: whereClause,
                take: 50,
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    documentation: true,
                },
            }),
        ]);

        totalFilesCount = totalFiles;
        verifiedDocsCount = verifiedDocs;
        files = fetchedFiles;
    } catch (e) {
        console.error("Failed to fetch dashboard data:", e);
    }

    interface FileWithDocs {
        id: string;
        name: string;
        language: string;
        size: number;
        createdAt: Date;
        documentation: {
            content: string;
            verifiedAt?: Date | null;
            verifiedById?: string | null;
            isPublic: boolean;
            status: string;
            metadata?: any;
        } | null;
    }

    const typedFiles = files as unknown as FileWithDocs[];

    // Fetch Priority Actions and Hotspots (cached for 60s in server action)
    const priorityData = await getPriorityActions(teamId);
    const priorityActions = priorityData.actions;
    const hotspots = priorityData.hotspots;

    const selectedDocId = searchParams?.docId;
    let selectedFile = null;
    let parsedDoc = null;

    if (selectedDocId) {
        selectedFile = typedFiles.find(f => f.id === selectedDocId as string);
        if (selectedFile && selectedFile.documentation) {
            // Fetch team policy if applicable
            let lockApproved = false;
            if (teamId) {
                const teamConfig = await db.integration.findFirst({
                    where: { teamId, type: "TEAM_CONFIG" }
                });
                if ((teamConfig?.config as any)?.lockApproved) {
                    lockApproved = true;
                }
            }

            // Audit Logging - View Doc
            try {
                const { logAudit } = await import("@/lib/audit-logger");
                await logAudit({
                    userId: session.user.id,
                    action: "VIEW_DOCS",
                    entity: "Documentation",
                    entityId: selectedFile.id, // documentation id or file id, using file id for consistency in lookup
                    details: { name: selectedFile.name }
                });
            } catch (e) { }

            try {
                parsedDoc = JSON.parse(selectedFile.documentation.content);
                if (parsedDoc) {
                    parsedDoc.verifiedAt = selectedFile.documentation.verifiedAt ? new Date(selectedFile.documentation.verifiedAt).toISOString() : null;
                    parsedDoc.verifiedById = selectedFile.documentation.verifiedById;
                    parsedDoc.status = selectedFile.documentation.status;
                    parsedDoc.lockApproved = lockApproved;

                    // Metadata for drift awareness
                    const meta = (selectedFile.documentation.metadata as any) || {};
                    parsedDoc.hasProposedChanges = !!meta.proposedContent;
                    parsedDoc.proposedAt = meta.proposedAt;
                }
            } catch (e) {
                console.error("Failed to parse doc content", e);
            }
        }
    }

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <OnboardingChecklist onboardingContext={{ intent: onboardingIntent, plan: onboardingPlan, source: onboardingSource }} />

            {onboardingIntent === "trial" && !(subscription.isPro || subscription.isTeam) && (
                <Card className="border-primary/25 bg-primary/10">
                    <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-primary font-black">Trial onboarding</p>
                            <p className="text-sm text-white/80 mt-1">
                                Complete billing setup to unlock your Pro trial workspace features.
                            </p>
                        </div>
                        <TrackedLink
                            href={`/dashboard/billing${onboardingSource ? `?source=${encodeURIComponent(onboardingSource)}` : ""}`}
                            eventName="trial_upgrade_cta_click"
                            location="dashboard_trial_banner_upgrade"
                            variant="trial_intent_v1"
                        >
                            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white">
                                Start Pro Trial <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </TrackedLink>
                    </CardContent>
                </Card>
            )}

            <Tabs defaultValue="overview" className="space-y-6">
                <div className="flex items-center justify-between">
                    <TabsList className="bg-white/5 border border-white/5">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="health" className="group">
                            <span className="flex items-center gap-2">
                                <Activity className="w-4 h-4" />
                                Project Health
                            </span>
                        </TabsTrigger>
                        <TabsTrigger value="audit" className="group">
                            <span className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4" />
                                Audit Logs
                                {(!subscription.isTeam && !subscription.isPro) && (
                                    <Lock className="w-3 h-3 text-amber-500/70" />
                                )}
                            </span>
                        </TabsTrigger>
                        <TabsTrigger value="architecture" className="group">
                            <span className="flex items-center gap-2">
                                <Network className="w-4 h-4" />
                                Architecture
                                {(!subscription.isTeam && !subscription.isPro) && (
                                    <Lock className="w-3 h-3 text-amber-500/70" />
                                )}
                            </span>
                        </TabsTrigger>
                        {teamId && (
                            <TabsTrigger value="security" className="group">
                                <span className="flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4" />
                                    Security Audit
                                </span>
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <GlobalSearch teamId={teamId} />
                </div>

                <TabsContent value="overview" className="space-y-6 animate-in fade-in-50 duration-500">
                    {/* Executive Insights Row */}
                    <TeamProjectOverview teamId={teamId} />

                    {/* Quick Launch Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                        {/* Cloud IDE Quick Launch */}
                        <Card className="lg:col-span-4 bg-primary/10 border-primary/20 relative overflow-hidden group cursor-pointer hover:bg-primary/20 transition-all shadow-2xl shadow-primary/10">
                            <Link href="/code" className="absolute inset-0 z-10" />
                            <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-primary/30 blur-3xl rounded-full group-hover:scale-150 transition-transform duration-700" />
                            <CardContent className="p-6 flex flex-col justify-between h-full relative z-20">
                                <div className="flex justify-between items-start">
                                    <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg">
                                        <Terminal className="w-6 h-6" />
                                    </div>
                                    <div className="px-2 py-1 rounded bg-primary/20 text-[10px] font-bold text-primary tracking-widest uppercase">PRO FEATURE</div>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1">Cloud Web IDE</h3>
                                    <p className="text-xs text-white/60">Launch your intelligent development environment instantly.</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Left Sidebar: Control Panel */}
                        <div className="lg:col-span-4 space-y-6">
                            <Card className="glass-card border-white/5 overflow-hidden">
                                <CardHeader className="pb-4">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-primary" />
                                        Workspace Actions
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 p-4 pt-0">
                                    <div className="grid grid-cols-1 gap-3">
                                        <FileUpload teamId={teamId} isPro={subscription.isPro || subscription.isTeam} />
                                        <GitHubImport />
                                    </div>

                                    {/* AI Priority Queue */}
                                    <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                                                <Sparkles className="w-3 h-3" />
                                                AI Priority Queue
                                            </span>
                                            <span className="text-[10px] bg-indigo-500 text-white px-1.5 rounded-full font-bold">{priorityActions.length}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {priorityActions.length > 0 ? priorityActions.map(action => (
                                                <Link
                                                    key={action.id}
                                                    href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${action.fileId}`}
                                                    className="text-[11px] text-white/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2 group"
                                                >
                                                    <div className={cn(
                                                        "w-1 h-1 rounded-full group-hover:scale-125 transition-transform",
                                                        action.priority === "CRITICAL" ? "bg-rose-500 animate-pulse" : "bg-amber-400"
                                                    )} />
                                                    <span className="truncate">{action.label}</span>
                                                </Link>
                                            )) : (
                                                <p className="text-[10px] text-zinc-600 italic">No critical issues detected.</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-white/5 space-y-2">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Current Context</p>
                                        <TeamSwitcher teams={teams} currentTeamId={teamId} />
                                        <UsageMeter />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="glass-card border-white/5 flex flex-col h-[500px] overflow-hidden">
                                <CardHeader className="pb-2 border-b border-white/5 shrink-0">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <FolderTree className="w-4 h-4 text-blue-400" />
                                        Project Explorer
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1 p-0 overflow-hidden">
                                    <DashboardFileTree
                                        files={typedFiles}
                                        selectedFileId={selectedDocId as string | undefined}
                                        teamId={teamId}
                                    />
                                </CardContent>
                                {typedFiles.length > 0 && (
                                    <div className="p-4 border-t border-white/5 bg-black/40 space-y-3 shrink-0">
                                        <ReadmeGenerator fileIds={typedFiles.map(f => f.id)} />
                                        <div className="grid grid-cols-2 gap-2">
                                            <ChangelogGenerator fileIds={typedFiles.map(f => f.id)} />
                                            <Link href={teamId ? `/dashboard/analytics?teamId=${teamId}` : "/dashboard/analytics"} className="w-full">
                                                <Button variant="ghost" size="sm" className="w-full justify-start text-[10px] h-9 hover:bg-white/5">
                                                    <BarChart3 className="w-3 h-3 mr-2 text-purple-400" />
                                                    Analytics
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>

                        {/* Right Content: Main Viewport */}
                        <div className="lg:col-span-8 flex flex-col gap-6">
                            {typedFiles.length === 0 ? (
                                <DashboardEmptyState teamId={teamId} isPro={subscription.isPro || subscription.isTeam} />
                            ) : selectedDocId && selectedFile ? (
                                parsedDoc ? (
                                    <div className="h-[750px] rounded-3xl overflow-hidden glass border border-white/5 shadow-2xl relative">
                                        <DocEditor
                                            fileId={selectedFile.id}
                                            fileName={selectedFile.name}
                                            fileLanguage={selectedFile.language}
                                            initialContent={parsedDoc}
                                            currentUser={{ id: session!.user.id, name: session!.user.name || "User", role: userRole }}
                                            isPublic={!!selectedFile.documentation?.isPublic}
                                            isPro={subscription.isPro || subscription.isTeam}
                                            lockApproved={parsedDoc.lockApproved}
                                        />
                                    </div>
                                ) : (
                                    <Card className="h-[400px] flex items-center justify-center bg-red-500/5 border-red-500/10">
                                        <div className="text-center space-y-3 p-8">
                                            <AlertCircle className="w-12 h-12 text-red-400 mx-auto animate-pulse" />
                                            <h3 className="text-xl font-bold text-white">Corruption Detected</h3>
                                            <p className="text-muted-foreground text-sm max-w-xs">AI response format in database is invalid. Try regenerating the documentation.</p>
                                            <Button variant="outline" size="sm" className="mt-4">Regenerate Now</Button>
                                        </div>
                                    </Card>
                                )
                            ) : (
                                <div className="h-[700px] flex items-center justify-center glass-card rounded-[2.5rem] border-white/5 relative overflow-hidden group">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-primary/10 blur-[100px] rounded-full group-hover:scale-125 transition-transform duration-1000" />

                                    <div className="text-center relative z-10 px-8 max-w-xl">
                                        <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-8 shadow-2xl transform rotate-3 group-hover:rotate-0 transition-transform duration-500">
                                            <FileText className="w-10 h-10 text-white/20" />
                                        </div>
                                        <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">Command Center</h2>
                                        <p className="text-muted-foreground mb-12 text-lg">
                                            Select a file from your explorer to begin deep analysis. DocuMint AI will provide refactoring suggestions, complexity scores, and instant documentation.
                                        </p>

                                        <div className="grid grid-cols-2 gap-4 text-left">
                                            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/40 transition-colors cursor-pointer group/item">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="p-2 rounded-lg bg-primary/20 text-primary group-hover/item:scale-110 transition-transform">
                                                        <TrendingUp className="w-5 h-5" />
                                                    </div>
                                                    <span className="font-bold text-white tracking-tight">Code Insights</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground leading-relaxed">Complexity scores, maintenance ratings, and technical debt analysis.</p>
                                            </div>
                                            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/40 transition-colors cursor-pointer group/item">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 group-hover/item:scale-110 transition-transform">
                                                        <Zap className="w-5 h-5" />
                                                    </div>
                                                    <span className="font-bold text-white tracking-tight">AI Suggest</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground leading-relaxed">Context-aware suggestions for improving code quality and performance.</p>
                                            </div>
                                        </div>

                                        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                            <Database className="w-3 h-3" />
                                            <span>{totalFilesCount} files in workspace</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Secondary Insights Row */}
                            {!selectedDocId && typedFiles.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Card className="glass-card border-white/5 p-6">
                                        <div className="flex items-center justify-between mb-6">
                                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                <Activity className="w-4 h-4 text-orange-400" />
                                                Hotspot Analysis
                                            </CardTitle>
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Beta</span>
                                        </div>
                                        <div className="space-y-4">
                                            {hotspots.length > 0 ? hotspots.map((f: Hotspot, i: number) => (
                                                <Link
                                                    key={i}
                                                    href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${f.id}`}
                                                    className="flex items-center justify-between group cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "w-1.5 h-1.5 rounded-full",
                                                            f.riskScore > 70 ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-orange-400"
                                                        )} />
                                                        <span className="text-sm text-white/70 group-hover:text-white transition-colors truncate max-w-[180px]">{f.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {f.isDocumented ? (
                                                            <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase">Docs</div>
                                                        ) : (
                                                            <div className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase">Missing</div>
                                                        )}
                                                        <span className="text-[10px] font-bold text-zinc-500">{f.riskScore}</span>
                                                    </div>
                                                </Link>
                                            )) : (
                                                <p className="text-xs text-zinc-600 italic">Project too small for hotspot analysis.</p>
                                            )}
                                        </div>
                                    </Card>

                                    <Card className="glass-card border-white/5 p-6">
                                        <div className="flex items-center justify-between mb-6">
                                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                <Github className="w-4 h-4 text-white" />
                                                Sync Status
                                            </CardTitle>
                                            <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest">Live</span>
                                        </div>
                                        <div className="flex flex-col items-center justify-center h-20">
                                            <Github className="w-8 h-8 text-white/10 mb-2" />
                                            <p className="text-xs text-muted-foreground text-center">Connect a repository to<br />enable sync tracking.</p>
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="health" className="space-y-6 animate-in fade-in-50 duration-500">
                    {teamId && <TeamScorecard teamId={teamId} />}
                    {teamId && <TeamAIAudit teamId={teamId} />}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-8 space-y-6">
                            <AnalyticsDashboard teamId={teamId} />
                            {teamId && <TeamReviewQueue teamId={teamId} />}
                        </div>
                        {teamId && (
                            <div className="lg:col-span-4 space-y-6">
                                <TeamWeeklyReview teamId={teamId} />
                                <TeamLeaderboard teamId={teamId} />
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="audit" className="space-y-4 animate-in fade-in-50 duration-500">
                    <EnterpriseFeatureGate
                        isPro={subscription.isTeam || subscription.isPro}
                        featureName="Audit Logs"
                        description="Track every verification, export, and modification with bank-grade compliance logging."
                    >
                        <AuditLogViewer />
                    </EnterpriseFeatureGate>
                </TabsContent>

                <TabsContent value="architecture" className="space-y-4 animate-in fade-in-50 duration-500">
                    <EnterpriseFeatureGate
                        isPro={subscription.isTeam || subscription.isPro}
                        featureName="Architecture Diagram"
                        description="Visualize your entire project structure, dependencies, and data flow in real-time."
                    >
                        <ArchitectureTab teamId={teamId} />
                    </EnterpriseFeatureGate>
                </TabsContent>

                {teamId && (
                    <TabsContent value="security" className="space-y-6 animate-in fade-in-50 duration-500">
                        <TeamSecurityAudit teamId={teamId} />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}

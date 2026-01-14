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
    Search,
    ChevronRight,
    Terminal
} from "lucide-react";
import Link from "next/link";
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
import { DashboardEmptyState } from "@/components/dashboard-empty-state";
import { OnboardingChecklist } from "@/components/onboarding-checklist";

export default async function DashboardPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/login");
    }

    if (!session.user?.id) {
        console.error("Dashboard Error: Session exists but user ID is missing", session);
        throw new Error("User ID missing from session");
    }

    const subscription = await getUserSubscription(session.user.id);

    // Fetch user teams
    const memberships = await db.teamMember.findMany({
        where: { userId: session.user.id },
        include: { team: true }
    });
    const teams = memberships.map(m => m.team);

    // Determine context (Personal vs Team)
    const teamId = searchParams?.teamId as string | undefined;
    let whereClause: any = { userId: session.user.id, teamId: null };

    if (teamId) {
        const isMember = memberships.some(m => m.teamId === teamId);
        if (isMember) {
            whereClause = { teamId };
        }
    }

    // Fetch stats
    const totalFilesCount = await db.file.count({ where: whereClause });
    const verifiedDocsCount = await db.documentation.count({
        where: {
            file: whereClause,
            verifiedAt: { not: null }
        }
    });

    // Fetch files based on context
    const files = await db.file.findMany({
        where: whereClause,
        take: 50,
        orderBy: {
            createdAt: 'desc'
        },
        include: {
            documentation: true
        }
    });

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
        } | null;
    }

    const typedFiles = files as unknown as FileWithDocs[];

    const selectedDocId = searchParams?.docId;
    let selectedFile = null;
    let parsedDoc = null;

    if (selectedDocId) {
        selectedFile = typedFiles.find(f => f.id === selectedDocId as string);
        if (selectedFile && selectedFile.documentation) {
            try {
                parsedDoc = JSON.parse(selectedFile.documentation.content);
                if (parsedDoc) {
                    parsedDoc.verifiedAt = selectedFile.documentation.verifiedAt ? new Date(selectedFile.documentation.verifiedAt).toISOString() : null;
                    parsedDoc.verifiedById = selectedFile.documentation.verifiedById;
                }
            } catch (e) {
                console.error("Failed to parse doc content", e);
            }
        }
    }

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <OnboardingChecklist />

            {/* Quick Launch & Stats Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Hero Stats Card */}
                <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="glass-card border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <Code2 className="w-12 h-12 text-primary" />
                        </div>
                        <CardContent className="p-6">
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Total Files</p>
                            <h3 className="text-3xl font-bold text-white">{totalFilesCount}</h3>
                            <div className="mt-4 flex items-center gap-2 text-xs text-green-400">
                                <TrendingUp className="w-3 h-3" />
                                <span>+12% from last week</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-card border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <ShieldCheck className="w-12 h-12 text-green-500" />
                        </div>
                        <CardContent className="p-6">
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Verified Docs</p>
                            <h3 className="text-3xl font-bold text-white">{verifiedDocsCount}</h3>
                            <div className="mt-4 flex items-center gap-2 text-xs text-blue-400">
                                <Activity className="w-3 h-3" />
                                <span>{totalFilesCount > 0 ? Math.round((verifiedDocsCount / totalFilesCount) * 100) : 0}% coverage</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-card border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <Zap className="w-12 h-12 text-yellow-500" />
                        </div>
                        <CardContent className="p-6">
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">AI Tokens used</p>
                            <h3 className="text-3xl font-bold text-white">42.5k</h3>
                            <div className="mt-4 flex items-center gap-2 text-xs text-primary">
                                <Link href="/dashboard/billing" className="hover:underline flex items-center gap-1">
                                    Manage plan <ChevronRight className="w-3 h-3" />
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                </div>

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
                                    <Link href="/dashboard/analytics" className="w-full">
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
                                    currentUser={{ id: session!.user.id, name: session!.user.name || "User" }}
                                    isPublic={!!selectedFile.documentation?.isPublic}
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
                                    <Clock className="w-3 h-3" />
                                    <span>Last activity: 2 minutes ago</span>
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
                                    {typedFiles.slice(0, 3).map((f, i) => (
                                        <div key={i} className="flex items-center justify-between group cursor-pointer">
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                                <span className="text-sm text-white/70 group-hover:text-white transition-colors">{f.name}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">High Complexity</span>
                                        </div>
                                    ))}
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
                                    <p className="text-xs text-muted-foreground text-center">Repository synced with <br />main branch 5m ago.</p>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

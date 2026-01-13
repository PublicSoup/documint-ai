import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription } from "@/lib/subscription";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Plus, Database, Github, CheckSquare, Crown, BarChart3, TrendingUp, AlertCircle, FileText, FolderTree } from "lucide-react";
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

export default async function DashboardPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/login");
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

    // Fetch files based on context
    const files = await db.file.findMany({
        where: whereClause,
        take: 50, // Limit to 50 most recent files for performance
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
                // Inject verification status into the doc content
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-7rem)]">
            {/* Left Sidebar: File List & Upload */}
            <div className="md:col-span-2 space-y-6 flex flex-col h-full overflow-hidden">
                {/* Team Switcher & Usage */}
                <div className="space-y-4">
                    <TeamSwitcher teams={teams} currentTeamId={teamId} />
                    <UsageMeter />
                </div>

                {/* Actions Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 shrink-0 px-1">
                    {/* Upload Card */}
                    <Card className="relative group overflow-visible border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                        <CardContent className="p-4 flex flex-col items-center text-center gap-3 relative z-10 overflow-visible">
                            <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shadow-lg shadow-primary/10 group-hover:scale-110 transition-all duration-300">
                                <Plus className="w-5 h-5" />
                            </div>
                            <div className="w-full space-y-1">
                                <h3 className="text-xs font-black uppercase tracking-widest text-white/90">New Scan</h3>
                                <p className="text-[10px] text-muted-foreground">Analyze local source code</p>
                                <div className="mt-3">
                                    <FileUpload teamId={teamId} isPro={subscription.isPro || subscription.isTeam} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* GitHub Card */}
                    <Card className="relative group overflow-hidden border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-4 flex flex-col items-center text-center gap-3 relative z-10">
                            <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shadow-lg shadow-white/5 group-hover:scale-110 transition-all duration-300">
                                <Github className="w-5 h-5" />
                            </div>
                            <div className="w-full space-y-1">
                                <h3 className="text-xs font-black uppercase tracking-widest text-white/90">Import Repo</h3>
                                <p className="text-[10px] text-muted-foreground">Connect GitHub repository</p>
                                <div className="mt-3">
                                    <GitHubImport />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* File Tree */}
                <Card className="flex-grow flex flex-col bg-[#1e1e1e]/50 border-white/5 overflow-hidden">
                    <CardHeader className="pb-2 shrink-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <FolderTree className="w-4 h-4" />
                            Project Explorer
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 min-h-0">
                        <DashboardFileTree
                            files={typedFiles}
                            selectedFileId={selectedDocId as string | undefined}
                            teamId={teamId}
                        />
                    </CardContent>
                </Card>

                {/* Quick Actions Footer */}
                {typedFiles.length > 0 && (
                    <div className="p-3 border-t border-white/5 bg-black/20 space-y-2 shrink-0">
                        <ReadmeGenerator fileIds={typedFiles.map(f => f.id)} />
                        <div className="grid grid-cols-2 gap-2">
                            <ChangelogGenerator fileIds={typedFiles.map(f => f.id)} />
                            <Link href="/dashboard/analytics">
                                <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-9">
                                    <BarChart3 className="w-3 h-3 mr-2 text-purple-400" />
                                    Analytics
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Content: Documentation View */}
            <div className="md:col-span-2 h-full overflow-hidden flex flex-col">
                {selectedFile ? (
                    parsedDoc ? (
                        <div className="h-full rounded-2xl overflow-hidden glass border border-white/5 shadow-2xl">
                            <DocEditor
                                fileId={selectedFile.id}
                                fileName={selectedFile.name}
                                fileLanguage={selectedFile.language}
                                initialContent={parsedDoc}
                                currentUser={{ id: session!.user.id, name: session!.user.name || "User" }}
                            />
                        </div>
                    ) : (
                        <Card className="h-full flex items-center justify-center">
                            <div className="text-center space-y-3">
                                <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                                <h3 className="text-lg font-medium text-white">Error Loading Doc</h3>
                                <p className="text-muted-foreground">The documentation format is invalid.</p>
                            </div>
                        </Card>
                    )
                ) : (
                    <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center max-w-md space-y-6">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                                <FileText className="w-24 h-24 text-white/20 mx-auto relative z-10" />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-white">Select a file to view</h2>
                                <p className="text-muted-foreground">
                                    Choose a file from the list on the left to view its AI-generated documentation, dependency graph, and insights.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-left">
                                <Card className="p-4 bg-primary/5 hover:bg-primary/10 border-primary/20 transition-colors cursor-pointer group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 rounded-lg bg-primary/20 text-primary group-hover:scale-110 transition-transform">
                                            <TrendingUp className="w-4 h-4" />
                                        </div>
                                        <span className="font-semibold text-white text-sm">Insights</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">View complexity scores and maintenance ratings.</p>
                                </Card>
                                <Card className="p-4 bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/20 transition-colors cursor-pointer group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
                                            <Crown className="w-4 h-4" />
                                        </div>
                                        <span className="font-semibold text-white text-sm">Smart Suggest</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Get AI suggestions for refactoring and docs.</p>
                                </Card>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

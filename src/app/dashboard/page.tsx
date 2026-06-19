import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowRight, Code2, FileText, Lock, Network, ShieldAlert, ShieldCheck } from "lucide-react";

import { getPriorityActions } from "./actions";
import AnalyticsDashboard from "@/components/analytics-dashboard";
import { TeamReviewQueue } from "@/components/analytics/review-queue";
import { TeamScorecard } from "@/components/analytics/team-scorecard";
import { TeamSecurityAudit } from "@/components/analytics/team-security-audit";
import { TeamWeeklyReview } from "@/components/analytics/weekly-review";
import { ArchitectureTab } from "@/components/architecture-tab";
import AuditLogViewer from "@/components/audit-log-viewer";
import { DashboardOverviewTab } from "@/components/dashboard/overview-tab";
import { TrialBanner } from "@/components/dashboard/trial-banner";
import { EnterpriseFeatureGate } from "@/components/enterprise-feature-gate";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { TeamAIAudit } from "@/components/team-ai-audit";
import { TeamLeaderboard } from "@/components/team-leaderboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authOptions } from "@/lib/auth";
import {
  getDashboardFileStats,
  getSelectedDashboardDocument,
  resolveDashboardScope,
} from "@/lib/dashboard/data";
import {
  getOnboardingContext,
  getProjectViewMode,
  getSearchParam,
  isCodebasesViewEnabled,
} from "@/lib/dashboard/params";
import type { DashboardFileStats, DashboardSearchParams } from "@/lib/dashboard/types";
import { getUserSubscription } from "@/lib/subscription";

const EMPTY_FILE_STATS: DashboardFileStats = {
  totalFilesCount: 0,
  verifiedDocsCount: 0,
  files: [],
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) redirect("/auth/login");

  const userId = session.user.id;
  const selectedDocId = getSearchParam(params, "docId");
  const requestedTeamId = getSearchParam(params, "teamId");
  const initialProjectView = getProjectViewMode(getSearchParam(params, "view"));
  const onboarding = getOnboardingContext(params);
  const codebasesViewEnabled = isCodebasesViewEnabled(params);
  const defaultTab = getSearchParam(params, "tab") === "architecture" ? "architecture" : "overview";

  const [subscription, scope] = await Promise.all([
    getUserSubscription(userId).catch(() => ({ isPro: false, isTeam: false, plan: "free" })),
    resolveDashboardScope(userId, requestedTeamId),
  ]);

  if (scope.invalidTeamRequest) redirect("/dashboard");

  const fileStats = await getDashboardFileStats(scope.where, selectedDocId).catch(() => EMPTY_FILE_STATS);
  const { selectedFile, parsedDoc } = await getSelectedDashboardDocument({
    files: fileStats.files,
    selectedDocId,
    teamId: scope.teamId,
    userId,
  });

  const priorityData = await getPriorityActions(userId, scope.teamId).catch(() => ({ actions: [], hotspots: [] }));
  const isPaid = subscription.isPro || subscription.isTeam;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {fileStats.totalFilesCount === 0 && <OnboardingChecklist onboardingContext={onboarding} />}
      <TrialBanner onboarding={onboarding} isPaid={isPaid} />

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-purple-200/90">
              <Code2 className="h-3.5 w-3.5" />
              Cloud IDE workspace
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Build, review, and document from one cockpit.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                Keep the dashboard for project intelligence. Use the IDE for actual coding, terminal runs, AI edits, preview, source control, and documentation workflows.
              </p>
            </div>
          </div>

          <div className="grid min-w-full gap-3 sm:grid-cols-2 lg:min-w-[420px]">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-white/45">
                <FileText className="h-4 w-4 text-white/35" />
                Files indexed
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{fileStats.totalFilesCount}</p>
              <p className="mt-1 text-xs text-white/35">{fileStats.verifiedDocsCount} verified documents</p>
            </div>
            <Link
              href="/code"
              className="group flex min-h-[112px] flex-col justify-between rounded-xl border border-purple-400/20 bg-purple-500/15 p-4 text-white transition-colors hover:border-purple-300/40 hover:bg-purple-500/20"
            >
              <div className="flex items-center justify-between">
                <Code2 className="h-5 w-5 text-purple-200" />
                <ArrowRight className="h-4 w-4 text-purple-200/70 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Open IDE</p>
                <p className="mt-1 text-xs text-purple-100/60">Continue in the coding workspace</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
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
                {!isPaid && <Lock className="w-3 h-3 text-amber-500/70" />}
              </span>
            </TabsTrigger>
            <TabsTrigger value="architecture" className="group">
              <span className="flex items-center gap-2">
                <Network className="w-4 h-4" />
                Architecture
                {!isPaid && <Lock className="w-3 h-3 text-amber-500/70" />}
              </span>
            </TabsTrigger>
            {scope.teamId && (
              <TabsTrigger value="security" className="group">
                <span className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Security Audit
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <DashboardOverviewTab
            teamId={scope.teamId}
            teams={scope.teams}
            files={fileStats.files}
            selectedDocId={selectedDocId}
            selectedFile={selectedFile}
            parsedDoc={parsedDoc}
            initialProjectView={initialProjectView}
            currentUser={{
              id: userId,
              name: session.user.name || "User",
              role: scope.userRole,
            }}
            isPro={isPaid}
            priorityActions={priorityData.actions}
            hotspots={priorityData.hotspots}
            totalFilesCount={fileStats.totalFilesCount}
            verifiedDocsCount={fileStats.verifiedDocsCount}
            codebasesViewEnabled={codebasesViewEnabled}
          />
        </TabsContent>

        <TabsContent value="health" className="space-y-6 animate-in fade-in-50 duration-500">
          {scope.teamId && <TeamScorecard teamId={scope.teamId} />}
          {scope.teamId && <TeamAIAudit teamId={scope.teamId} />}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <AnalyticsDashboard teamId={scope.teamId} />
              {scope.teamId && <TeamReviewQueue teamId={scope.teamId} />}
            </div>
            {scope.teamId && (
              <div className="lg:col-span-4 space-y-6">
                <TeamWeeklyReview teamId={scope.teamId} />
                <TeamLeaderboard teamId={scope.teamId} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4 animate-in fade-in-50 duration-500">
          <EnterpriseFeatureGate
            isPro={isPaid}
            featureName="Audit Logs"
            description="Track every verification, export, and modification with compliance-grade logging."
          >
            <AuditLogViewer />
          </EnterpriseFeatureGate>
        </TabsContent>

        <TabsContent value="architecture" className="space-y-4 animate-in fade-in-50 duration-500">
          <EnterpriseFeatureGate
            isPro={isPaid}
            featureName="Architecture Diagram"
            description="Visualize your project structure, dependencies, and data flow in real time."
          >
            <ArchitectureTab teamId={scope.teamId} />
          </EnterpriseFeatureGate>
        </TabsContent>

        {scope.teamId && (
          <TabsContent value="security" className="space-y-6 animate-in fade-in-50 duration-500">
            <TeamSecurityAudit teamId={scope.teamId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

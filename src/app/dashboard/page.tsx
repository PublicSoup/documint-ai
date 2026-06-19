import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Code2,
  FileText,
  Lock,
  Network,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

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
import type {
  DashboardFileStats,
  DashboardSearchParams,
} from "@/lib/dashboard/types";
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
  const defaultTab =
    getSearchParam(params, "tab") === "architecture"
      ? "architecture"
      : "overview";

  const [subscription, scope] = await Promise.all([
    getUserSubscription(userId).catch(() => ({
      isPro: false,
      isTeam: false,
      plan: "free",
    })),
    resolveDashboardScope(userId, requestedTeamId),
  ]);

  if (scope.invalidTeamRequest) redirect("/dashboard");

  const fileStats = await getDashboardFileStats(
    scope.where,
    selectedDocId,
  ).catch(() => EMPTY_FILE_STATS);
  const { selectedFile, parsedDoc } = await getSelectedDashboardDocument({
    files: fileStats.files,
    selectedDocId,
    teamId: scope.teamId,
    userId,
  });

  const priorityData = await getPriorityActions(userId, scope.teamId).catch(
    () => ({ actions: [], hotspots: [] }),
  );
  const isPaid = subscription.isPro || subscription.isTeam;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {fileStats.totalFilesCount === 0 && (
        <OnboardingChecklist onboardingContext={onboarding} />
      )}
      <TrialBanner onboarding={onboarding} isPaid={isPaid} />

      <section className="rounded-2xl border border-white/10 bg-[#0d0d12] p-5 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">
              Workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              Review documentation coverage, recent project activity, and the
              files that need attention.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/code"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
            >
              <Code2 className="h-4 w-4" />
              Open IDE
            </Link>
            <Link
              href={
                scope.teamId
                  ? `/dashboard/analytics?teamId=${scope.teamId}`
                  : "/dashboard/analytics"
              }
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              View analytics
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white/45">
              <FileText className="h-4 w-4 text-white/35" />
              Files indexed
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">
              {fileStats.totalFilesCount}
            </p>
            <p className="mt-1 text-xs text-white/35">
              Available in this workspace
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white/45">
              <ShieldCheck className="h-4 w-4 text-white/35" />
              Verified docs
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">
              {fileStats.verifiedDocsCount}
            </p>
            <p className="mt-1 text-xs text-white/35">
              Approved documentation records
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white/45">
              <Activity className="h-4 w-4 text-white/35" />
              Priority items
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">
              {priorityData.actions.length}
            </p>
            <p className="mt-1 text-xs text-white/35">Open follow-up actions</p>
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

        <TabsContent
          value="health"
          className="space-y-6 animate-in fade-in-50 duration-500"
        >
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

        <TabsContent
          value="audit"
          className="space-y-4 animate-in fade-in-50 duration-500"
        >
          <EnterpriseFeatureGate
            isPro={isPaid}
            featureName="Audit Logs"
            description="Track every verification, export, and modification with compliance-grade logging."
          >
            <AuditLogViewer />
          </EnterpriseFeatureGate>
        </TabsContent>

        <TabsContent
          value="architecture"
          className="space-y-4 animate-in fade-in-50 duration-500"
        >
          <EnterpriseFeatureGate
            isPro={isPaid}
            featureName="Architecture Diagram"
            description="Visualize your project structure, dependencies, and data flow in real time."
          >
            <ArchitectureTab teamId={scope.teamId} />
          </EnterpriseFeatureGate>
        </TabsContent>

        {scope.teamId && (
          <TabsContent
            value="security"
            className="space-y-6 animate-in fade-in-50 duration-500"
          >
            <TeamSecurityAudit teamId={scope.teamId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

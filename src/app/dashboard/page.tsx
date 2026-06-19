import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Lock,
  Network,
  ShieldAlert,
  ShieldCheck,
  Users,
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
  getProjectMonitoringData,
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
  ProjectMonitoringData,
} from "@/lib/dashboard/types";
import { getUserSubscription } from "@/lib/subscription";

const EMPTY_FILE_STATS: DashboardFileStats = {
  totalFilesCount: 0,
  verifiedDocsCount: 0,
  files: [],
};

const EMPTY_PROJECT_MONITORING: ProjectMonitoringData = {
  codebases: [],
  totalCount: 0,
  ideRuns7d: 0,
  ideActivity: [],
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
  const projectMonitoring = await getProjectMonitoringData(
    userId,
    scope.teamId,
  ).catch(() => EMPTY_PROJECT_MONITORING);
  const isPaid = subscription.isPro || subscription.isTeam;
  const coveragePercent = fileStats.totalFilesCount
    ? Math.round((fileStats.verifiedDocsCount / fileStats.totalFilesCount) * 100)
    : 0;
  const activeTeam = scope.teamId
    ? scope.teams.find((team) => team.id === scope.teamId)
    : null;
  const scopeLabel = activeTeam ? activeTeam.name : "Personal workspace";
  const planLabel = formatPlanName(subscription.plan);
  const postureLabel = getPostureLabel(coveragePercent, fileStats.totalFilesCount);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {fileStats.totalFilesCount === 0 && (
        <OnboardingChecklist onboardingContext={onboarding} />
      )}
      <TrialBanner onboarding={onboarding} isPaid={isPaid} />

      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d12]/95 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-8">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                Live control plane
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                {scopeLabel}
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55 md:text-base">
                Enterprise documentation operations for coverage, review queues,
                architecture visibility, and compliance signals across your codebase.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs font-medium text-white/65">
                <Users className="h-3.5 w-3.5 text-primary" />
                {scope.teamId ? "Team scope" : "Individual scope"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs font-medium text-white/65">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                {postureLabel}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs font-medium text-white/65">
                <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                {planLabel} plan
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <HeaderStat
              label="Files indexed"
              value={fileStats.totalFilesCount.toLocaleString()}
              detail="Workspace inventory"
              icon={<FileText className="h-4 w-4" />}
            />
            <HeaderStat
              label="Verified docs"
              value={fileStats.verifiedDocsCount.toLocaleString()}
              detail={`${coveragePercent}% coverage`}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <HeaderStat
              label="Codebases"
              value={projectMonitoring.totalCount.toLocaleString()}
              detail="Monitored surfaces"
              icon={<Network className="h-4 w-4" />}
            />
            <HeaderStat
              label="IDE runs"
              value={projectMonitoring.ideRuns7d.toLocaleString()}
              detail="Last 7 days"
              icon={<Activity className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>

      <Tabs defaultValue={defaultTab} className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-[#0b0b10]/90 p-2 shadow-xl shadow-black/20 backdrop-blur-xl">
          <TabsList className="h-auto flex-wrap justify-start gap-1 border-0 bg-transparent p-0 text-white/50">
            <TabsTrigger
              value="overview"
              className="h-10 flex-none rounded-xl px-3 data-[state=active]:border-white/10 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="health"
              className="group h-10 flex-none rounded-xl px-3 data-[state=active]:border-white/10 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Project Health
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="audit"
              className="group h-10 flex-none rounded-xl px-3 data-[state=active]:border-white/10 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Audit Logs
                {!isPaid && <Lock className="w-3 h-3 text-amber-500/70" />}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="architecture"
              className="group h-10 flex-none rounded-xl px-3 data-[state=active]:border-white/10 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              <span className="flex items-center gap-2">
                <Network className="w-4 h-4" />
                Architecture
                {!isPaid && <Lock className="w-3 h-3 text-amber-500/70" />}
              </span>
            </TabsTrigger>
            {scope.teamId && (
              <TabsTrigger
                value="security"
                className="group h-10 flex-none rounded-xl px-3 data-[state=active]:border-white/10 data-[state=active]:bg-white/10 data-[state=active]:text-white"
              >
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
            projectMonitoring={projectMonitoring}
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

function HeaderStat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4 shadow-inner shadow-white/[0.02]">
      <div className="flex items-center justify-between gap-3 text-white/45">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </span>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-white/40">{detail}</p>
    </div>
  );
}

function formatPlanName(plan?: string | null) {
  if (!plan) return "Free";
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

function getPostureLabel(coveragePercent: number, totalFilesCount: number) {
  if (totalFilesCount === 0) return "Awaiting first codebase";
  if (coveragePercent >= 80) return "Operational posture healthy";
  if (coveragePercent >= 50) return "Coverage needs review";
  return "Coverage gap detected";
}

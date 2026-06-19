"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  GitBranch,
  RadioTower,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import type { Hotspot, PriorityAction } from "@/app/dashboard/actions";
import type {
  IdeActivityEntry,
  MonitoringCodebase,
  ProjectMonitoringData,
} from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "good" | "warn" | "bad";

interface FileWithDocs {
  id: string;
  name: string;
  language: string;
  size: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  documentation: {
    content: string;
    verifiedAt?: Date | string | null;
    status: string;
  } | null;
}

interface CommandCenterProps {
  teamId?: string;
  files: FileWithDocs[];
  priorityActions: PriorityAction[];
  hotspots: Hotspot[];
  totalFilesCount: number;
  verifiedDocsCount: number;
  projectMonitoring: ProjectMonitoringData;
}

interface WorkspaceSummary {
  totalFiles: number;
  totalLOC: number;
  documentedCount: number;
  undocumentedCount: number;
  coveragePercent: number;
  avgRisk: number;
  criticalCount: number;
}

function dashboardHref(fileId: string, teamId?: string) {
  return `/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${fileId}`;
}

function formatUpdatedAt(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "recently"
    : formatDistanceToNow(date, { addSuffix: true });
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function fallbackSummary(
  totalFilesCount: number,
  verifiedDocsCount: number,
): WorkspaceSummary {
  return {
    totalFiles: totalFilesCount,
    totalLOC: 0,
    documentedCount: verifiedDocsCount,
    undocumentedCount: Math.max(0, totalFilesCount - verifiedDocsCount),
    coveragePercent:
      totalFilesCount > 0
        ? Math.round((verifiedDocsCount / totalFilesCount) * 100)
        : 0,
    avgRisk: 0,
    criticalCount: 0,
  };
}

function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.04] text-white/55",
    good: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-400/20 bg-amber-500/10 text-amber-300",
    bad: "border-rose-400/20 bg-rose-500/10 text-rose-300",
  }[tone];

  return (
    <span
      className={cn(
        "rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.04] text-slate-300",
    good: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-400/20 bg-amber-500/10 text-amber-300",
    bad: "border-rose-400/20 bg-rose-500/10 text-rose-300",
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12]/95 p-4 shadow-xl shadow-black/20">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>
        <div className={cn("rounded-lg border p-2", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/40">{detail}</p>
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12]/95 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-5 text-white/40">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-black/15 px-3 py-6 text-center text-sm text-white/35">
      {children}
    </div>
  );
}

function CommandCenterHero({
  summary,
  recentFile,
  teamId,
  projectMonitoring,
}: {
  summary: WorkspaceSummary;
  recentFile?: FileWithDocs;
  teamId?: string;
  projectMonitoring: ProjectMonitoringData;
}) {
  const coverageTone: Tone =
    summary.coveragePercent >= 80
      ? "good"
      : summary.coveragePercent >= 50
        ? "warn"
        : "bad";

  return (
    <section className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12]/95 shadow-xl shadow-black/20">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/0 via-primary/70 to-primary/0" />
      <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="good">Operational</StatusPill>
            <StatusPill tone={coverageTone}>
              Coverage {summary.coveragePercent}%
            </StatusPill>
            <StatusPill>{projectMonitoring.ideRuns7d} IDE runs / 7d</StatusPill>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Documentation command center
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              Control-plane overview for indexed files, documentation posture,
              monitored codebases, and AI-assisted remediation work.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Resume workflow
          </p>
          {recentFile ? (
            <Link
              href={dashboardHref(recentFile.id, teamId)}
              className="group mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {recentFile.name}
                  </p>
                  <p className="mt-0.5 text-xs text-white/35">
                    {formatUpdatedAt(recentFile.updatedAt)}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
            </Link>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-white/10 p-3 text-xs text-white/35">
              Upload or import a codebase to start a workflow.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PriorityActionRow({
  action,
  teamId,
}: {
  action: PriorityAction;
  teamId?: string;
}) {
  const tone = {
    CRITICAL: "bg-rose-400",
    HIGH: "bg-amber-400",
    MEDIUM: "bg-yellow-300",
    LOW: "bg-slate-400",
  }[action.priority];

  return (
    <Link
      href={dashboardHref(action.fileId, teamId)}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-white/5"
    >
      <span className={cn("h-2 w-2 rounded-full", tone)} />
      <span className="min-w-0 flex-1 truncate text-white/70 group-hover:text-white">
        {action.label}
      </span>
      <span className="rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-medium text-white/35">
        {action.priority}
      </span>
    </Link>
  );
}

function RecentFileRow({
  file,
  teamId,
}: {
  file: FileWithDocs;
  teamId?: string;
}) {
  const documented = Boolean(file.documentation);

  return (
    <Link
      href={dashboardHref(file.id, teamId)}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/5"
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border",
          documented
            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
            : "border-white/8 bg-white/5 text-white/45",
        )}
      >
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/75 group-hover:text-white">
          {file.name}
        </p>
        <p className="mt-0.5 text-xs text-white/35">
          {file.language || "text"} · {formatBytes(file.size)} ·{" "}
          {formatUpdatedAt(file.updatedAt)}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/45" />
    </Link>
  );
}

function CodebaseRow({ codebase }: { codebase: MonitoringCodebase }) {
  const statusTone: Tone = codebase.docsVerified
    ? "good"
    : codebase.hasDocs
      ? "warn"
      : "neutral";
  const statusLabel = codebase.docsVerified
    ? "Verified"
    : codebase.hasDocs
      ? "Generated"
      : "Pending";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/50">
          <GitBranch className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/75">
            {codebase.name}
          </p>
          <p className="mt-0.5 text-xs text-white/35">
            {codebase.source.toLowerCase()} · {codebase.language ?? "mixed"} ·{" "}
            {codebase.fileCount} files · {formatBytes(codebase.totalSizeBytes)} ·{" "}
            {formatUpdatedAt(codebase.lastActivityAt)}
          </p>
        </div>
      </div>
      <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
    </div>
  );
}

function ActivityRow({ activity }: { activity: IdeActivityEntry }) {
  const tone = {
    info: "neutral",
    success: "good",
    warning: "warn",
    error: "bad",
  } satisfies Record<IdeActivityEntry["severity"], Tone>;

  return (
    <div className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-primary">
        <TerminalSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-white/75">
            {activity.label}
          </p>
          <StatusPill tone={tone[activity.severity]}>
            {activity.severity}
          </StatusPill>
        </div>
        <p className="mt-0.5 text-xs text-white/35">
          {activity.action} · {formatUpdatedAt(activity.createdAt)}
        </p>
      </div>
    </div>
  );
}

function HotspotRow({
  hotspot,
  teamId,
}: {
  hotspot: Hotspot;
  teamId?: string;
}) {
  const tone =
    hotspot.riskScore > 70 ? "bad" : hotspot.riskScore > 40 ? "warn" : "good";
  const toneClass = {
    good: "bg-emerald-400",
    warn: "bg-amber-400",
    bad: "bg-rose-400",
  }[tone];

  return (
    <Link
      href={dashboardHref(hotspot.id, teamId)}
      className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", toneClass)} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/75 group-hover:text-white">
            {hotspot.name}
          </p>
          <p className="mt-0.5 text-xs text-white/35">
            {hotspot.isDocumented ? "Documented" : "Missing documentation"}
          </p>
        </div>
      </div>
      <span className="rounded border border-white/8 px-2 py-1 text-xs font-semibold text-white/55">
        {hotspot.riskScore}
      </span>
    </Link>
  );
}

export function CommandCenter({
  teamId,
  files,
  priorityActions,
  hotspots,
  totalFilesCount,
  verifiedDocsCount,
  projectMonitoring,
}: CommandCenterProps) {
  const [summary, setSummary] = useState<WorkspaceSummary>(() =>
    fallbackSummary(totalFilesCount, verifiedDocsCount),
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (teamId) params.set("teamId", teamId);

    fetch(`/api/files/metrics?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { summary?: WorkspaceSummary } | null) => {
        if (data?.summary) setSummary(data.summary);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSummary(fallbackSummary(totalFilesCount, verifiedDocsCount));
      });

    return () => controller.abort();
  }, [teamId, totalFilesCount, verifiedDocsCount]);

  const recentFiles = useMemo(() => {
    return [...files]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 6);
  }, [files]);

  const coverageTone: Tone =
    summary.coveragePercent >= 80
      ? "good"
      : summary.coveragePercent >= 50
        ? "warn"
        : "bad";
  const hotspotTone: Tone =
    summary.criticalCount > 0 ? "bad" : hotspots.length > 0 ? "warn" : "good";
  const monitoredCodebases = projectMonitoring.codebases.slice(0, 5);
  const activityFeed = projectMonitoring.ideActivity.slice(0, 5);

  return (
    <div className="space-y-4">
      <CommandCenterHero
        summary={summary}
        recentFile={recentFiles[0]}
        teamId={teamId}
        projectMonitoring={projectMonitoring}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Files"
          value={summary.totalFiles.toLocaleString()}
          detail={
            summary.totalLOC
              ? `${summary.totalLOC.toLocaleString()} lines indexed`
              : "Workspace files indexed"
          }
          icon={FolderOpen}
        />
        <MetricCard
          label="Documentation"
          value={`${summary.coveragePercent}%`}
          detail={`${summary.documentedCount} documented · ${summary.undocumentedCount} remaining`}
          icon={ShieldCheck}
          tone={coverageTone}
        />
        <MetricCard
          label="Priority work"
          value={priorityActions.length}
          detail="Open documentation and review actions"
          icon={AlertTriangle}
          tone={priorityActions.length > 0 ? "warn" : "good"}
        />
        <MetricCard
          label="Hotspots"
          value={hotspots.length}
          detail={
            summary.criticalCount > 0
              ? `${summary.criticalCount} critical files`
              : "Risk-weighted project files"
          }
          icon={BarChart3}
          tone={hotspotTone}
        />
        <MetricCard
          label="Codebases"
          value={projectMonitoring.totalCount.toLocaleString()}
          detail="Monitored source surfaces"
          icon={RadioTower}
          tone={projectMonitoring.totalCount > 0 ? "good" : "neutral"}
        />
        <MetricCard
          label="AI activity"
          value={projectMonitoring.ideRuns7d.toLocaleString()}
          detail="IDE-assisted runs in 7 days"
          icon={Sparkles}
          tone={projectMonitoring.ideRuns7d > 0 ? "good" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section
          title="Monitored codebases"
          description="Source surfaces currently tracked by the documentation control plane."
          action={<StatusPill>{projectMonitoring.totalCount} total</StatusPill>}
        >
          <div className="max-h-72 overflow-y-auto">
            {monitoredCodebases.length > 0 ? (
              monitoredCodebases.map((codebase) => (
                <CodebaseRow key={codebase.id} codebase={codebase} />
              ))
            ) : (
              <EmptyRow>No monitored codebases yet.</EmptyRow>
            )}
          </div>
        </Section>

        <Section
          title="AI / IDE activity"
          description="Recent agent and IDE execution signals across this workspace."
          action={<StatusPill>{projectMonitoring.ideRuns7d} runs</StatusPill>}
        >
          <div className="max-h-72 overflow-y-auto">
            {activityFeed.length > 0 ? (
              activityFeed.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))
            ) : (
              <EmptyRow>No recent IDE activity.</EmptyRow>
            )}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section
          title="Priority work"
          description="Ranked remediation queue for documentation coverage and review operations."
          action={
            <StatusPill tone={priorityActions.length > 0 ? "warn" : "good"}>
              {priorityActions.length} open
            </StatusPill>
          }
        >
          <div className="max-h-72 overflow-y-auto">
            {priorityActions.length > 0 ? (
              priorityActions.slice(0, 8).map((action) => (
                <PriorityActionRow
                  key={action.id}
                  action={action}
                  teamId={teamId}
                />
              ))
            ) : (
              <EmptyRow>No priority actions right now.</EmptyRow>
            )}
          </div>
        </Section>

        <Section
          title="Recent files"
          description="Latest code surfaces changed or analyzed in this workspace."
          action={<StatusPill>Latest changes</StatusPill>}
        >
          <div className="max-h-72 overflow-y-auto">
            {recentFiles.length > 0 ? (
              recentFiles.map((file) => (
                <RecentFileRow key={file.id} file={file} teamId={teamId} />
              ))
            ) : (
              <EmptyRow>No files uploaded yet.</EmptyRow>
            )}
          </div>
        </Section>
      </div>

      <Section
        title="Project hotspots"
        description="Risk-weighted files that deserve attention before docs drift into stale state."
        action={
          <Link
            href={
              teamId
                ? `/dashboard/analytics?teamId=${teamId}`
                : "/dashboard/analytics"
            }
            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55 transition-colors hover:text-white"
          >
            Analytics
          </Link>
        }
      >
        <div className="max-h-80 overflow-y-auto">
          {hotspots.length > 0 ? (
            hotspots.slice(0, 10).map((hotspot) => (
              <HotspotRow key={hotspot.id} hotspot={hotspot} teamId={teamId} />
            ))
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-400/10 bg-emerald-500/5 px-3 py-8 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No high-risk files detected.
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

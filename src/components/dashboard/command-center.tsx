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
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import type { Hotspot, PriorityAction } from "@/app/dashboard/actions";
import { cn } from "@/lib/utils";

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
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "text-slate-300 bg-white/5 border-white/10",
    good: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
    warn: "text-amber-300 bg-amber-500/10 border-amber-400/20",
    bad: "text-rose-300 bg-rose-500/10 border-rose-400/20",
  }[tone];

  return (
    <div className="rounded-xl border border-white/8 bg-[#0d0d12] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-white/45">{label}</p>
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
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/8 bg-[#0d0d12]">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-6 text-center text-sm text-white/35">
      {children}
    </div>
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
          {file.language || "text"} · {formatUpdatedAt(file.updatedAt)}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/45" />
    </Link>
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
        if (error instanceof DOMException && error.name === "AbortError")
          return;
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

  const coverageTone =
    summary.coveragePercent >= 80
      ? "good"
      : summary.coveragePercent >= 50
        ? "warn"
        : "bad";
  const hotspotTone =
    summary.criticalCount > 0 ? "bad" : hotspots.length > 0 ? "warn" : "good";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Files"
          value={summary.totalFiles.toLocaleString()}
          detail={`${summary.totalLOC ? `${summary.totalLOC.toLocaleString()} lines indexed` : "Workspace files indexed"}`}
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
      </div>

      {recentFiles[0] && (
        <Link
          href={dashboardHref(recentFiles[0].id, teamId)}
          className="group flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-[#0d0d12] p-4 transition-colors hover:bg-white/5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/60">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-white/35">
                Continue where you left off
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {recentFiles[0].name}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section
          title="Priority work"
          action={
            <span className="text-xs text-white/35">
              {priorityActions.length} open
            </span>
          }
        >
          <div className="max-h-72 overflow-y-auto">
            {priorityActions.length > 0 ? (
              priorityActions
                .slice(0, 8)
                .map((action) => (
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
          action={<span className="text-xs text-white/35">Latest changes</span>}
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
        action={
          teamId ? (
            <Link
              href={`/dashboard/analytics?teamId=${teamId}`}
              className="text-xs text-white/45 hover:text-white"
            >
              Analytics
            </Link>
          ) : (
            <Link
              href="/dashboard/analytics"
              className="text-xs text-white/45 hover:text-white"
            >
              Analytics
            </Link>
          )
        }
      >
        <div className="max-h-80 overflow-y-auto">
          {hotspots.length > 0 ? (
            hotspots
              .slice(0, 10)
              .map((hotspot) => (
                <HotspotRow
                  key={hotspot.id}
                  hotspot={hotspot}
                  teamId={teamId}
                />
              ))
          ) : (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No high-risk files detected.
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

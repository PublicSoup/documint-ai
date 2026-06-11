import type { ProjectViewMode } from "@/components/doc-editor";
import type { DashboardOnboardingContext, DashboardSearchParams } from "./types";

const PROJECT_VIEW_MODES = new Set<ProjectViewMode>([
  "docs",
  "code",
  "history",
  "archaeology",
  "deep-audit",
]);

export function getSearchParam(params: DashboardSearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function getProjectViewMode(raw: string | undefined): ProjectViewMode {
  if (raw === "standard") return "docs";
  return raw && PROJECT_VIEW_MODES.has(raw as ProjectViewMode) ? (raw as ProjectViewMode) : "docs";
}

export function getOnboardingContext(params: DashboardSearchParams): DashboardOnboardingContext {
  const intentRaw = getSearchParam(params, "intent");
  const planRaw = getSearchParam(params, "plan");
  const sourceRaw = getSearchParam(params, "source");

  return {
    intent: intentRaw === "trial" ? "trial" : "signup",
    plan: planRaw === "starter" || planRaw === "pro" || planRaw === "team" ? planRaw : null,
    source: sourceRaw && /^[a-z0-9_\-]{1,80}$/i.test(sourceRaw) ? sourceRaw : null,
  };
}

export function isCodebasesViewEnabled(params: DashboardSearchParams): boolean {
  const raw = getSearchParam(params, "codebasesView");
  return raw === "v2" || raw === "1" || raw === "true";
}

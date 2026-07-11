"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createDemoProject,
  getProjectGraphMermaid,
  type GraphFetchResult,
} from "@/app/dashboard/client-actions";

export type ArchitectureToast = { kind: "success" | "error"; message: string };

export function useProjectGraph(teamId?: string) {
  const [graph, setGraph] = useState<GraphFetchResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [toast, setToast] = useState<ArchitectureToast | null>(null);
  // null → visualize all files; otherwise scope to a single project (top-level folder).
  const [project, setProjectState] = useState<string | null>(null);
  const inflightRef = useRef<AbortController | null>(null);
  const projectRef = useRef<string | null>(null);

  const refreshGraph = useCallback(
    async (mode: "initial" | "refresh" = "initial", projectOverride?: string | null) => {
      inflightRef.current?.abort();
      const controller = new AbortController();
      inflightRef.current = controller;

      const scopedProject = projectOverride !== undefined ? projectOverride : projectRef.current;

      setIsRefreshing(true);
      setRenderError(null);

      try {
        const result = await getProjectGraphMermaid(teamId, {
          project: scopedProject,
          fresh: mode === "refresh",
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setGraph(result);
      } catch (error) {
        if (controller.signal.aborted) return;
        setGraph({
          isRealData: false,
          code: "UNKNOWN",
          message: error instanceof Error ? error.message : "Failed to load graph",
          statusCode: 0,
        });
      } finally {
        if (!controller.signal.aborted) setIsRefreshing(false);
      }
    },
    [teamId],
  );

  // Changing the selected project immediately refetches the scoped graph.
  const setProject = useCallback(
    (next: string | null) => {
      projectRef.current = next;
      setProjectState(next);
      void refreshGraph("refresh", next);
    },
    [refreshGraph],
  );

  const loadDemoProject = useCallback(async () => {
    setLoadingDemo(true);
    try {
      const result = await createDemoProject(teamId);
      if (!result.success) {
        setToast({ kind: "error", message: result.message ?? "Failed to load demo project" });
        return;
      }

      const created = result.createdFileIds.length;
      setToast({
        kind: "success",
        message: created > 0
          ? `Seeded ${created} demo files — refreshing graph.`
          : (result.message ?? "Demo files already present — refreshing graph."),
      });
      await refreshGraph("refresh");
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Failed to load demo project" });
    } finally {
      setLoadingDemo(false);
    }
  }, [teamId, refreshGraph]);

  useEffect(() => {
    refreshGraph("initial");
    return () => inflightRef.current?.abort();
  }, [refreshGraph]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const projects = graph?.isRealData === true ? graph.projects ?? [] : [];

  return {
    graph,
    isRefreshing,
    loadingDemo,
    renderError,
    setRenderError,
    toast,
    refreshGraph,
    loadDemoProject,
    project,
    setProject,
    projects,
  };
}

import mermaid from "mermaid";

import { sanitizeMermaidInput, sanitizeSvg } from "./svg-sanitize";

let mermaidInitPromise: Promise<void> | null = null;

export function ensureMermaidInitialized(): Promise<void> {
  if (mermaidInitPromise) return mermaidInitPromise;

  mermaidInitPromise = (async () => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        darkMode: true,
        background: "#0c0c0e",
        primaryColor: "#3b82f6",
        primaryTextColor: "#e2e8f0",
        primaryBorderColor: "#6366f1",
        lineColor: "#6366f1",
        secondaryColor: "#10b981",
        tertiaryColor: "#1e1b4b",
        edgeLabelBackground: "#1e1b4b",
        nodeTextColor: "#e2e8f0",
        clusterBkg: "#1a1a2e",
        clusterBorder: "#334155",
        titleColor: "#e2e8f0",
      },
      securityLevel: "strict",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      flowchart: {
        htmlLabels: false,
        curve: "basis",
        padding: 16,
        nodeSpacing: 40,
        rankSpacing: 50,
      },
    });
  })();

  return mermaidInitPromise;
}

export async function renderMermaidDiagram(id: string, code: string): Promise<string> {
  await ensureMermaidInitialized();
  const rendered = await mermaid.render(id, sanitizeMermaidInput(code));
  return sanitizeSvg(rendered.svg);
}

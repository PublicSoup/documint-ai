import { inngest } from "../client";
import { analyzeFullCodebase } from "@/lib/ai";
import { logAudit } from "@/lib/audit-logger";

export const analyzeCodebaseFunction = inngest.createFunction(
    { id: "analyze-full-codebase" },
    { event: "codebase.analyze.full" },
    // @ts-ignore
    async ({ event, step }: any) => {
        const { userId } = event.data;

        // 1. Perform heavy LLM analysis in a resilient step
        const analysis = await step.run("analyze-codebase-ai", async () => {
            return await analyzeFullCodebase(userId);
        });

        // 2. Save result to DB or cache (simulate saving for now since we don't have a specific table for just the raw text yet)
        await step.run("save-analysis-result", async () => {
            // Note: In an enterprise app, this would save to a persistent `CodebaseAnalysis` Prisma table
            // For now, it runs strictly in the background removing serverless timeouts.
        });

        // 3. Log Audit
        await step.run("log-audit-creation", async () => {
            await logAudit({
                userId,
                action: "ANALYZE_FULL_CODEBASE_COMPLETE",
                entity: "User",
                entityId: userId,
            });
        });

        return { success: true, analysisLength: analysis.length };
    }
);

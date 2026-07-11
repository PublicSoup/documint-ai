import { inngest } from "../client";
import { db } from "@/lib/db";
import { runAutomaticReview, normalizePolicy } from "@/lib/code-review";

/**
 * Automatic AI code review, dispatched from the GitHub webhook on
 * pull_request (opened / synchronize / reopened) events.
 *
 * Runs in the background so heavy LLM work never risks a serverless timeout,
 * and Inngest gives us automatic retries + concurrency control per repo.
 */
export const codeReviewFunction = inngest.createFunction(
    {
        id: "auto-code-review",
        // One in-flight review per PR — a rapid push/sync supersedes the previous run.
        concurrency: { key: "event.data.repoFullName + event.data.prNumber", limit: 1 },
        triggers: [{ event: "code-review.requested" }],
    },
    async ({ event, step }: {
        event: { data: Record<string, unknown> };
        step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
    }) => {
        const { repoFullName, prNumber, prTitle, ownerUserId, teamId, policyId } = event.data as {
            repoFullName: string;
            prNumber: number;
            prTitle?: string;
            ownerUserId: string;
            teamId?: string | null;
            policyId?: string | null;
        };

        // Re-load the policy inside the job so edits made after enqueue are honoured.
        const policy = await step.run("load-policy", async () => {
            if (!policyId) return null;
            const p = await db.reviewPolicy.findUnique({ where: { id: policyId } });
            if (!p) return null;
            return normalizePolicy({
                enabled: p.enabled,
                autoReview: p.autoReview,
                postComments: p.postComments,
                postStatus: p.postStatus,
                blockingSeverity: p.blockingSeverity,
                checks: p.checks,
                ignorePaths: p.ignorePaths,
                instructions: p.instructions,
            });
        });

        const result = await step.run("run-review", async () => {
            return runAutomaticReview({
                repoFullName,
                prNumber,
                prTitle,
                ownerUserId,
                teamId: teamId ?? null,
                source: "AUTO",
                policy: policy ?? undefined,
            });
        });

        return result;
    },
);

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { inngest } from "@/inngest/client";
import { hasFeatureAccess } from "@/lib/subscription";

const webhookSecret = env.GITHUB_WEBHOOK_SECRET;

// Only these PR actions warrant a (re-)review.
const REVIEWABLE_PR_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"]);

const pullRequestPayloadSchema = z.object({
    action: z.string(),
    number: z.number().int().positive(),
    pull_request: z.object({
        title: z.string().optional(),
        draft: z.boolean().optional(),
    }).passthrough(),
    repository: z.object({
        full_name: z.string().min(1),
    }).passthrough(),
}).passthrough();

/**
 * Handle a `pull_request` webhook: if the repo has an enabled, plan-entitled
 * review policy, enqueue a background AI review. Fast + non-blocking — the
 * heavy lifting happens in the Inngest `auto-code-review` function.
 */
async function handlePullRequest(body: string): Promise<NextResponse> {
    const parsed = pullRequestPayloadSchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const { action, number: prNumber, pull_request: pr, repository } = parsed.data;

    if (!REVIEWABLE_PR_ACTIONS.has(action) || pr.draft === true) {
        return NextResponse.json({ message: "PR event ignored", action });
    }

    const policy = await db.reviewPolicy.findUnique({ where: { repoFullName: repository.full_name } });
    if (!policy || !policy.enabled || !policy.autoReview) {
        return NextResponse.json({ message: "No active review policy for repo" });
    }

    // Enforce plan entitlement at trigger time — a downgraded owner stops auto-reviews.
    const entitled = await hasFeatureAccess(policy.ownerUserId, "autoCodeReview");
    if (!entitled) {
        return NextResponse.json({ message: "Review policy owner not entitled" });
    }

    await inngest.send({
        name: "code-review.requested",
        data: {
            repoFullName: repository.full_name,
            prNumber,
            prTitle: pr.title ?? null,
            ownerUserId: policy.ownerUserId,
            teamId: policy.teamId ?? null,
            policyId: policy.id,
        },
    });

    return NextResponse.json({ message: "Review queued", repo: repository.full_name, prNumber });
}

const commitSchema = z.object({
    modified: z.array(z.string()).optional(),
    added: z.array(z.string()).optional(),
    removed: z.array(z.string()).optional(),
}).strict();

const pushPayloadSchema = z.object({
    repository: z.object({
        full_name: z.string().min(1),
    }).strict(),
    commits: z.array(commitSchema).default([]),
}).strict();

interface DocMetadata {
    repo?: string;
    path?: string;
}

type DocToUpdate = {
    id: string;
    metadata: unknown;
    fileId: string;
    file: {
        name:string;
        teamId: string | null;
    };
};

function hasValidSignature(body: string, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac("sha256", secret);
    const digest = Buffer.from(`sha256=${hmac.update(body).digest("hex")}`, "utf8");
    const checksum = Buffer.from(signature, "utf8");

    if (checksum.length !== digest.length) {
        return false;
    }

    return crypto.timingSafeEqual(digest, checksum);
}

export async function POST(req: NextRequest) {
    if (!webhookSecret) {
        console.error("GITHUB_WEBHOOK_SECRET not set");
        return NextResponse.json({ error: "Server config error" }, { status: 500 });
    }

    try {
        const clientIp = await getClientIP(req);
        await enforceRateLimit(clientIp, "security");

        const body = await req.text();
        const signature = req.headers.get("x-hub-signature-256");
        const event = req.headers.get("x-github-event") || "";

        if (!signature) {
            return NextResponse.json({ error: "Missing signature" }, { status: 401 });
        }

        if (!hasValidSignature(body, signature, webhookSecret)) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        if (event === "pull_request") {
            return await handlePullRequest(body);
        }

        if (event !== "push") {
            return NextResponse.json({ message: "Ignored event" });
        }

        const parsedPayload = pushPayloadSchema.safeParse(JSON.parse(body));
        if (!parsedPayload.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const payload = parsedPayload.data;
        const repoName = payload.repository.full_name;

        const changedFiles = new Set<string>();
        payload.commits.forEach((commit) => {
            (commit.modified || []).forEach((file) => changedFiles.add(file));
            (commit.added || []).forEach((file) => changedFiles.add(file));
            (commit.removed || []).forEach((file) => changedFiles.add(file));
        });

        const filesList = Array.from(changedFiles);
        if (filesList.length === 0) {
            return NextResponse.json({
                message: "Processed push event",
                uniqueFilesChanged: 0,
                docsFlagged: 0,
            });
        }

        const docsToUpdate = await db.documentation.findMany({
            where: {
                metadata: {
                    path: ["repo"],
                    equals: repoName,
                },
            },
            select: {
                id: true,
                metadata: true,
                fileId: true,
                file: {
                    select: { name: true, teamId: true },
                },
            },
        });

        const affectedDocs = docsToUpdate.filter((doc: DocToUpdate) => {
            const metadata = (doc.metadata as DocMetadata | null) || {};
            return typeof metadata.path === "string" && filesList.includes(metadata.path);
        });

        if (affectedDocs.length === 0) {
            return NextResponse.json({
                message: "Processed push event",
                uniqueFilesChanged: filesList.length,
                docsFlagged: 0,
            });
        }

        const affectedDocIds = affectedDocs.map((doc: DocToUpdate) => doc.id);

        await db.documentation.updateMany({
            where: { id: { in: affectedDocIds } },
            data: {
                status: "DRAFT",
                updatedAt: new Date(),
            },
        });

        const host = req.headers.get("host") || "localhost:3000";
        const forwardedProto = req.headers.get("x-forwarded-proto");
        const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");
        const baseUrl = `${protocol}://${host}`;

        const teamFiles = new Map<string, string[]>();

        for (const doc of affectedDocs) {
            try {
                const { logAudit } = await import("@/lib/audit-logger");
                await logAudit({
                    action: "GITHUB_SYNC_DRIFT",
                    entity: "Documentation",
                    entityId: doc.id,
                    userId: "SYSTEM",
                    details: {
                        repo: repoName,
                        path: ((doc.metadata as DocMetadata | null) || {}).path || null,
                        reason: "External push detected",
                    },
                });
            } catch {
                // Non-blocking
            }

            if (doc.file.teamId) {
                const existing = teamFiles.get(doc.file.teamId) || [];
                existing.push(doc.file.name);
                teamFiles.set(doc.file.teamId, existing);
            }

            fetch(`${baseUrl}/api/regenerate/${doc.fileId}`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ draft: true }),
            }).catch(() => {
                // Non-blocking
            });
        }

        for (const [teamId, fileNames] of teamFiles.entries()) {
            const fileListString =
                fileNames.length > 3
                    ? `${fileNames.slice(0, 3).join(", ")} and ${fileNames.length - 3} more`
                    : fileNames.join(", ");

            await sendNotification({
                teamId,
                type: "DOC_DRIFT",
                title: "External Code Changes Detected",
                message: `A GitHub push to **${repoName}** changed code for **${fileListString}**. Documentation was marked as DRAFT and regeneration drafts are being prepared.`,
            });
        }

        return NextResponse.json({
            message: "Processed push event",
            uniqueFilesChanged: filesList.length,
            docsFlagged: affectedDocs.length,
        });
    } catch (error) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
    }
}

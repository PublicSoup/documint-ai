import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import crypto from "crypto";
import { safeJsonParse } from "@/lib/utils";
import { env } from "@/lib/env";

const WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET;

export async function POST(req: Request) {
    if (!WEBHOOK_SECRET) {
        console.error("GITHUB_WEBHOOK_SECRET not set");
        return NextResponse.json({ error: "Server config error" }, { status: 500 });
    }

    try {
        const body = await req.text();
        const headerStore = await headers();
        const signature = headerStore.get("x-hub-signature-256");

        if (!signature) {
            return NextResponse.json({ error: "Missing signature" }, { status: 401 });
        }

        const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
        const digest = Buffer.from("sha256=" + hmac.update(body).digest("hex"), "utf8");
        const checksum = Buffer.from(signature, "utf8");

        if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        const payload = safeJsonParse(body, {} as any);

        // Handle Push Event
        if (headerStore.get("x-github-event") === "push") {
            const repoName = payload.repository.full_name; // e.g., "user/repo"
            const commits = payload.commits;
            console.log(`Received push for ${repoName} with ${commits.length} commits`);

            // 1. Find the User/Team connected to this repo
            // Implementation detail: We need a 'Repository' model or check GitHubConnection
            // For MVP: Search User with GitHubConnection username matching repo owner?
            // Expensive. 
            // Better: 'Installation' ID from payload.

            // 2. Queue regeneration for modified files
            // commits.forEach(c => c.modified.forEach(file => ...))

            // 3. Trigger AI Agent (Mocked)
            // await queueJob("regenerate-docs", { repo: repoName, files: modifiedFiles });

            return NextResponse.json({ message: "Processed push event" });
        }

        return NextResponse.json({ message: "Ignored event" });

    } catch (error) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
    }
}

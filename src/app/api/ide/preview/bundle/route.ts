import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bundleSpaPreview, resolveEntry } from "@/lib/ide/spa-bundler";

// esbuild is a native binary — it must run on the Node runtime, not the edge.
export const runtime = "nodejs";
export const maxDuration = 30;

const workspaceFileSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1)
        .max(512)
        .refine((name) => !name.includes("..") && !name.startsWith("/"), "Unsafe file path"),
    content: z.string().max(512 * 1024),
}).strict();

const bundleSchema = z.object({
    files: z.array(workspaceFileSchema).min(1).max(200),
    entryFile: z.string().trim().min(1).max(512).optional(),
    html: z.string().max(512 * 1024).optional(),
}).strict();

/**
 * Tier 2 preview bundling. Compiles a React/Vite-style workspace into one
 * self-contained script so the IDE can preview it inline (see
 * src/lib/ide/spa-bundler.ts) — no `npm install`, no dev server, and no billed
 * sandbox VM. Typically a few milliseconds of CPU on the existing server.
 *
 * A failure here is expected and non-fatal: the caller falls back to the
 * WebContainer runtime (desktop) or the server sandbox.
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();

        await enforceRateLimit(session.user.id, "api");
        const body = await validateBody(req, bundleSchema);

        const entry = body.entryFile ?? resolveEntry(body.files, body.html);
        if (!entry) {
            return NextResponse.json(
                { ok: false, errors: ["No JS/TS entry point found for the fast preview."] },
                { status: 422 },
            );
        }

        const outcome = await bundleSpaPreview({ files: body.files, entry });
        if (!outcome.ok) {
            return NextResponse.json(outcome, { status: 422 });
        }

        return NextResponse.json(outcome);
    } catch (error) {
        return errorResponse(error);
    }
}

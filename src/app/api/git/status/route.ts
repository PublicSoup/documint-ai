import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const execFileAsync = promisify(execFile);

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], {
            cwd: process.cwd(),
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
        });

        return NextResponse.json({ status: stdout.trim() });
    } catch (error) {
        return errorResponse(error);
    }
}

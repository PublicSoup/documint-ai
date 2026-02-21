import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { authOptions } from "@/lib/auth";

const execFileAsync = promisify(execFile);

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], {
            cwd: process.cwd(),
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
        });

        return NextResponse.json({ status: stdout.trim() });
    } catch (error) {
        console.error("[GitStatus_API] Error:", error);
        return NextResponse.json({ error: "Failed to read git status" }, { status: 500 });
    }
}

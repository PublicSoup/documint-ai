import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors, successResponse } from "@/lib/api-utils";
import { getUserSubscription } from "@/lib/subscription";
import { logAudit } from "@/lib/audit-logger";

const seedSchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

interface DemoFile {
    name: string;
    language: string;
    content: string;
    size: number;
}

interface CreatedFile {
    id: string;
    name: string;
}

// A curated set of files that produces a small but expressive dependency
// graph: components, hooks, lib utilities, a page, and an API route.
const DEMO_FILES: DemoFile[] = [
    {
        name: "demo/src/lib/utils.ts",
        language: "typescript",
        size: 0,
        content: `// Demo utility — used by components and the API route.
export function formatDate(input: Date | string): string {
    const d = typeof input === "string" ? new Date(input) : input;
    return d.toISOString().split("T")[0];
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
}
`,
    },
    {
        name: "demo/src/lib/auth.ts",
        language: "typescript",
        size: 0,
        content: `// Demo auth helper.
export interface SessionUser {
    id: string;
    email: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export function canEdit(user: SessionUser | null): boolean {
    if (!user) return false;
    return user.role === "OWNER" || user.role === "ADMIN";
}
`,
    },
    {
        name: "demo/src/hooks/useToggle.ts",
        language: "typescript",
        size: 0,
        content: `// Demo hook — toggles a boolean.
import { useState, useCallback } from "react";

export function useToggle(initial = false): [boolean, () => void, (next: boolean) => void] {
    const [value, setValue] = useState<boolean>(initial);
    const toggle = useCallback(() => setValue((v) => !v), []);
    const set = useCallback((next: boolean) => setValue(next), []);
    return [value, toggle, set];
}
`,
    },
    {
        name: "demo/src/components/Button.tsx",
        language: "typescript",
        size: 0,
        content: `// Demo Button component.
import { classNames } from "@/lib/utils";
import type { ReactNode } from "react";

interface ButtonProps {
    children: ReactNode;
    onClick?: () => void;
    variant?: "primary" | "secondary";
}

export function Button({ children, onClick, variant = "primary" }: ButtonProps) {
    return (
        <button
            onClick={onClick}
            className={classNames("btn", variant === "primary" && "btn-primary")}
        >
            {children}
        </button>
    );
}
`,
    },
    {
        name: "demo/src/components/Card.tsx",
        language: "typescript",
        size: 0,
        content: `// Demo Card component used on the dashboard.
import type { ReactNode } from "react";
import { classNames } from "@/lib/utils";

export function Card({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className={classNames("card", "card-elevated")}>
            <h2>{title}</h2>
            {children}
        </section>
    );
}
`,
    },
    {
        name: "demo/src/app/layout.tsx",
        language: "typescript",
        size: 0,
        content: `// Demo root layout.
import type { ReactNode } from "react";
import { Card } from "@/components/Card";

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html>
            <body>
                <Card title="Demo">{children}</Card>
            </body>
        </html>
    );
}
`,
    },
    {
        name: "demo/src/app/page.tsx",
        language: "typescript",
        size: 0,
        content: `// Demo dashboard page.
import { Button } from "@/components/Button";
import { useToggle } from "@/hooks/useToggle";
import { canEdit, type SessionUser } from "@/lib/auth";

export default function HomePage() {
    const [open, toggle] = useToggle(false);
    const user: SessionUser = { id: "u_demo", email: "demo@example.com", role: "OWNER" };
    return (
        <main>
            <h1>Demo project</h1>
            {canEdit(user) && <Button onClick={toggle}>{open ? "Close" : "Open"}</Button>}
        </main>
    );
}
`,
    },
    {
        name: "demo/src/app/api/hello/route.ts",
        language: "typescript",
        size: 0,
        content: `// Demo API route — depends on the auth helper.
import { NextResponse } from "next/server";
import { canEdit, type SessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export async function GET() {
    const user: SessionUser = { id: "u_demo", email: "demo@example.com", role: "OWNER" };
    if (!canEdit(user)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message: "hi", at: formatDate(new Date()) });
}
`,
    },
    {
        name: "demo/README.md",
        language: "markdown",
        size: 0,
        content: `# Demo project

This is a curated set of files used to demonstrate the
[DocuMint AI](https://www.documintai.dev) architecture visualizer.

It includes:

- 2 components (\`Button\`, \`Card\`)
- 1 hook (\`useToggle\`)
- 2 lib utilities (\`utils\`, \`auth\`)
- 1 dashboard page
- 1 API route
- 1 root layout
`,
    },
];

const DEMO_FILE_LIMIT = 50;

function detectLanguage(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
        ts: "typescript", tsx: "typescript",
        js: "javascript", jsx: "javascript",
        md: "markdown", mdx: "markdown",
    };
    return languageMap[ext ?? ""] ?? "plaintext";
}

/**
 * POST /api/graph/seed-demo
 *
 * Inserts a curated set of demo files into the user's workspace (or a team
 * workspace) so the Architecture tab has something to visualize. Idempotent:
 * existing files with the same name are left untouched and reported in the
 * response.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        await enforceRateLimit(session.user.id, "file_create_bulk");

        const { teamId } = await validateBody(request, seedSchema);

        // Pro/Team gate: seeding demo files is a Pro feature.
        const subscription = await getUserSubscription(session.user.id);
        if (!subscription.isPro && !subscription.isTeam) {
            return NextResponse.json({
                error: "Feature not available on your plan",
                code: "PRO_REQUIRED",
                message: "Upgrade to Pro or Team to seed a demo project for the architecture visualizer.",
                upgradeUrl: "/dashboard/billing",
            }, { status: 403 });
        }

        if (teamId) {
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "edit");
            if (!hasPermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to seed files into this team."));
            }
        }

        // Pre-flight: detect name collisions to keep the operation idempotent.
        const names = DEMO_FILES.map((f) => f.name);
        const existing = await db.file.findMany({
            where: {
                name: { in: names },
                teamId: teamId ?? null,
                userId: teamId ? undefined : session.user.id,
            },
            select: { name: true },
        });
        const existingNames: string[] = existing.map((row: { name: string }) => row.name);
        const existingSet = new Set<string>(existingNames);
        const toCreate: DemoFile[] = DEMO_FILES
            .filter((f) => !existingSet.has(f.name))
            .slice(0, DEMO_FILE_LIMIT);

        if (toCreate.length === 0) {
            return successResponse({
                createdFileIds: [],
                skipped: Array.from(existingSet),
                message: "All demo files already exist; nothing to create.",
            });
        }

        const created = await db.$transaction(
            toCreate.map((f) =>
                db.file.create({
                    data: {
                        name: f.name,
                        content: f.content,
                        language: detectLanguage(f.name),
                        size: f.content.length,
                        userId: teamId ? null : session.user.id,
                        teamId: teamId ?? null,
                        storagePath: `/${f.name}`,
                    },
                    select: { id: true, name: true },
                }),
            ),
        );
        const createdFiles: CreatedFile[] = created;

        try {
            await logAudit({
                userId: session.user.id,
                action: "SEED_DEMO_PROJECT",
                entity: "File",
                entityId: session.user.id,
                details: {
                    createdCount: createdFiles.length,
                    skippedCount: existingSet.size,
                    fileNames: createdFiles.map((c) => c.name),
                    teamId: teamId ?? null,
                },
            });
        } catch (auditError) {
            console.error("Non-blocking audit log failure (seed-demo):", auditError);
        }

        return successResponse({
            createdFileIds: createdFiles.map((c) => c.id),
            skipped: Array.from(existingSet),
        }, 201);
    } catch (error) {
        return errorResponse(error);
    }
}
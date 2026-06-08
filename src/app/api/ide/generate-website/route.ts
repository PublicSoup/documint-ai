import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { getAICompletionWithDetailedError } from "@/lib/ai";
import { getUserSubscription } from "@/lib/subscription";

const websiteFileSchema = z
    .object({
        name: z.string().trim().min(1).max(180),
        content: z.string().max(250_000),
    })
    .strict();

const websiteRequestSchema = z
    .object({
        prompt: z.string().trim().min(10).max(1500),
        style: z.enum(["saas", "agency", "ecommerce", "portfolio", "blog", "custom"]).default("custom"),
        framework: z.enum(["html", "react-vite"]).default("react-vite"),
        includeAuthPages: z.boolean().default(false),
    })
    .strict();

const aiResponseSchema = z
    .object({
        projectName: z.string().trim().min(1).max(80),
        summary: z.string().trim().min(1).max(500),
        launchChecklist: z.array(z.string().trim().min(3).max(160)).min(3).max(8),
        conversionHooks: z.array(z.string().trim().min(3).max(180)).min(2).max(6),
        files: z.array(websiteFileSchema).min(2).max(20),
    })
    .strict();

function stripCodeFences(value: string): string {
    return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function sanitizeFilePath(input: string): string | null {
    const normalized = input.replace(/\\/g, "/").trim();
    if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\0")) {
        return null;
    }

    if (!/^[a-zA-Z0-9@._\-/]+$/.test(normalized)) {
        return null;
    }

    return normalized;
}

type WebsiteFile = { name: string; content: string };

function upsertFile(files: WebsiteFile[], name: string, content: string): WebsiteFile[] {
    const existingIndex = files.findIndex((file) => file.name === name);
    if (existingIndex === -1) return [...files, { name, content }];

    return files.map((file, index) => index === existingIndex ? { ...file, content } : file);
}

function ensureHtmlWebsiteFiles(files: WebsiteFile[]): WebsiteFile[] {
    let normalizedFiles = files;
    if (!normalizedFiles.some((file) => file.name === "index.html")) {
        normalizedFiles = upsertFile(normalizedFiles, "index.html", `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated Website</title>
    <link rel="stylesheet" href="style.css" />
</head>
<body>
    <main class="hero">
        <h1>Your generated website is ready</h1>
        <p>Edit this scaffold to match your launch goals.</p>
        <a href="#" class="button">Get Started</a>
    </main>
    <script src="script.js"></script>
</body>
</html>`);
    }

    if (!normalizedFiles.some((file) => file.name === "style.css")) {
        normalizedFiles = upsertFile(normalizedFiles, "style.css", `* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, system-ui, sans-serif; min-height: 100vh; background: #030014; color: #f8fafc; }
.hero { min-height: 100vh; display: grid; place-items: center; text-align: center; padding: 2rem; }
.button { display: inline-flex; margin-top: 1rem; padding: .75rem 1.25rem; border-radius: 999px; background: #7c3aed; color: white; text-decoration: none; font-weight: 700; }`);
    }

    if (!normalizedFiles.some((file) => file.name === "script.js")) {
        normalizedFiles = upsertFile(normalizedFiles, "script.js", `console.log('Generated website ready');`);
    }

    return normalizedFiles.filter((file) => file.name !== "package.json");
}

function ensureReactViteWebsiteFiles(files: WebsiteFile[]): WebsiteFile[] {
    let normalizedFiles = files;
    normalizedFiles = upsertFile(normalizedFiles, "package.json", JSON.stringify({
        name: "generated-website",
        private: true,
        type: "module",
        scripts: { dev: "vite --host 0.0.0.0", build: "vite build", preview: "vite preview --host 0.0.0.0" },
        dependencies: { "@vitejs/plugin-react": "^4.3.4", vite: "^5.4.14", typescript: "^5.7.3", react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { "@types/react": "^18.3.18", "@types/react-dom": "^18.3.5" }
    }, null, 2));

    if (!normalizedFiles.some((file) => file.name === "index.html")) {
        normalizedFiles = upsertFile(normalizedFiles, "index.html", `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated Website</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
</body>
</html>`);
    }

    if (!normalizedFiles.some((file) => file.name === "src/main.tsx")) {
        normalizedFiles = upsertFile(normalizedFiles, "src/main.tsx", `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);`);
    }

    if (!normalizedFiles.some((file) => file.name === "src/App.tsx")) {
        normalizedFiles = upsertFile(normalizedFiles, "src/App.tsx", `export default function App() {
    return (
        <main className="hero">
            <h1>Your generated website is ready</h1>
            <p>Edit this scaffold to match your launch goals.</p>
            <a href="#" className="button">Get Started</a>
        </main>
    );
}`);
    }

    if (!normalizedFiles.some((file) => file.name === "src/styles.css" || file.name === "src/index.css")) {
        normalizedFiles = upsertFile(normalizedFiles, "src/styles.css", `* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, system-ui, sans-serif; min-height: 100vh; background: #030014; color: #f8fafc; }
.hero { min-height: 100vh; display: grid; place-items: center; text-align: center; padding: 2rem; }
.button { display: inline-flex; margin-top: 1rem; padding: .75rem 1.25rem; border-radius: 999px; background: #7c3aed; color: white; text-decoration: none; font-weight: 700; }`);
    }

    return normalizedFiles;
}

function normalizeGeneratedFiles(files: WebsiteFile[], framework: z.infer<typeof websiteRequestSchema>["framework"]): WebsiteFile[] {
    return framework === "react-vite"
        ? ensureReactViteWebsiteFiles(files)
        : ensureHtmlWebsiteFiles(files);
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Feature Gating & Rate Limiting
        const subscription = await getUserSubscription(session.user.id);
        const isPro = subscription.isPro || subscription.isTeam;

        // If not pro, we might want to block or severely limit.
        // For now, let's enforce "pro" rate limit for pro users, and block free users
        // OR allow free users but very strictly. 
        // Let's assume it's a PRO feature to prevent abuse of expensive generation.
        if (!isPro) {
             // Optional: Allow 1 trial generation? 
             // For safety hardening, let's just block or use a very strict limit if we had one.
             // We'll throw Payment Required to drive conversion.
             throw ApiErrors.paymentRequired("Website generation is available on Pro plans.");
        }

        await enforceRateLimit(session.user.id, "pro");

        const payload = await validateBody(req, websiteRequestSchema);

        const systemPrompt = [
            "You are a principal frontend architect generating production-ready starter code.",
            "Return valid JSON only. No markdown fences.",
            "Output shape:",
            '{"projectName":"...","summary":"...","launchChecklist":["..."],"conversionHooks":["..."],"files":[{"name":"...","content":"..."}]}',
            "Requirements:",
            "- Modern, responsive, accessible UI",
            "- Clean semantic HTML",
            "- No placeholder TODO comments",
            "- Keep file count practical and runnable",
            payload.framework === "react-vite"
                ? "- Include package.json + index.html + src/main.tsx + src/App.tsx + src/styles.css"
                : "- Include index.html + style.css + script.js",
        ].join("\n");

        const userPrompt = [
            `Website brief: ${payload.prompt.replace(/[<>]/g, "")}`, // Basic sanitization
            `Style: ${payload.style}`,
            `Framework: ${payload.framework}`,
            `Include auth pages: ${payload.includeAuthPages ? "yes" : "no"}`,
            "If auth pages are requested, include login and signup views and shared styles.",
            "Avoid external APIs and secrets.",
            "Include a launchChecklist with concrete go-live items (analytics, seo, legal, performance, QA).",
            "Include conversionHooks with concise subscription-growth suggestions relevant to the generated site.",
        ].join("\n");

        const aiResult = await getAICompletionWithDetailedError(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            {
                temperature: 0.3,
                maxTokens: 8192,
                jsonMode: true,
            },
        );

        if (!aiResult.success || !aiResult.data) {
            throw ApiErrors.serviceUnavailable(aiResult.error || "Website generator");
        }

        let parsed;
        try {
            parsed = aiResponseSchema.parse(JSON.parse(stripCodeFences(aiResult.data.content)));
        } catch (parseError) {
             console.error("AI Website Gen Parse Error:", parseError);
             throw ApiErrors.internalError("Failed to parse generated project structure.");
        }

        const safeFiles = normalizeGeneratedFiles(parsed.files
            .map((file) => {
                const safeName = sanitizeFilePath(file.name);
                if (!safeName) return null;
                // Double check content size per file
                if (file.content.length > 200_000) return null; 
                return {
                    name: safeName,
                    content: file.content,
                };
            })
            .filter((file): file is { name: string; content: string } => Boolean(file)), payload.framework);

        if (safeFiles.length < 2) {
            throw ApiErrors.badRequest("Generated output did not contain valid project files");
        }

        // Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GENERATE_WEBSITE_TEMPLATE",
                entity: "IDE",
                entityId: session.user.id,
                details: {
                    framework: payload.framework,
                    style: payload.style,
                    includeAuthPages: payload.includeAuthPages,
                    fileCount: safeFiles.length,
                    checklistCount: parsed.launchChecklist.length,
                    conversionHookCount: parsed.conversionHooks.length,
                },
            });
        } catch {
            // Non-blocking for the generation path.
        }

        return NextResponse.json(
            {
                projectName: parsed.projectName,
                summary: parsed.summary,
                launchChecklist: parsed.launchChecklist,
                conversionHooks: parsed.conversionHooks,
                files: safeFiles,
            },
            { status: 200 },
        );
    } catch (error) {
        return errorResponse(error);
    }
}

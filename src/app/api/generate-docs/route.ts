import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { buildGlobalContext, ADVANCED_SYSTEM_PROMPT } from "@/lib/context-builder";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getFileContent } from "@/lib/files";
import { safeJsonParse } from "@/lib/utils";

// Documentation tone personalities
type DocTone = "technical" | "friendly" | "enterprise" | "minimal" | "educational";

const TONE_PROMPTS: Record<DocTone, string> = {
    technical: "Write in a precise, technical style suitable for experienced developers. Use proper terminology and be concise.",
    friendly: "Write in a warm, approachable style. Use casual language, add helpful tips, and make complex concepts easy to understand.",
    enterprise: "Write in a professional, formal style suitable for enterprise documentation. Be thorough and compliance-focused.",
    minimal: "Write in a minimal, to-the-point style. Focus only on essential information, no fluff.",
    educational: "Write in an educational style with explanations of concepts. Include examples and learning-focused content."
};

const BUILTIN_TEMPLATES: Record<string, string> = {
    "api-docs": "Create comprehensive API documentation. List all endpoints (implied by functions), parameters, and return types. Include request/response examples.",
    "cli-docs": "Create CLI documentation. Treat functions as commands. List flags (parameters) and usage examples.",
    "library-docs": "Create library documentation. Focus on public classes and functions. Explain how to install and usage patterns.",
    "sdk-docs": "Create SDK reference documentation. Focus on authentication, configuration, and client methods.",
    "internal-docs": "Create internal technical documentation. Focus on architecture decisions, implementation details, and maintainability notes.",
    "tutorial": "Create a step-by-step tutorial based on this code. Explain the logic flow as a learning guide."
};

interface DocOptions {
    tone: DocTone;
    format: "markdown" | "html" | "rst" | "adoc";
    includeExamples: boolean;
    includeTypeHints: boolean;
    includeSeeAlso: boolean;
    groupByType: boolean;
    generateSummary: boolean;
    maxDepth: number;
    template?: string;
}

const DEFAULT_OPTIONS: DocOptions = {
    tone: "technical",
    format: "markdown",
    includeExamples: true,
    includeTypeHints: true,
    includeSeeAlso: true,
    groupByType: true,
    generateSummary: true,
    maxDepth: 3,
};

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Rate limiting
        const limit = await rateLimit(session.user.id, "pro");
        if (limit && !limit.success) {
            return rateLimitResponse(limit.remaining, limit.reset);
        }

        const body = await request.json();
        const { fileId, options: userOptions } = body;

        if (!fileId) {
            return NextResponse.json({ error: "No file specified" }, { status: 400 });
        }

        const options: DocOptions = { ...DEFAULT_OPTIONS, ...userOptions };

        // Get the file with documentation
        const file = await db.file.findFirst({
            where: {
                id: fileId,
                userId: session.user.id,
            },
            include: {
                documentation: true,
            },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (!file.documentation?.content) {
            return NextResponse.json({ error: "No documentation found for this file" }, { status: 400 });
        }

        const doc = safeJsonParse(file.documentation.content, {} as any);

        // Generate enhanced documentation based on options
        const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234";

        let modelName = "qwen2.5-coder-7b-instruct";
        try {
            const modelsRes = await fetch(`${LM_STUDIO_URL}/v1/models`);
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                if (modelsData.data?.length > 0) {
                    modelName = modelsData.data[0].id;
                }
            }
        } catch { }

        // Handle Templates (Custom & Built-in)
        const templateId = userOptions.template;
        let pTemplate = "";

        if (templateId) {
            // 1. Check built-in
            if (BUILTIN_TEMPLATES[templateId]) {
                pTemplate = BUILTIN_TEMPLATES[templateId];
                // Check premium for specific built-ins if needed
                if (["sdk-docs", "internal-docs", "tutorial"].includes(templateId)) {
                    const gate = await requireFeature("customTemplates");
                    if (gate) return gate;
                }
            }
            // 2. Check Custom (UUID)
            else if (templateId.length > 20) {
                const gate = await requireFeature("customTemplates");
                if (gate) return gate;

                const docTemplate = await db.docTemplate.findUnique({
                    where: { id: templateId }
                });
                if (docTemplate && docTemplate.content) {
                    pTemplate = docTemplate.content;
                }
            }
        }

        // Use AI generation if template is present
        if (pTemplate) {
            const globalContext = await buildGlobalContext(session.user.id, fileId);
            const systemPrompt = `${ADVANCED_SYSTEM_PROMPT}

You are an expert technical writer.
Task: ${pTemplate}
Tone: ${TONE_PROMPTS[options.tone] || "Technical"}
Format: ${options.format}
Global Context Map:
${globalContext}

Output: Return ONLY the documentation content. Do not include wrapping JSON or extra conversation.`;

            const content = await getFileContent(fileId);
            if (!content) {
                return NextResponse.json({ error: "Could not fetch file content" }, { status: 500 });
            }

            const userPrompt = `Source Code (${file.language}):
\`\`\`${file.language}
${content}
\`\`\`

Code Analysis:
${JSON.stringify(doc.entities ? doc.entities.slice(0, 20) : "No entities", null, 2)}
`;

            try {
                const aiRes = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPrompt }
                        ],
                        temperature: 0.3,
                        max_tokens: 4096
                    }),
                });

                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const generatedDoc = aiData.choices?.[0]?.message?.content || "";
                    if (generatedDoc) {
                        return NextResponse.json({
                            documentation: generatedDoc,
                            format: options.format,
                            source: "local"
                        });
                    }
                }
            } catch (e) {
                console.error("Template generation failed", e);
            }
        }


        const tonePrompt = TONE_PROMPTS[options.tone];

        const entities = doc.entities || [];
        const functions = entities.filter((e: any) => e.type === "function");
        const classes = entities.filter((e: any) => e.type === "class");

        // Build the documentation structure
        let documentation = "";

        if (options.format === "markdown") {
            documentation = generateMarkdownDocs(file, doc, functions, classes, options);
        } else if (options.format === "html") {
            documentation = generateHtmlDocs(file, doc, functions, classes, options);
        } else if (options.format === "rst") {
            documentation = generateRstDocs(file, doc, functions, classes, options);
        } else {
            documentation = generateAsciidocDocs(file, doc, functions, classes, options);
        }

        // Enhance with AI if summary is requested
        if (options.generateSummary && entities.length > 0) {
            const summaryPrompt = `${tonePrompt}

Generate a brief module overview for this ${file.language} file with:
- ${functions.length} functions: ${functions.slice(0, 5).map((f: any) => f.name).join(", ")}
- ${classes.length} classes: ${classes.slice(0, 5).map((c: any) => c.name).join(", ")}

Original summary: ${doc.summary || "None provided"}

Write 2-3 sentences describing what this module does and its main purpose.`;

            try {
                const aiRes = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: "You are a technical writer creating documentation." },
                            { role: "user", content: summaryPrompt }
                        ],
                        temperature: 0.4,
                        max_tokens: 500
                    }),
                });

                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const enhancedSummary = aiData.choices?.[0]?.message?.content || "";

                    // Insert enhanced summary at the beginning
                    if (enhancedSummary && options.format === "markdown") {
                        documentation = documentation.replace(
                            /^(# .+\n+)/,
                            `$1> ${enhancedSummary.trim()}\n\n`
                        );
                    }
                }
            } catch { }
        }

        return NextResponse.json({
            documentation,
            format: options.format,
            stats: {
                functions: functions.length,
                classes: classes.length,
                lines: doc.lineCount || 0,
                quality: doc.qualityScore || 0
            }
        });

    } catch (error) {
        console.error("Generate docs error:", error);
        return NextResponse.json({ error: "Failed to generate documentation" }, { status: 500 });
    }
}

function generateMarkdownDocs(file: any, doc: any, functions: any[], classes: any[], options: DocOptions): string {
    let md = `# ${file.name}\n\n`;

    // Summary
    if (doc.summary) {
        md += `${doc.summary}\n\n`;
    }

    // Table of Contents
    if (functions.length + classes.length > 3) {
        md += `## Table of Contents\n\n`;
        if (classes.length > 0) md += `- [Classes](#classes)\n`;
        if (functions.length > 0) md += `- [Functions](#functions)\n`;
        md += `\n---\n\n`;
    }

    // Classes
    if (classes.length > 0 && options.groupByType) {
        md += `## Classes\n\n`;
        classes.forEach((cls: any) => {
            md += `### \`${cls.name}\`\n\n`;
            if (cls.doc) md += `${cls.doc}\n\n`;
            if (cls.methods?.length > 0) {
                md += `**Methods:**\n`;
                cls.methods.forEach((m: string) => {
                    md += `- \`${m}()\`\n`;
                });
                md += `\n`;
            }
        });
    }

    // Functions
    if (functions.length > 0) {
        if (options.groupByType) {
            md += `## Functions\n\n`;
        }

        functions.forEach((fn: any) => {
            md += `### \`${fn.name}()\`\n\n`;

            if (fn.doc) {
                md += `${fn.doc}\n\n`;
            }

            if (options.includeTypeHints && fn.params?.length > 0) {
                md += `**Parameters:**\n\n`;
                md += `| Name | Type | Description |\n|------|------|-------------|\n`;
                fn.params.forEach((p: any) => {
                    md += `| \`${p.name}\` | \`${p.type || 'any'}\` | ${p.doc || '-'} |\n`;
                });
                md += `\n`;
            }

            if (options.includeTypeHints && fn.returns) {
                md += `**Returns:** \`${fn.returns}\`\n\n`;
            }

            if (options.includeExamples && fn.example) {
                md += `**Example:**\n\n\`\`\`${file.language}\n${fn.example}\n\`\`\`\n\n`;
            }

            if (options.includeSeeAlso && fn.seeAlso?.length > 0) {
                md += `**See Also:** ${fn.seeAlso.map((s: string) => `\`${s}()\``).join(", ")}\n\n`;
            }

            md += `---\n\n`;
        });
    }

    // Security Insights
    if (doc.securityInsights?.length > 0) {
        md += `## ⚠️ Security Notes\n\n`;
        doc.securityInsights.forEach((insight: string) => {
            md += `- ${insight}\n`;
        });
        md += `\n`;
    }

    // Footer
    md += `\n---\n*Generated by DocuMint AI*\n`;

    return md;
}

function generateHtmlDocs(file: any, doc: any, functions: any[], classes: any[], options: DocOptions): string {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${file.name} - Documentation</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; }
        h1 { color: #1a1a2e; border-bottom: 3px solid #6366f1; padding-bottom: 10px; }
        h2 { color: #2d2d44; margin-top: 40px; }
        h3 { color: #4a4a6a; }
        code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        pre { background: #1e1e2e; color: #cdd6f4; padding: 20px; border-radius: 8px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; }
        .summary { color: #64748b; font-size: 1.1em; margin-bottom: 30px; }
        .section { margin-bottom: 40px; }
        .function-card { background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 16px 0; }
    </style>
</head>
<body>
    <h1>${file.name}</h1>
    <p class="summary">${doc.summary || ''}</p>
`;

    if (classes.length > 0) {
        html += `<div class="section"><h2>Classes</h2>`;
        classes.forEach((cls: any) => {
            html += `<div class="function-card"><h3><code>${cls.name}</code></h3>`;
            if (cls.doc) html += `<p>${cls.doc}</p>`;
            html += `</div>`;
        });
        html += `</div>`;
    }

    if (functions.length > 0) {
        html += `<div class="section"><h2>Functions</h2>`;
        functions.forEach((fn: any) => {
            html += `<div class="function-card"><h3><code>${fn.name}()</code></h3>`;
            if (fn.doc) html += `<p>${fn.doc}</p>`;
            html += `</div>`;
        });
        html += `</div>`;
    }

    html += `
    <footer style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.9em;">
        Generated by DocuMint AI
    </footer>
</body>
</html>`;

    return html;
}

function generateRstDocs(file: any, doc: any, functions: any[], classes: any[], options: DocOptions): string {
    let rst = `${"=".repeat(file.name.length)}\n${file.name}\n${"=".repeat(file.name.length)}\n\n`;

    if (doc.summary) {
        rst += `${doc.summary}\n\n`;
    }

    if (classes.length > 0) {
        rst += `Classes\n${"-".repeat(7)}\n\n`;
        classes.forEach((cls: any) => {
            rst += `.. class:: ${cls.name}\n\n`;
            if (cls.doc) rst += `   ${cls.doc}\n\n`;
        });
    }

    if (functions.length > 0) {
        rst += `Functions\n${"-".repeat(9)}\n\n`;
        functions.forEach((fn: any) => {
            rst += `.. function:: ${fn.name}()\n\n`;
            if (fn.doc) rst += `   ${fn.doc}\n\n`;
        });
    }

    return rst;
}

function generateAsciidocDocs(file: any, doc: any, functions: any[], classes: any[], options: DocOptions): string {
    let adoc = `= ${file.name}\n:toc:\n:source-highlighter: highlight.js\n\n`;

    if (doc.summary) {
        adoc += `${doc.summary}\n\n`;
    }

    if (classes.length > 0) {
        adoc += `== Classes\n\n`;
        classes.forEach((cls: any) => {
            adoc += `=== ${cls.name}\n\n`;
            if (cls.doc) adoc += `${cls.doc}\n\n`;
        });
    }

    if (functions.length > 0) {
        adoc += `== Functions\n\n`;
        functions.forEach((fn: any) => {
            adoc += `=== \`${fn.name}()\`\n\n`;
            if (fn.doc) adoc += `${fn.doc}\n\n`;
        });
    }

    return adoc;
}

// GET endpoint for available options
export async function GET() {
    return NextResponse.json({
        tones: [
            { id: "technical", name: "Technical", description: "Precise, developer-focused documentation" },
            { id: "friendly", name: "Friendly", description: "Approachable, easy-to-understand style" },
            { id: "enterprise", name: "Enterprise", description: "Formal, compliance-ready documentation", premium: true },
            { id: "minimal", name: "Minimal", description: "Just the essentials, no fluff" },
            { id: "educational", name: "Educational", description: "Learning-focused with explanations", premium: true }
        ],
        formats: [
            { id: "markdown", name: "Markdown", extension: ".md" },
            { id: "html", name: "HTML", extension: ".html" },
            { id: "rst", name: "reStructuredText", extension: ".rst", premium: true },
            { id: "adoc", name: "AsciiDoc", extension: ".adoc", premium: true }
        ],
        options: [
            { id: "includeExamples", name: "Include Examples", default: true },
            { id: "includeTypeHints", name: "Type Hints", default: true },
            { id: "includeSeeAlso", name: "See Also Links", default: true },
            { id: "groupByType", name: "Group by Type", default: true },
            { id: "generateSummary", name: "AI Summary", default: true, premium: true }
        ]
    });
}

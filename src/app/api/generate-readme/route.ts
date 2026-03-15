import { File } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "../../../lib/db";
import { generateText } from "../../../lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

// README Template Types
type ReadmeStyle = "minimal" | "standard" | "comprehensive" | "enterprise";
type BadgeStyle = "flat" | "flat-square" | "for-the-badge" | "plastic";

interface ReadmeOptions {
    style: ReadmeStyle;
    projectName?: string;
    description?: string;
    badges: {
        enabled: boolean;
        style: BadgeStyle;
        license?: boolean;
        version?: boolean;
        build?: boolean;
        coverage?: boolean;
        custom?: string[];
    };
    sections: {
        features: boolean;
        installation: boolean;
        usage: boolean;
        api: boolean;
        configuration: boolean;
        testing: boolean;
        deployment: boolean;
        contributing: boolean;
        changelog: boolean;
        roadmap: boolean;
        faq: boolean;
        license: boolean;
        credits: boolean;
    };
    branding?: {
        logo?: string;
        banner?: string;
        color?: string;
    };
    social?: {
        github?: string;
        twitter?: string;
        discord?: string;
        website?: string;
    };
    license?: string;
    author?: string;
    includeTableOfContents: boolean;
    includeBackToTop: boolean;
    codeExamples: boolean;
    aiEnhanced: boolean;
}

const readmeOptionsSchema = z
    .object({
        style: z.enum(["minimal", "standard", "comprehensive", "enterprise"]).optional(),
        projectName: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().min(1).max(2000).optional(),
        badges: z
            .object({
                enabled: z.boolean().optional(),
                style: z.enum(["flat", "flat-square", "for-the-badge", "plastic"]).optional(),
                license: z.boolean().optional(),
                version: z.boolean().optional(),
                build: z.boolean().optional(),
                coverage: z.boolean().optional(),
                custom: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
            })
            .optional(),
        sections: z
            .object({
                features: z.boolean().optional(),
                installation: z.boolean().optional(),
                usage: z.boolean().optional(),
                api: z.boolean().optional(),
                configuration: z.boolean().optional(),
                testing: z.boolean().optional(),
                deployment: z.boolean().optional(),
                contributing: z.boolean().optional(),
                changelog: z.boolean().optional(),
                roadmap: z.boolean().optional(),
                faq: z.boolean().optional(),
                license: z.boolean().optional(),
                credits: z.boolean().optional(),
            })
            .optional(),
        branding: z
            .object({
                logo: z.string().trim().url().max(500).optional(),
                banner: z.string().trim().url().max(500).optional(),
                color: z.string().trim().max(50).optional(),
            })
            .optional(),
        social: z
            .object({
                github: z.string().trim().url().max(500).optional(),
                twitter: z.string().trim().url().max(500).optional(),
                discord: z.string().trim().url().max(500).optional(),
                website: z.string().trim().url().max(500).optional(),
            })
            .optional(),
        license: z.string().trim().max(100).optional(),
        author: z.string().trim().max(150).optional(),
        includeTableOfContents: z.boolean().optional(),
        includeBackToTop: z.boolean().optional(),
        codeExamples: z.boolean().optional(),
        aiEnhanced: z.boolean().optional(),
    })
    .strict();

const readmeBodySchema = z
    .object({
        fileIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200),
        options: readmeOptionsSchema.optional(),
    })
    .strict();

const DEFAULT_OPTIONS: ReadmeOptions = {
    style: "standard",
    badges: {
        enabled: true,
        style: "flat",
        license: true,
        version: true,
        build: true,
    },
    sections: {
        features: true,
        installation: true,
        usage: true,
        api: true,
        configuration: false,
        testing: false,
        deployment: false,
        contributing: true,
        changelog: false,
        roadmap: false,
        faq: false,
        license: true,
        credits: true,
    },
    includeTableOfContents: true,
    includeBackToTop: true,
    codeExamples: true,
    aiEnhanced: true,
};

function generateBadges(options: ReadmeOptions, projectInfo: { languages: string[] }): string {
    if (!options.badges.enabled) return "";

    const style = options.badges.style;
    const badges: string[] = [];

    if (options.badges.license) {
        badges.push(`![License](https://img.shields.io/badge/license-${options.license || 'MIT'}-blue?style=${style})`);
    }
    if (options.badges.version) {
        badges.push(`![Version](https://img.shields.io/badge/version-1.0.0-green?style=${style})`);
    }
    if (options.badges.build) {
        badges.push(`![Build](https://img.shields.io/badge/build-passing-brightgreen?style=${style})`);
    }
    if (options.badges.coverage) {
        badges.push(`![Coverage](https://img.shields.io/badge/coverage-85%25-yellow?style=${style})`);
    }

    // Add language badges
    projectInfo.languages.forEach((lang: string) => {
        const colors: Record<string, string> = {
            python: "3776AB", javascript: "F7DF1E", typescript: "3178C6",
            go: "00ADD8", rust: "000000", java: "ED8B00", csharp: "239120"
        };
        const color = colors[lang.toLowerCase()] || "gray";
        badges.push(`![${lang}](https://img.shields.io/badge/${lang}-${color}?style=${style}&logo=${lang.toLowerCase()}&logoColor=white)`);
    });

    if (options.badges.custom) {
        badges.push(...options.badges.custom);
    }

    return badges.join(" ") + "\n\n";
}

function generateDefaultFeatures(projectInfo: { languages: string[], functions: { name: string, doc: string }[], classes: { name: string, doc: string }[] }): string {
    let features = "";
    const lang = projectInfo.languages[0] || "code";
    const funcCount = projectInfo.functions.length;
    const classCount = projectInfo.classes.length;

    features += `- 🚀 High-performance ${lang} implementation\n`;
    if (funcCount > 0) {
        features += `- 📦 ${funcCount} reusable ${funcCount === 1 ? "function" : "functions"}\n`;
    }
    if (classCount > 0) {
        features += `- 🏗️ ${classCount} modular ${classCount === 1 ? "class" : "classes"}\n`;
    }
    features += `- 📊 Comprehensive documentation\n`;
    features += `- 🔧 Easy to extend and customize\n`;
    features += `- ✅ Production-ready code\n\n`;

    return features;
}

function generateTableOfContents(options: ReadmeOptions): string {
    if (!options.includeTableOfContents) return "";

    const sections: string[] = ["Overview"];

    if (options.sections.features) sections.push("Features");
    if (options.sections.installation) sections.push("Installation");
    if (options.sections.usage) sections.push("Usage");
    if (options.sections.api) sections.push("API Reference");
    if (options.sections.configuration) sections.push("Configuration");
    if (options.sections.testing) sections.push("Testing");
    if (options.sections.deployment) sections.push("Deployment");
    if (options.sections.contributing) sections.push("Contributing");
    if (options.sections.changelog) sections.push("Changelog");
    if (options.sections.roadmap) sections.push("Roadmap");
    if (options.sections.faq) sections.push("FAQ");
    if (options.sections.license) sections.push("License");
    if (options.sections.credits) sections.push("Credits");

    return `## 📑 Table of Contents

${sections.map(s => `- [${s}](#${s.toLowerCase().replace(/ /g, "-")})`).join("\n")}

---

`;
}

function generateBackToTop(): string {
    return `\n<p align="right">(<a href="#top">back to top</a>)</p>\n`;
}

async function generateWithAI(prompt: string, systemPrompt: string): Promise<string | null> {
    try {
        const text = await generateText(systemPrompt, prompt, {
            temperature: 0.4,
            maxTokens: 4096
        });
        return text || null;
    } catch {
        // Non-blocking AI fallback
    }
    return null;
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "pro");

        const { fileIds, options: userOptions } = await validateBody(request, readmeBodySchema);

        // Merge user options with defaults
        const options: ReadmeOptions = {
            ...DEFAULT_OPTIONS,
            ...userOptions,
            badges: { ...DEFAULT_OPTIONS.badges, ...userOptions?.badges },
            sections: { ...DEFAULT_OPTIONS.sections, ...userOptions?.sections },
        };

        // Get all files
        const files = await db.file.findMany({
            where: {
                id: { in: fileIds },
                userId: session.user.id,
            },
            include: {
                documentation: true,
            },
        });

        if (files.length === 0) {
            throw ApiErrors.notFound("File");
        }

        // Collect comprehensive project info
        interface ProjectInfo {
    fileCount: number;
    languages: string[];
    totalLines: number;
    functions: { name: string; doc: string }[];
    classes: { name: string; doc: string }[];
    dependencies: string[];
    avgQuality: number;
    securityIssues: string[];
}

// ... inside the function
        const projectInfo: ProjectInfo = {
            fileCount: files.length,
            languages: [...new Set(files.map((f: File) => f.language))] as string[],
            totalLines: files.reduce((a: number, f: File) => a + (f.content?.split("\n").length || 0), 0),
            functions: [] as { name: string; doc: string }[],
            classes: [] as { name: string; doc: string }[],
            dependencies: [] as string[],
            avgQuality: 0,
            securityIssues: [] as string[],
        };

        // Parse documentation for insights
        let qualitySum = 0;
        let qualityCount = 0;

        files.forEach((file: File & { documentation: { content: string } | null }) => {
            if (file.documentation?.content) {
                try {
                    const doc = JSON.parse(file.documentation.content);
                    if (doc.entities) {
                        doc.entities.forEach((e: { type: string; name: string; doc?: string }) => {
                            if (e.type === "function") {
                                projectInfo.functions.push({ name: e.name, doc: e.doc || "" });
                            }
                            if (e.type === "class") {
                                projectInfo.classes.push({ name: e.name, doc: e.doc || "" });
                            }
                        });
                    }
                    if (doc.qualityScore) {
                        qualitySum += doc.qualityScore;
                        qualityCount++;
                    }
                    if (doc.securityInsights) {
                        projectInfo.securityIssues.push(...doc.securityInsights);
                    }
                } catch { }
            }
        });

        projectInfo.avgQuality = qualityCount > 0 ? Math.round(qualitySum / qualityCount) : 0;

        // Generate README sections
        const projectName = options.projectName || "My Project";
        const fileWord = projectInfo.fileCount === 1 ? "file" : "files";
        const funcWord = projectInfo.functions.length === 1 ? "function" : "functions";
        const classWord = projectInfo.classes.length === 1 ? "class" : "classes";
        const description = options.description || `A powerful ${projectInfo.languages.join("/")} project featuring ${projectInfo.functions.length} ${funcWord} and ${projectInfo.classes.length} ${classWord} across ${projectInfo.fileCount} ${fileWord}.`;

        let readme = `<a name="top"></a>\n\n`;

        // Header with optional branding
        if (options.branding?.banner) {
            readme += `<p align="center"><img src="${options.branding.banner}" alt="${projectName}" width="100%"/></p>\n\n`;
        } else if (options.branding?.logo) {
            readme += `<p align="center"><img src="${options.branding.logo}" alt="${projectName}" width="200"/></p>\n\n`;
        }

        readme += `# ${options.style === "enterprise" ? "🏢 " : ""}${projectName}\n\n`;

        // Badges
        readme += generateBadges(options, projectInfo);

        // Description
        readme += `> ${description}\n\n`;

        // Social links
        if (options.social) {
            const links: string[] = [];
            if (options.social.github) links.push(`[GitHub](${options.social.github})`);
            if (options.social.twitter) links.push(`[Twitter](${options.social.twitter})`);
            if (options.social.discord) links.push(`[Discord](${options.social.discord})`);
            if (options.social.website) links.push(`[Website](${options.social.website})`);
            if (links.length > 0) {
                readme += `${links.join(" • ")}\n\n`;
            }
        }

        // Table of Contents
        readme += generateTableOfContents(options);

        // Overview Section
        readme += `## 📖 Overview\n\n`;

        if (options.style === "comprehensive" || options.style === "enterprise") {
            readme += `### Project Statistics\n\n`;
            readme += `| Metric | Value |\n|--------|-------|\n`;
            readme += `| Files | ${projectInfo.fileCount} |\n`;
            readme += `| Lines of Code | ${projectInfo.totalLines.toLocaleString()} |\n`;
            readme += `| Functions | ${projectInfo.functions.length} |\n`;
            readme += `| Classes | ${projectInfo.classes.length} |\n`;
            if (projectInfo.avgQuality > 0) {
                readme += `| Code Quality | ${projectInfo.avgQuality}% |\n`;
            }
            readme += `\n`;
        }

        readme += `### Languages\n\n`;
        projectInfo.languages.forEach(lang => {
            readme += `- ${lang}\n`;
        });
        readme += `\n`;

        if (options.includeBackToTop) readme += generateBackToTop();

        // Features Section (AI Enhanced)
        if (options.sections.features) {
            readme += `## ✨ Features\n\n`;

            if (options.aiEnhanced && projectInfo.functions.length > 0) {
                const featuresPrompt = `You are writing the Features section of a professional README.md file.

Project: ${projectName}
Languages: ${projectInfo.languages.join(", ")}
Key Functions: ${projectInfo.functions.slice(0, 10).map(f => f.name).join(", ") || "various utilities"}
Key Classes: ${projectInfo.classes.slice(0, 5).map(c => c.name).join(", ") || "none"}
Total: ${projectInfo.functions.length} functions, ${projectInfo.classes.length} classes

Write exactly 5-7 compelling feature bullet points. Each should:
- Start with an emoji
- Be concise (under 10 words)
- Highlight a real benefit
- Sound professional

Format: One bullet per line starting with "- ". No intro text, no explanation, just the bullets.`;

                const aiFeatures = await generateWithAI(
                    featuresPrompt,
                    "You are a technical writer. Output ONLY markdown bullet points, nothing else. Be concise and professional."
                );

                if (aiFeatures && aiFeatures.includes("-")) {
                    readme += aiFeatures.trim() + "\n\n";
                } else {
                    // Fallback to generated features
                    readme += generateDefaultFeatures(projectInfo);
                }
            } else {
                readme += generateDefaultFeatures(projectInfo);
            }

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // Installation Section
        if (options.sections.installation) {
            readme += `## 🛠️ Installation\n\n`;

            const primaryLang = projectInfo.languages[0]?.toLowerCase();

            readme += `### Prerequisites\n\n`;
            if (primaryLang === "python") {
                readme += `- Python 3.8+\n- pip\n\n`;
            } else if (primaryLang === "javascript" || primaryLang === "typescript") {
                readme += `- Node.js 18+\n- npm or yarn\n\n`;
            } else if (primaryLang === "go") {
                readme += `- Go 1.21+\n\n`;
            } else if (primaryLang === "rust") {
                readme += `- Rust 1.70+\n- Cargo\n\n`;
            }

            readme += `### Quick Start\n\n`;
            readme += "```bash\n";
            readme += `# Clone the repository\n`;
            readme += `git clone https://github.com/username/${projectName.toLowerCase().replace(/\s+/g, "-")}.git\n`;
            readme += `cd ${projectName.toLowerCase().replace(/\s+/g, "-")}\n\n`;

            if (primaryLang === "python") {
                readme += `# Create virtual environment\npython -m venv venv\nsource venv/bin/activate  # On Windows: venv\\Scripts\\activate\n\n`;
                readme += `# Install dependencies\npip install -r requirements.txt\n`;
            } else if (primaryLang === "javascript" || primaryLang === "typescript") {
                readme += `# Install dependencies\nnpm install\n`;
            } else if (primaryLang === "go") {
                readme += `# Download dependencies\ngo mod download\n`;
            } else if (primaryLang === "rust") {
                readme += `# Build the project\ncargo build --release\n`;
            }

            readme += "```\n\n";

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // Usage Section
        if (options.sections.usage && options.codeExamples) {
            readme += `## 📚 Usage\n\n`;

            const primaryLang = projectInfo.languages[0]?.toLowerCase();
            const topFunctions = projectInfo.functions.slice(0, 3);

            if (options.aiEnhanced && topFunctions.length > 0) {
                const usagePrompt = `Generate usage examples for this ${primaryLang} project with functions: ${topFunctions.map(f => f.name).join(", ")}.
Include:
1. Basic import/require statement
2. 1-2 simple usage examples with code blocks

Use proper ${primaryLang} syntax. Be concise.`;

                const aiUsage = await generateWithAI(usagePrompt, "You write clear, concise code examples for documentation.");

                if (aiUsage) {
                    readme += aiUsage + "\n\n";
                } else {
                    readme += `\`\`\`${primaryLang || "bash"}\n# Example usage\n# See documentation for detailed examples\n\`\`\`\n\n`;
                }
            } else {
                readme += `\`\`\`${primaryLang || "bash"}\n# Example usage\n# Import and use the main functionality\n\`\`\`\n\n`;
            }

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // API Reference Section
        if (options.sections.api && projectInfo.functions.length > 0) {
            readme += `## 📖 API Reference\n\n`;

            if (options.style === "comprehensive" || options.style === "enterprise") {
                readme += `### Functions\n\n`;
                readme += `| Function | Description |\n|----------|-------------|\n`;
                projectInfo.functions.slice(0, 15).forEach(f => {
                    const desc = f.doc ? f.doc.slice(0, 60) + (f.doc.length > 60 ? "..." : "") : "See documentation";
                    readme += `| \`${f.name}\` | ${desc} |\n`;
                });
                readme += `\n`;

                if (projectInfo.classes.length > 0) {
                    readme += `### Classes\n\n`;
                    readme += `| Class | Description |\n|-------|-------------|\n`;
                    projectInfo.classes.slice(0, 10).forEach(c => {
                        const desc = c.doc ? c.doc.slice(0, 60) + (c.doc.length > 60 ? "..." : "") : "See documentation";
                        readme += `| \`${c.name}\` | ${desc} |\n`;
                    });
                    readme += `\n`;
                }
            } else {
                readme += `### Key Functions\n\n`;
                projectInfo.functions.slice(0, 10).forEach(f => {
                    readme += `- \`${f.name}()\`\n`;
                });
                readme += `\n`;
            }

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // Configuration Section
        if (options.sections.configuration) {
            readme += `## ⚙️ Configuration\n\n`;
            readme += `Create a \`.env\` file in the root directory:\n\n`;
            readme += "```env\n";
            readme += "# Application settings\n";
            readme += "APP_ENV=development\n";
            readme += "DEBUG=true\n";
            readme += "LOG_LEVEL=info\n";
            readme += "```\n\n";

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // Testing Section
        if (options.sections.testing) {
            readme += `## 🧪 Testing\n\n`;

            const primaryLang = projectInfo.languages[0]?.toLowerCase();

            readme += "```bash\n";
            if (primaryLang === "python") {
                readme += "# Run tests\npytest\n\n# With coverage\npytest --cov\n";
            } else if (primaryLang === "javascript" || primaryLang === "typescript") {
                readme += "# Run tests\nnpm test\n\n# With coverage\nnpm run test:coverage\n";
            } else if (primaryLang === "go") {
                readme += "# Run tests\ngo test ./...\n\n# With coverage\ngo test -cover ./...\n";
            } else if (primaryLang === "rust") {
                readme += "# Run tests\ncargo test\n";
            }
            readme += "```\n\n";

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // Deployment Section
        if (options.sections.deployment) {
            readme += `## 🚀 Deployment\n\n`;
            readme += `### Docker\n\n`;
            readme += "```bash\n";
            readme += "# Build image\ndocker build -t myproject .\n\n";
            readme += "# Run container\ndocker run -p 8080:8080 myproject\n";
            readme += "```\n\n";

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // Contributing Section
        if (options.sections.contributing) {
            readme += `## 🤝 Contributing\n\n`;
            readme += `Contributions are welcome! Please follow these steps:\n\n`;
            readme += `1. Fork the repository\n`;
            readme += `2. Create a feature branch (\`git checkout -b feature/amazing-feature\`)\n`;
            readme += `3. Commit your changes (\`git commit -m 'Add amazing feature'\`)\n`;
            readme += `4. Push to the branch (\`git push origin feature/amazing-feature\`)\n`;
            readme += `5. Open a Pull Request\n\n`;

            if (options.style === "enterprise") {
                readme += `### Code of Conduct\n\n`;
                readme += `Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.\n\n`;
            }

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // Roadmap Section
        if (options.sections.roadmap) {
            readme += `## 🗺️ Roadmap\n\n`;
            readme += `- [x] Initial release\n`;
            readme += `- [x] Core functionality\n`;
            readme += `- [ ] Additional features\n`;
            readme += `- [ ] Performance optimizations\n`;
            readme += `- [ ] Extended documentation\n\n`;

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // FAQ Section
        if (options.sections.faq) {
            readme += `## ❓ FAQ\n\n`;
            readme += `<details>\n<summary>How do I get started?</summary>\n\n`;
            readme += `Follow the [Installation](#installation) guide above.\n</details>\n\n`;
            readme += `<details>\n<summary>Where can I get help?</summary>\n\n`;
            readme += `Open an issue on GitHub or join our community.\n</details>\n\n`;

            if (options.includeBackToTop) readme += generateBackToTop();
        }

        // License Section
        if (options.sections.license) {
            const license = options.license || "MIT";
            readme += `## 📄 License\n\n`;
            readme += `This project is licensed under the ${license} License - see the [LICENSE](LICENSE) file for details.\n\n`;
        }

        // Credits Section
        if (options.sections.credits) {
            readme += `## 🙏 Credits\n\n`;
            if (options.author) {
                readme += `Created by **${options.author}**\n\n`;
            }
            readme += `Documentation generated with [DocuMint AI](https://documint.ai)\n\n`;
        }

        // Footer
        readme += `---\n\n`;
        readme += `<p align="center">Made with ❤️</p>\n`;

        return NextResponse.json({
            readme,
            generated: true,
            stats: {
                files: projectInfo.fileCount,
                lines: projectInfo.totalLines,
                functions: projectInfo.functions.length,
                classes: projectInfo.classes.length,
                quality: projectInfo.avgQuality
            }
        });
    } catch (error) {
        return errorResponse(error);
    }
}

// GET endpoint for available options/templates
export async function GET() {
    return NextResponse.json({
        templates: [
            {
                id: "minimal",
                name: "Minimal",
                description: "Clean and simple README with essential sections only",
                premium: false
            },
            {
                id: "standard",
                name: "Standard",
                description: "Well-structured README with common sections",
                premium: false
            },
            {
                id: "comprehensive",
                name: "Comprehensive",
                description: "Detailed README with API docs, tables, and stats",
                premium: true
            },
            {
                id: "enterprise",
                name: "Enterprise",
                description: "Full documentation suite with branding and compliance",
                premium: true
            }
        ],
        badgeStyles: ["flat", "flat-square", "for-the-badge", "plastic"],
        sections: [
            { id: "features", name: "Features", default: true },
            { id: "installation", name: "Installation", default: true },
            { id: "usage", name: "Usage", default: true },
            { id: "api", name: "API Reference", default: true },
            { id: "configuration", name: "Configuration", default: false },
            { id: "testing", name: "Testing", default: false },
            { id: "deployment", name: "Deployment", default: false },
            { id: "contributing", name: "Contributing", default: true },
            { id: "changelog", name: "Changelog", default: false },
            { id: "roadmap", name: "Roadmap", default: false },
            { id: "faq", name: "FAQ", default: false },
            { id: "license", name: "License", default: true },
            { id: "credits", name: "Credits", default: true }
        ],
        licenses: ["MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause", "ISC", "Proprietary"]
    });
}

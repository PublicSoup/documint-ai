import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasFeatureAccess } from "@/lib/subscription";

type FeatureType = "analytics" | "changelog" | "smartSuggestions" | "auditLog" | "customTemplates" | "prioritySupport" | "diagramGenerator" | "rulesetGenerator" | "aiArchitect" | "codeExplain";

/**
 * Middleware helper to check feature access
 * Returns null if authorized, or error response if not
 */
export async function requireFeature(feature: FeatureType): Promise<NextResponse | null> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasAccess = await hasFeatureAccess(session.user.id, feature);

    if (!hasAccess) {
        const upgradeMessages: Record<FeatureType, string> = {
            analytics: "Upgrade to Starter or Pro to access Documentation Analytics",
            changelog: "Upgrade to Starter or Pro to generate AI Changelogs",
            smartSuggestions: "Upgrade to Starter or Pro to get Smart Documentation Suggestions",
            auditLog: "Upgrade to Pro or Team to access Audit Logs",
            customTemplates: "Upgrade to Pro or Team to create Custom Templates",
            prioritySupport: "Upgrade to Pro or Team for Priority Support",
            diagramGenerator: "Upgrade to Pro or Team to generate Architecture Diagrams",
            rulesetGenerator: "Upgrade to Starter or Pro to generate AI IDE Rulesets",
            aiArchitect: "Upgrade to Starter or Pro to access the AI Architect",
            codeExplain: "Upgrade to Starter or Pro to use Persona-based Explanations",
        };

        const proFeatures: FeatureType[] = ["auditLog", "customTemplates", "prioritySupport", "diagramGenerator"];

        return NextResponse.json({
            error: "Feature not available on your plan",
            message: upgradeMessages[feature],
            upgradeUrl: "/dashboard/billing",
            requiredPlan: proFeatures.includes(feature) ? "pro" : "starter",
        }, { status: 403 });
    }

    return null; // Authorized
}

/**
 * Get upgrade prompt for a feature
 */
export function getUpgradePrompt(feature: FeatureType) {
    const prompts: Record<FeatureType, { title: string; benefits: string[] }> = {
        analytics: {
            title: "Unlock Documentation Analytics",
            benefits: [
                "Track document views and engagement",
                "Identify stale documentation",
                "Monitor documentation coverage",
                "Export analytics reports",
            ],
        },
        changelog: {
            title: "Unlock AI Changelog Generator",
            benefits: [
                "Auto-generate changelogs from code",
                "Multiple format options",
                "AI-powered change summarization",
                "Export as CHANGELOG.md",
            ],
        },
        smartSuggestions: {
            title: "Unlock Smart Suggestions",
            benefits: [
                "AI-powered improvement tips",
                "Missing documentation detection",
                "Quality score tracking",
                "Actionable recommendations",
            ],
        },
        auditLog: {
            title: "Unlock Audit Logs",
            benefits: [
                "Track all documentation changes",
                "Export for compliance",
                "Filter by action/date/user",
                "SOC2/HIPAA ready",
            ],
        },
        customTemplates: {
            title: "Unlock Custom Templates",
            benefits: [
                "Create reusable doc templates",
                "Enforce team standards",
                "Share across projects",
                "Version control templates",
            ],
        },
        prioritySupport: {
            title: "Unlock Priority Support",
            benefits: [
                "24-hour response time",
                "Dedicated support channel",
                "Custom onboarding",
                "Feature request priority",
            ],
        },
        diagramGenerator: {
            title: "Unlock System Architecture Diagrams",
            benefits: [
                "Auto-generate class/sequence diagrams",
                "Visualize code dependencies",
                "Export as SVG/PNG",
                "Mermaid.js integration",
            ],
        },
        rulesetGenerator: {
            title: "Unlock AI Ruleset Generator",
            benefits: [
                "Generate custom rules for Cursor/Cline/Gemini",
                "Analyze tech stack automatically",
                "Enforce team coding standards",
                "Boost developer productivity",
            ],
        },
        aiArchitect: {
            title: "Unlock AI Architect",
            benefits: [
                "Senior Engineer paired with you",
                "Architectural refactoring advice",
                "Project-aware codebase analysis",
                "Automated code pattern suggestions",
            ],
        },
        codeExplain: {
            title: "Unlock Persona Explanations",
            benefits: [
                "Explain code to non-technical stakeholders",
                "Educational breakdowns for juniors",
                "Concise summaries for seniors",
                "Tailored documentation perspective",
            ],
        },
    };

    return prompts[feature];
}

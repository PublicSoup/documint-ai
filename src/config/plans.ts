
export type PlanType = "free" | "starter" | "pro" | "team";

export interface PlanLimits {
    filesPerMonth: number;
    totalFiles: number;
    teamMembers: number;
    aiQueries: number; // Monthly AI query allowance (-1 = unlimited)
    aiTokenAllowance: number; // Monthly token allowance (-1 = unlimited)
    features: {
        analytics: boolean;
        changelog: boolean;
        smartSuggestions: boolean;
        auditLog: boolean;
        customTemplates: boolean;
        prioritySupport: boolean;
        diagramGenerator: boolean;
        rulesetGenerator: boolean;
        aiArchitect: boolean;
        codeExplain: boolean;
        autoCodeReview: boolean;
    };
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
    free: {
        filesPerMonth: 10,
        totalFiles: 25,
        teamMembers: 1,
        aiQueries: 0, // Must use own API key
        aiTokenAllowance: 0,
        features: {
            analytics: false,
            changelog: false,
            smartSuggestions: false,
            auditLog: false,
            customTemplates: false,
            prioritySupport: false,
            diagramGenerator: false,
            rulesetGenerator: false,
            aiArchitect: false,
            codeExplain: false,
            autoCodeReview: false,
        },
    },
    starter: {
        filesPerMonth: 100,
        totalFiles: 250,
        teamMembers: 3,
        aiQueries: 500, // Included AI queries per month
        aiTokenAllowance: 100000, // ~100K tokens
        features: {
            analytics: true,
            changelog: true,
            smartSuggestions: true,
            auditLog: false,
            customTemplates: false,
            prioritySupport: false,
            diagramGenerator: false,
            rulesetGenerator: true,
            aiArchitect: true,
            codeExplain: true,
            autoCodeReview: false,
        },
    },
    pro: {
        filesPerMonth: 1000,
        totalFiles: -1, // Unlimited
        teamMembers: 10,
        aiQueries: 5000, // Included AI queries per month
        aiTokenAllowance: 1000000, // ~1M tokens
        features: {
            analytics: true,
            changelog: true,
            smartSuggestions: true,
            auditLog: true,
            customTemplates: true,
            prioritySupport: true,
            diagramGenerator: true,
            rulesetGenerator: true,
            aiArchitect: true,
            codeExplain: true,
            autoCodeReview: true,
        },
    },
    team: {
        filesPerMonth: -1, // Unlimited
        totalFiles: -1, // Unlimited
        teamMembers: -1, // Unlimited
        aiQueries: 50000, // Included AI queries per month
        aiTokenAllowance: -1, // Unlimited tokens
        features: {
            analytics: true,
            changelog: true,
            smartSuggestions: true,
            auditLog: true,
            customTemplates: true,
            prioritySupport: true,
            diagramGenerator: true,
            rulesetGenerator: true,
            aiArchitect: true,
            codeExplain: true,
            autoCodeReview: true,
        },
    },
};

export const DEFAULT_PLAN = PLAN_LIMITS.free;

export const PLANS = [
    {
        id: "starter",
        name: "Starter",
        price: "$19",
        priceAmount: 19,
        interval: "month",
        limit: "100 files/mo",
        description: "Perfect for individuals and small projects.",
        features: ["All languages", "Standard Documentation", "Basic Quality Scoring"],
    },
    {
        id: "pro",
        name: "Pro",
        price: "$29",
        priceAmount: 29,
        interval: "month",
        limit: "1,000 files/mo",
        description: "For professional developers who need more power.",
        features: ["14-Day Free Trial", "Enterprise Diagnostic Engine", "Security & Secret Audit", "Architecture Alerts", "Refactoring Suggestions"],
        popular: true,
    },
    {
        id: "team",
        name: "Team",
        price: "$99",
        priceAmount: 99,
        interval: "month",
        limit: "10,000 files/mo",
        description: "Collaborate with your entire team.",
        features: ["Onboarding Time Metrics", "Performance Profiling", "Team Collab", "Custom API Access"],
    },
];

export const PLANS_CONFIG = {
    free: {
        id: "free",
        name: "Free",
        limit: PLAN_LIMITS.free.filesPerMonth
    },
    starter: {
        id: "starter",
        name: "Starter",
        limit: PLAN_LIMITS.starter.filesPerMonth
    },
    pro: {
        id: "pro",
        name: "Pro",
        limit: PLAN_LIMITS.pro.filesPerMonth
    },
    team: {
        id: "team",
        name: "Team",
        limit: PLAN_LIMITS.team.filesPerMonth === -1 ? 10000 : PLAN_LIMITS.team.filesPerMonth
    }
};

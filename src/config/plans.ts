
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
        limit: 10
    },
    starter: {
        id: "starter",
        name: "Starter",
        limit: 100
    },
    pro: {
        id: "pro",
        name: "Pro",
        limit: 1000
    },
    team: {
        id: "team",
        name: "Team",
        limit: 10000
    }
};

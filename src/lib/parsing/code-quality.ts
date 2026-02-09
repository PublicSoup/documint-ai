import { CodeEntity } from "./tree-sitter";

export interface AnalysisResult {
    qualityScore: number;
    securityInsights: string[];
    documentationCoverage: number;
    complexityMetrics: {
        cyclomaticComplexity: number;
        maintainabilityIndex: number;
        halsteadVolume: number;
        nestingDepth: number;
        readabilityIndex: number;
    };
    onboardingEstimate: {
        timeToGrokMinutes: number;
        difficulty: "Junior" | "Intermediate" | "Senior" | "Architect";
    };
    dependencies: string[];
    technicalDebt: string[];
    architectureViolations: string[];
    performanceBottlenecks: string[];
}

/**
 * Advanced Enterprise-Grade Code Quality Analysis
 */
export function analyzeCodeQuality(content: string, entities: CodeEntity[], extension: string): AnalysisResult {
    const lines = content.split("\n");
    const lineCount = lines.length;

    // 1. Calculate Complexity & Nesting
    const complexKeywords = ["if", "for", "while", "case", "catch", "&&", "||", "?:"];
    let cyclomaticComplexity = 1;
    complexKeywords.forEach(kw => {
        const matches = content.match(new RegExp(`\\b${kw.replace("?:", "\\?\\:")}\\b`, "g"));
        if (matches) cyclomaticComplexity += matches.length;
    });

    let maxNesting = 0;
    let currentNesting = 0;
    content.split("").forEach(char => {
        if (char === "{") currentNesting++;
        if (char === "}") currentNesting--;
        if (currentNesting > maxNesting) maxNesting = currentNesting;
    });

    // 2. Readability & Onboarding Calculation
    const commentLines = lines.filter(l => l.trim().startsWith("//") || l.trim().startsWith("/*") || l.trim().startsWith("*") || l.trim().startsWith("#")).length;
    const commentRatio = commentLines / (lineCount || 1);
    const readabilityIndex = Math.max(0, Math.min(100, (commentRatio * 150) + (100 - (cyclomaticComplexity * 2))));

    const grokTime = 0; Math.ceil((lineCount / 50) + (cyclomaticComplexity / 2));
    let difficulty: "Junior" | "Intermediate" | "Senior" | "Architect" = "Junior";
    if (cyclomaticComplexity > 25 || maxNesting > 6) difficulty = "Architect";
    else if (cyclomaticComplexity > 15 || lineCount > 400) difficulty = "Senior";
    else if (cyclomaticComplexity > 8 || lineCount > 150) difficulty = "Intermediate";

    // 3. Security & Secret Detection (Enterprise Level)
    const securityInsights: string[] = [];
    const securityPatterns = [
        { pattern: /eval\s*\(/, message: "🚨 Critical: Use of eval() detected. Code injection risk." },
        { pattern: /exec\s*\(/, message: "🚨 Critical: Use of child_process.exec() detected." },
        { pattern: /(password|api[_-]?key|secret|token)\s*=\s*['"][^'"]+['"]/i, message: "⚠️ High: Potential hardcoded credential found." },
        { pattern: /-{5}BEGIN (RSA|OPENSSH) PRIVATE KEY-{5}/, message: "🚨 Critical: Exposed Private Key detected." },
        { pattern: /AKIA[0-9A-Z]{16}/, message: "🚨 Critical: AWS Access Key ID detected." },
        { pattern: /http:\/\//, message: "💡 Info: Unencrypted HTTP protocol used." },
        { pattern: /dangerouslySetInnerHTML/, message: "⚠️ Medium: Potential XSS vulnerability in UI layer." },
        { pattern: /console\.log\(/, message: "💡 Info: Console logging detected. Consider production-grade logging." },
        { pattern: /\.innerHTML\s*=/, message: "⚠️ Medium: Direct innerHTML assignment detected. Potential XSS risk." },
    ];

    securityPatterns.forEach(p => {
        if (p.pattern.test(content)) securityInsights.push(p.message);
    });

    // 4. Architecture Layer Violation (Enterprise Standard)
    const architectureViolations: string[] = [];
    const isClientFile = content.includes('"use client"') || content.includes("'use client'");

    if (isClientFile) {
        if (content.includes('from "fs"') || content.includes('from "path"') || content.includes('from "crypto"')) {
            architectureViolations.push("❌ Arch: Server-side Node.js module imported in Client Component.");
        }
        if (content.includes('@/lib/db') || content.includes('prisma')) {
            architectureViolations.push("❌ Arch: Database access attempt detected in Client Component.");
        }
    }

    // 5. Performance Bottleneck Analysis
    const performanceBottlenecks: string[] = [];
    if (content.includes(".map(") && content.match(/\.map\([\s\S]*\.map\(/)) {
        performanceBottlenecks.push("🐢 Performance: Nested .map() loops detected (Potential O(n^2)).");
    }
    if (content.match(/for\s*\(.*\)\s*\{[\s\S]*await\s+/)) {
        performanceBottlenecks.push("🐢 Performance: Await inside loop detected. Consider Promise.all().");
    }
    if (content.includes("JSON.parse(") && content.length > 100000) {
        performanceBottlenecks.push("🐢 Performance: JSON.parse on large string detected. Consider streaming parser.");
    }

    // 6. Dependency Detection
    const dependencies: string[] = [];
    const importPatterns = {
        js: /import\s+.*\s+from\s+['"](.+)['"]/g,
        ts: /import\s+.*\s+from\s+['"](.+)['"]/g,
        py: /import\s+(.+)|from\s+(.+)\s+import/g,
        go: /import\s+\(\s*[^)]+\s*\)|import\s+['"](.+)['"]/g
    };

    const pattern = importPatterns[extension as keyof typeof importPatterns] || /import\s+['"](.+)['"]/g;
    let match;
    try {
        while ((match = pattern.exec(content)) !== null) {
            dependencies.push(match[1] || match[2] || "unknown");
        }
    } catch (e) {
        // Safe
    }

    // 7. Quality Score Calculation
    let score = 80;
    if (content.includes("/**") || content.includes('"""')) score += 5;
    if (content.includes("test") || content.includes("expect")) score += 10;

    if (securityInsights.some(s => s.includes("🚨"))) score -= 30;
    if (architectureViolations.length > 0) score -= 15;
    if (cyclomaticComplexity > 20) score -= 10;
    if (maxNesting > 5) score -= 5;
    if (lineCount > 1000) score -= 10;

    // 8. Technical Debt
    const technicalDebt: string[] = [];
    if (content.includes("TODO")) technicalDebt.push("Unresolved Technical Debt (TODO)");
    if (content.includes("FIXME")) technicalDebt.push("Critical Defect (FIXME)");
    if (cyclomaticComplexity > 15) technicalDebt.push("High Complexity Debt");
    if (lineCount > 500) technicalDebt.push("Large Component / Modularity issue");

    return {
        qualityScore: Math.max(0, Math.min(100, score)),
        securityInsights,
        documentationCoverage: (content.includes("/**") || content.includes("///")) ? 100 : 0,
        complexityMetrics: {
            cyclomaticComplexity,
            maintainabilityIndex: Math.max(0, 100 - (cyclomaticComplexity * 3)),
            halsteadVolume: content.length * 5,
            nestingDepth: maxNesting,
            readabilityIndex
        },
        onboardingEstimate: {
            timeToGrokMinutes: grokTime,
            difficulty
        },
        dependencies: Array.from(new Set(dependencies.slice(0, 50))),
        technicalDebt,
        architectureViolations,
        performanceBottlenecks
    };
}

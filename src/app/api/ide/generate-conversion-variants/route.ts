import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, formatError, validateBody } from "@/lib/api-utils";
import { getAICompletionWithDetailedError } from "@/lib/ai";

const BRIEF_MAX_LENGTH = 1500;
const AUDIENCE_MAX_LENGTH = 160;

const requestSchema = z
    .object({
        brief: z.string().trim().min(10).max(BRIEF_MAX_LENGTH),
        audience: z.string().trim().min(3).max(AUDIENCE_MAX_LENGTH).optional(),
        goal: z.enum(["signups", "book-demo", "trial-start", "checkout"]).default("signups"),
        trafficTemperature: z.enum(["cold", "warm", "hot"]).default("warm"),
        offerType: z.enum(["free-trial", "demo", "consultation", "discount", "waitlist"]).optional(),
    })
    .strict();

const variantSchema = z
    .object({
        id: z.string().trim().min(1).max(40),
        angle: z.string().trim().min(3).max(120),
        headline: z.string().trim().min(8).max(140),
        subheadline: z.string().trim().min(8).max(240),
        cta: z.string().trim().min(2).max(40),
        supportingBullets: z.array(z.string().trim().min(6).max(120)).min(2).max(3).optional(),
    })
    .strict();

const responseSchema = z
    .object({
        variants: z.array(variantSchema).min(3).max(5),
    })
    .strict();

function stripCodeFences(value: string): string {
    return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function normalizeSupportingBullets(bullets: string[] | undefined): string[] | undefined {
    if (!bullets || bullets.length === 0) {
        return undefined;
    }

    const normalized = Array.from(
        new Set(
            bullets
                .map((bullet) => bullet.replace(/\s+/g, " ").trim())
                .filter((bullet) => bullet.length > 0),
        ),
    ).slice(0, 3);

    return normalized.length >= 2 ? normalized : undefined;
}

function normalizeCtaText(value: string): string {
    return value
        .replace(/\s+/g, " ")
        .replace(/[.!?]+$/g, "")
        .trim();
}

function normalizeVariantIds(variants: z.infer<typeof variantSchema>[]): z.infer<typeof variantSchema>[] {
    const seen = new Set<string>();

    return variants.map((variant, index) => {
        const preferredId = variant.id.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
        const baseId = preferredId || `v${index + 1}`;
        let candidateId = baseId;
        let suffix = 2;

        while (seen.has(candidateId)) {
            candidateId = `${baseId}-${suffix}`.slice(0, 40);
            suffix += 1;
        }

        seen.add(candidateId);

        return {
            ...variant,
            id: candidateId,
            cta: normalizeCtaText(variant.cta),
            supportingBullets: normalizeSupportingBullets(variant.supportingBullets),
        };
    });
}

const MAX_AI_RESPONSE_CHARS = 20_000;

function sanitizePromptInput(value: string, maxLength: number): string {
    const normalized = value
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/```+/g, " ")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return normalized.slice(0, maxLength);
}

function redactProviderError(value: string | undefined): string | null {
    if (!value) {
        return null;
    }

    return sanitizePromptInput(value, 120);
}

function parseConversionVariantsResponse(content: string): z.infer<typeof responseSchema> {
    const normalizedContent = stripCodeFences(content);

    if (normalizedContent.length === 0 || normalizedContent.length > MAX_AI_RESPONSE_CHARS) {
        throw ApiErrors.serviceUnavailable("Conversion variant generator returned invalid JSON");
    }

    try {
        return responseSchema.parse(JSON.parse(normalizedContent));
    } catch {
        throw ApiErrors.serviceUnavailable("Conversion variant generator returned invalid JSON");
    }
}

const goalCtaKeywordMap: Record<z.infer<typeof requestSchema>["goal"], string[]> = {
    signups: ["sign up", "get started", "start"],
    "book-demo": ["book demo", "schedule demo", "request demo"],
    "trial-start": ["start trial", "free trial", "try"],
    checkout: ["buy", "checkout", "upgrade"],
};

function countGoalAlignedCtas(
    goal: z.infer<typeof requestSchema>["goal"],
    variants: z.infer<typeof variantSchema>[],
): number {
    const keywords = goalCtaKeywordMap[goal];

    return variants.filter((variant) => {
        const normalizedCta = variant.cta.trim().toLowerCase();
        return keywords.some((keyword) => normalizedCta.includes(keyword));
    }).length;
}

function countDistinctAngles(variants: z.infer<typeof variantSchema>[]): number {
    return new Set(variants.map((variant) => variant.angle.trim().toLowerCase())).size;
}

function countDistinctHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return new Set(variants.map((variant) => variant.headline.trim().toLowerCase())).size;
}

function countQuestionHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => variant.headline.trim().endsWith("?")).length;
}

function countUrgencyCtas(variants: z.infer<typeof variantSchema>[]): number {
    const urgencyKeywords = ["now", "today", "instant", "immediately", "limited"];

    return variants.filter((variant) => {
        const normalizedCta = variant.cta.trim().toLowerCase();
        return urgencyKeywords.some((keyword) => normalizedCta.includes(keyword));
    }).length;
}

function countLengthCompliantHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const length = variant.headline.trim().length;
        return length >= 20 && length <= 70;
    }).length;
}

function countDistinctCtaVerbs(variants: z.infer<typeof variantSchema>[]): number {
    const verbs = variants
        .map((variant) => variant.cta.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, "") ?? "")
        .filter((verb) => verb.length > 0);

    return new Set(verbs).size;
}

function countLengthCompliantCtas(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const length = variant.cta.trim().length;
        return length >= 6 && length <= 28;
    }).length;
}

function countPunctuationEndingCtas(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => /[.!?]$/.test(variant.cta.trim())).length;
}

function countNumericHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => /\d/.test(variant.headline)).length;
}

function countBenefitLedHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    const benefitKeywords = ["save", "faster", "reduce", "increase", "improve", "less", "more"];
    const benefitPattern = new RegExp(`\\b(${benefitKeywords.join("|")})\\b`, "i");

    return variants.filter((variant) => benefitPattern.test(variant.headline.trim())).length;
}

function countLengthCompliantSubheadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const length = variant.subheadline.trim().length;
        return length >= 40 && length <= 160;
    }).length;
}

function countBenefitLedSubheadlines(variants: z.infer<typeof variantSchema>[]): number {
    const benefitKeywords = ["save", "faster", "reduce", "increase", "improve", "less", "more", "without"];
    const benefitPattern = new RegExp(`\\b(${benefitKeywords.join("|")})\\b`, "i");

    return variants.filter((variant) => benefitPattern.test(variant.subheadline.trim())).length;
}

function countSocialProofMentions(variants: z.infer<typeof variantSchema>[]): number {
    const socialProofKeywords = ["teams", "customers", "trusted", "used by", "companies", "reviews"];
    const socialProofPattern = new RegExp(`\\b(${socialProofKeywords.join("|")})\\b`, "i");

    return variants.filter((variant) => {
        const combinedCopy = `${variant.headline} ${variant.subheadline}`.trim().toLowerCase();
        return socialProofPattern.test(combinedCopy);
    }).length;
}

function countOutcomeSubheadlines(variants: z.infer<typeof variantSchema>[]): number {
    const outcomeKeywords = ["outcome", "results", "pipeline", "revenue", "velocity", "time", "cost"];
    const outcomePattern = new RegExp(`\\b(${outcomeKeywords.join("|")})\\b`, "i");

    return variants.filter((variant) => {
        const normalizedSubheadline = variant.subheadline.trim().toLowerCase();
        return outcomePattern.test(normalizedSubheadline);
    }).length;
}

function countTrustAndOutcomeVariants(variants: z.infer<typeof variantSchema>[]): number {
    const socialProofKeywords = ["teams", "customers", "trusted", "used by", "companies", "reviews"];
    const outcomeKeywords = ["outcome", "results", "pipeline", "revenue", "velocity", "time", "cost"];
    const socialProofPattern = new RegExp(`\\b(${socialProofKeywords.join("|")})\\b`, "i");
    const outcomePattern = new RegExp(`\\b(${outcomeKeywords.join("|")})\\b`, "i");

    return variants.filter((variant) => {
        const combinedCopy = `${variant.headline} ${variant.subheadline}`.trim().toLowerCase();
        return socialProofPattern.test(combinedCopy) && outcomePattern.test(combinedCopy);
    }).length;
}

function countAudienceKeywordMentions(
    variants: z.infer<typeof variantSchema>[],
    audience: string | undefined,
): number {
    if (!audience) {
        return 0;
    }

    const audienceTerms = Array.from(
        new Set(
            audience
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .map((token) => token.trim())
                .filter((token) => token.length >= 4 && token.length <= 24),
        ),
    ).slice(0, 8);

    if (audienceTerms.length === 0) {
        return 0;
    }

    return variants.filter((variant) => {
        const combinedCopy = `${variant.headline} ${variant.subheadline}`.trim().toLowerCase();
        return audienceTerms.some((term) => combinedCopy.includes(term));
    }).length;
}

function countAudienceExplicitMentions(
    variants: z.infer<typeof variantSchema>[],
    audience: string | undefined,
): number {
    if (!audience) {
        return 0;
    }

    const normalizedAudience = sanitizePromptInput(audience, AUDIENCE_MAX_LENGTH).toLowerCase();
    if (normalizedAudience.length < 4) {
        return 0;
    }

    return variants.filter((variant) => {
        const combinedCopy = `${variant.headline} ${variant.subheadline}`.trim().toLowerCase();
        return combinedCopy.includes(normalizedAudience);
    }).length;
}

function countSecondPersonHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => /\byour\b|\byou\b/i.test(variant.headline.trim())).length;
}

function countExclamationHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const normalizedHeadline = variant.headline.trim().replace(/["'”’]+$/g, "");
        return /!$/.test(normalizedHeadline);
    }).length;
}

function countColonHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => variant.headline.includes(":")).length;
}

function countHyphenHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const normalizedHeadline = variant.headline.trim();
        return /\s-\s|\s–\s|\s—\s/.test(normalizedHeadline);
    }).length;
}

function countTitleCaseHeadlines(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const words = variant.headline.trim().split(/\s+/).filter((word) => /[a-zA-Z]/.test(word));
        if (words.length < 3) {
            return false;
        }

        const cappedWords = words.filter((word) => /^[A-Z]/.test(word));
        return cappedWords.length >= Math.ceil(words.length * 0.7);
    }).length;
}

function countFirstPersonPluralMentions(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const combinedCopy = `${variant.headline} ${variant.subheadline}`.trim();
        return /\bwe\b|\bour\b/i.test(combinedCopy);
    }).length;
}

function countCtaAudienceMentions(
    variants: z.infer<typeof variantSchema>[],
    audience: string | undefined,
): number {
    if (!audience) {
        return 0;
    }

    const audienceTerms = Array.from(
        new Set(
            sanitizePromptInput(audience, AUDIENCE_MAX_LENGTH)
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .map((token) => token.trim())
                .filter((token) => token.length >= 4 && token.length <= 24),
        ),
    ).slice(0, 6);

    if (audienceTerms.length === 0) {
        return 0;
    }

    return variants.filter((variant) => {
        const normalizedCta = variant.cta.trim().toLowerCase();
        return audienceTerms.some((term) => normalizedCta.includes(term));
    }).length;
}

function countActionVerbCtas(variants: z.infer<typeof variantSchema>[]): number {
    const actionVerbPattern = /^(start|get|book|schedule|try|buy|upgrade|request|see|create|launch)\b/i;

    return variants.filter((variant) => {
        const normalizedCta = variant.cta.trim().replace(/^[^a-z0-9]+/i, "");
        return actionVerbPattern.test(normalizedCta);
    }).length;
}

function countSingleWordCtas(variants: z.infer<typeof variantSchema>[]): number {
    return variants.filter((variant) => {
        const normalizedCta = variant.cta.trim().replace(/[^a-z0-9\s-]/gi, "");
        return normalizedCta.split(/\s+/).filter((token) => token.length > 0).length === 1;
    }).length;
}

function countBenefitBullets(variants: z.infer<typeof variantSchema>[]): number {
    const benefitKeywords = ["save", "faster", "reduce", "increase", "improve", "less", "more", "without"];
    const benefitPattern = new RegExp(`\\b(${benefitKeywords.join("|")})\\b`, "i");

    return variants.filter((variant) =>
        Boolean(
            variant.supportingBullets?.some((bullet) => {
                const normalizedBullet = bullet.trim().toLowerCase();
                return benefitPattern.test(normalizedBullet);
            }),
        ),
    ).length;
}

function countTrustReinforcedBenefitVariants(variants: z.infer<typeof variantSchema>[]): number {
    const socialProofKeywords = ["teams", "customers", "trusted", "used by", "companies", "reviews"];
    const socialProofPattern = new RegExp(`\\b(${socialProofKeywords.join("|")})\\b`, "i");
    const benefitKeywords = ["save", "faster", "reduce", "increase", "improve", "less", "more", "without"];
    const benefitPattern = new RegExp(`\\b(${benefitKeywords.join("|")})\\b`, "i");

    return variants.filter((variant) => {
        const combinedCopy = `${variant.headline} ${variant.subheadline}`.trim().toLowerCase();
        const hasTrustSignal = socialProofPattern.test(combinedCopy);
        const hasBenefitBullet = Boolean(
            variant.supportingBullets?.some((bullet) => benefitPattern.test(bullet.trim().toLowerCase())),
        );

        return hasTrustSignal && hasBenefitBullet;
    }).length;
}

async function logConversionVariantAuditEvent(params: {
    userId: string;
    action: "GENERATE_CONVERSION_VARIANTS" | "GENERATE_CONVERSION_VARIANTS_FAILED";
    details: Record<string, unknown>;
}): Promise<void> {
    try {
        const { logAudit } = await import("@/lib/audit-logger");
        await logAudit({
            userId: params.userId,
            action: params.action,
            entity: "IDE",
            entityId: params.userId,
            details: params.details,
        });
    } catch {
        // Non-blocking.
    }
}

export async function POST(req: NextRequest) {
    let userId: string | null = null;
    let failureAuditLogged = false;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        userId = session.user.id;

        await enforceRateLimit(session.user.id, "pro");

        const payload = await validateBody(req, requestSchema);

        const systemPrompt = [
            "You are a conversion copywriting strategist for SaaS websites.",
            "Return strict JSON only.",
            'Output shape: {"variants":[{"id":"v1","angle":"...","headline":"...","subheadline":"...","cta":"...","supportingBullets":["...","..."]}]}',
            "Generate 3 variants with clearly different angles.",
            "Do not repeat the same headline framing across variants.",
            "Mix headline styles across variants (statement/question/benefit-led) when natural.",
            "Keep headlines punchy and credible. Avoid hype and fake claims.",
            "Target headline length to roughly 20-70 characters for scan-friendly hero readability.",
            "Consider including a specific number in some headlines when it improves credibility.",
            "Include at least one benefit-led headline that states a clear practical outcome.",
            "Use second-person framing (you/your) in some headlines when it improves clarity.",
            "Use first-person plural framing (we/our) sparingly to reinforce credibility without sounding generic.",
            "Avoid excessive exclamation-style headlines unless strongly justified by context.",
            "Use colon-style headlines sparingly when they improve clarity (e.g., promise: mechanism).",
            "Use hyphen/em-dash headline structure sparingly when it improves scannability.",
            "Prefer sentence case headlines unless title case meaningfully improves readability.",
            "When useful, include 2-3 concise supportingBullets to increase trust and action intent.",
            "Keep subheadlines concise and scannable (roughly 40-160 characters).",
            "Include at least one subheadline that clearly communicates a practical benefit.",
            "Where credible, include social proof language (e.g., teams/customers/trusted indicators) without making unverifiable claims.",
            "Favor subheadlines that describe measurable outcomes when possible (time, cost, revenue, velocity).",
            "When possible, pair trust signals with practical value bullets in at least one variant."
        ].join("\n");

        const userPrompt = [
            `Brief: ${sanitizePromptInput(payload.brief, BRIEF_MAX_LENGTH)}`,
            `Primary goal: ${payload.goal}`,
            `Audience: ${sanitizePromptInput(payload.audience ?? "General product teams", AUDIENCE_MAX_LENGTH)}`,
            `Traffic temperature: ${payload.trafficTemperature}`,
            `Offer type: ${payload.offerType ?? "not specified"}`,
            "Return 3 conversion-oriented hero copy variants suitable for high-intent landing pages.",
            "Match CTA strength to traffic temperature and offer type.",
            "Ensure each CTA is explicitly aligned to the primary goal.",
            "Use urgency language sparingly, and only when it matches traffic temperature and offer intent.",
            "Vary CTA verb choices across variants to increase experiment learning value.",
            "Keep CTA length concise (roughly 6-28 characters) for button readability.",
            "Prefer CTA labels without ending punctuation for cleaner button UI.",
            "Prefer action-oriented CTA verbs (start/get/book/try/buy/upgrade) for clear intent.",
        ].join("\n");

        const aiResult = await getAICompletionWithDetailedError(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            {
                temperature: 0.4,
                maxTokens: 2048,
                jsonMode: true,
            },
        );

        if (!aiResult.success || !aiResult.data) {
            await logConversionVariantAuditEvent({
                userId: session.user.id,
                action: "GENERATE_CONVERSION_VARIANTS_FAILED",
                details: {
                    failureStage: "provider",
                    statusCode: 503,
                    code: "SERVICE_UNAVAILABLE",
                    providerError: redactProviderError(aiResult.error),
                },
            });
            failureAuditLogged = true;

            throw ApiErrors.serviceUnavailable("Conversion variant generator");
        }

        const parsed = parseConversionVariantsResponse(aiResult.data.content);
        const rawPunctuationEndingCtaCount = countPunctuationEndingCtas(parsed.variants);
        const normalizedVariants = normalizeVariantIds(parsed.variants);
        const validatedNormalizedResponse = responseSchema.parse({ variants: normalizedVariants });

        await logConversionVariantAuditEvent({
            userId: session.user.id,
            action: "GENERATE_CONVERSION_VARIANTS",
            details: {
                goal: payload.goal,
                trafficTemperature: payload.trafficTemperature,
                offerType: payload.offerType ?? null,
                hasAudience: Boolean(payload.audience),
                variantCount: validatedNormalizedResponse.variants.length,
                variantsWithBullets: validatedNormalizedResponse.variants.filter((variant) => Boolean(variant.supportingBullets?.length)).length,
                goalAlignedCtaCount: countGoalAlignedCtas(payload.goal, validatedNormalizedResponse.variants),
                distinctAngleCount: countDistinctAngles(validatedNormalizedResponse.variants),
                distinctHeadlineCount: countDistinctHeadlines(validatedNormalizedResponse.variants),
                questionHeadlineCount: countQuestionHeadlines(validatedNormalizedResponse.variants),
                urgencyCtaCount: countUrgencyCtas(validatedNormalizedResponse.variants),
                lengthCompliantHeadlineCount: countLengthCompliantHeadlines(validatedNormalizedResponse.variants),
                distinctCtaVerbCount: countDistinctCtaVerbs(validatedNormalizedResponse.variants),
                lengthCompliantCtaCount: countLengthCompliantCtas(validatedNormalizedResponse.variants),
                punctuationEndingCtaCount: rawPunctuationEndingCtaCount,
                numericHeadlineCount: countNumericHeadlines(validatedNormalizedResponse.variants),
                benefitLedHeadlineCount: countBenefitLedHeadlines(validatedNormalizedResponse.variants),
                lengthCompliantSubheadlineCount: countLengthCompliantSubheadlines(validatedNormalizedResponse.variants),
                benefitLedSubheadlineCount: countBenefitLedSubheadlines(validatedNormalizedResponse.variants),
                socialProofMentionCount: countSocialProofMentions(validatedNormalizedResponse.variants),
                outcomeSubheadlineCount: countOutcomeSubheadlines(validatedNormalizedResponse.variants),
                trustAndOutcomeVariantCount: countTrustAndOutcomeVariants(validatedNormalizedResponse.variants),
                audienceKeywordMentionCount: countAudienceKeywordMentions(validatedNormalizedResponse.variants, payload.audience),
                audienceExplicitMentionCount: countAudienceExplicitMentions(validatedNormalizedResponse.variants, payload.audience),
                secondPersonHeadlineCount: countSecondPersonHeadlines(validatedNormalizedResponse.variants),
                exclamationHeadlineCount: countExclamationHeadlines(validatedNormalizedResponse.variants),
                colonHeadlineCount: countColonHeadlines(validatedNormalizedResponse.variants),
                hyphenHeadlineCount: countHyphenHeadlines(validatedNormalizedResponse.variants),
                titleCaseHeadlineCount: countTitleCaseHeadlines(validatedNormalizedResponse.variants),
                firstPersonPluralMentionCount: countFirstPersonPluralMentions(validatedNormalizedResponse.variants),
                ctaAudienceMentionCount: countCtaAudienceMentions(validatedNormalizedResponse.variants, payload.audience),
                actionVerbCtaCount: countActionVerbCtas(validatedNormalizedResponse.variants),
                singleWordCtaCount: countSingleWordCtas(validatedNormalizedResponse.variants),
                benefitBulletVariantCount: countBenefitBullets(validatedNormalizedResponse.variants),
                trustReinforcedBenefitVariantCount: countTrustReinforcedBenefitVariants(validatedNormalizedResponse.variants),
            },
        });

        return NextResponse.json(
            validatedNormalizedResponse,
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        if (userId && !failureAuditLogged) {
            const formattedError = formatError(error);
            await logConversionVariantAuditEvent({
                userId,
                action: "GENERATE_CONVERSION_VARIANTS_FAILED",
                details: {
                    failureStage: "handler",
                    statusCode: formattedError.statusCode,
                    code: formattedError.code ?? null,
                },
            });
        }

        return errorResponse(error);
    }
}

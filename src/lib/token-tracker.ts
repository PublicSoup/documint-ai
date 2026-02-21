export async function trackTokenUsage(
    userId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    action: string
) {
    try {
        const totalTokens = inputTokens + outputTokens;

        // Persist as auditable event until dedicated usage table is introduced.
        const { logAudit } = await import("./audit-logger");
        await logAudit({
            userId,
            action: "TRACK_TOKENS",
            entity: "AI",
            entityId: model,
            details: {
                model,
                inputTokens,
                outputTokens,
                totalTokens,
                usageAction: action,
            },
        });
    } catch (error) {
        console.error("Failed to track token usage:", error);
        // Never fail primary request path because telemetry failed.
    }
}

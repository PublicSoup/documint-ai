import { db } from "./db";

export async function trackTokenUsage(
    userId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    action: string
) {
    try {
        // Log to database for analytics
        // Note: Real implementation would batch this or use a timeseries DB
        // For now, we update the user's daily usage stats if we had a table for it
        // Or just log to console/Redis

        console.log(`[TokenTracker] User:${userId} | Model:${model} | In:${inputTokens} | Out:${outputTokens} | Action:${action}`);

        // Example: Update a Redis counter (mocked here)
        // await redis.incrby(`usage:${userId}:tokens`, inputTokens + outputTokens);

    } catch (error) {
        console.error("Failed to track token usage:", error);
        // Don't fail the request just because tracking failed
    }
}

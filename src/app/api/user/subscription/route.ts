import { getUserSubscription } from "@/lib/subscription";
import { createApiHandler } from "@/lib/api-utils";

/**
 * GET /api/user/subscription
 * Returns the current subscription plan for the authenticated user.
 */
export const GET = createApiHandler({
    rateLimit: "api",
    handler: async ({ userId }) => {
        const { plan, isPro, isTeam, isActive } = await getUserSubscription(userId);
        return { plan, isPro, isTeam, isActive };
    },
});

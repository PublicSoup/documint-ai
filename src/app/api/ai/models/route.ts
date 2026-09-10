import { createApiHandler } from "@/lib/api-utils";
import { getModelCatalog, hasGatewayConfigured } from "@/lib/ai-model-catalog";

/**
 * Model catalog for the IDE chat model picker.
 * Returns the static Gemini (free/BYO-key) models plus, when an AI Gateway key
 * is configured on the deployment, every language model the gateway can reach.
 */
export const GET = createApiHandler({
    cacheControl: "private, max-age=300",
    handler: async () => {
        const models = await getModelCatalog();
        return { models, gateway: hasGatewayConfigured() };
    },
});

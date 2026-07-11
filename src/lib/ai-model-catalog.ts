import { createGateway } from "@ai-sdk/gateway";
import { env } from "./env";
import { AVAILABLE_MODELS } from "./ai-models";

/**
 * Server-side model catalog for the IDE chat.
 *
 * The static AVAILABLE_MODELS list only contains Gemini models (usable with the
 * shared GOOGLE_API_KEY or a BYO key). When an AI Gateway key is configured the
 * deployment can also reach every gateway model (OpenRouter-style catalog:
 * Nemotron, Llama, DeepSeek, ...), so we fetch that catalog dynamically and let
 * the picker offer it. Results are cached in module scope for 10 minutes.
 */

export interface CatalogModel {
    id: string;
    label: string;
    provider: string;
    tier: "free" | "gateway";
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const MODEL_ID_PATTERN = /^[a-z0-9-]+\/[\w.:-]+$/i;

let cachedGatewayModels: { fetchedAt: number; models: CatalogModel[] } | null = null;

export function hasGatewayConfigured(): boolean {
    // Explicit key, or Vercel OIDC (automatic on deployments; locally via the
    // VERCEL_OIDC_TOKEN that `vercel env pull` writes).
    return Boolean(env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

function providerLabelFromId(modelId: string): string {
    const prefix = modelId.split("/")[0] || "other";
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

async function fetchGatewayModels(): Promise<CatalogModel[]> {
    if (!hasGatewayConfigured()) return [];

    const now = Date.now();
    if (cachedGatewayModels && now - cachedGatewayModels.fetchedAt < CACHE_TTL_MS) {
        return cachedGatewayModels.models;
    }

    try {
        const gateway = env.AI_GATEWAY_API_KEY
            ? createGateway({ apiKey: env.AI_GATEWAY_API_KEY })
            : createGateway({}); // OIDC auth
        const { models } = await gateway.getAvailableModels();
        const languageModels = models
            .filter((model) => model.modelType == null || model.modelType === "language")
            .map((model) => ({
                id: model.id,
                label: model.name || model.id,
                provider: providerLabelFromId(model.id),
                tier: "gateway" as const,
            }))
            .sort((a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label));

        cachedGatewayModels = { fetchedAt: now, models: languageModels };
        return languageModels;
    } catch (error) {
        console.warn("[ai-model-catalog] Failed to fetch gateway models:", error instanceof Error ? error.message : error);
        // Keep serving a stale cache if we have one; otherwise report none.
        return cachedGatewayModels?.models ?? [];
    }
}

/** Full catalog: static Gemini models first, then gateway models (deduped). */
export async function getModelCatalog(): Promise<CatalogModel[]> {
    const staticModels: CatalogModel[] = AVAILABLE_MODELS.map((model) => ({ ...model }));
    const gatewayModels = await fetchGatewayModels();
    const staticIds = new Set(staticModels.map((model) => model.id));
    return [...staticModels, ...gatewayModels.filter((model) => !staticIds.has(model.id))];
}

/**
 * Whether a user-supplied model id may be sent to the AI layer.
 * Static Gemini ids are always allowed; anything else needs a configured
 * gateway. If the gateway catalog is reachable the id must be in it, otherwise
 * (catalog fetch failing) fall back to a shape check and let the gateway be
 * the authority — unknown models now surface a clear 404 message.
 */
export async function isModelAllowed(modelId: string): Promise<boolean> {
    if (AVAILABLE_MODELS.some((model) => model.id === modelId)) return true;
    if (!hasGatewayConfigured()) return false;
    if (!MODEL_ID_PATTERN.test(modelId)) return false;

    const gatewayModels = await fetchGatewayModels();
    if (gatewayModels.length === 0) return true; // catalog unavailable — defer to gateway
    return gatewayModels.some((model) => model.id === modelId);
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { getModelCatalog, hasGatewayConfigured } from "@/lib/ai-model-catalog";

/**
 * Model catalog for the IDE chat model picker.
 * Returns the static Gemini (free/BYO-key) models plus, when an AI Gateway key
 * is configured on the deployment, every language model the gateway can reach.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const models = await getModelCatalog();
        return NextResponse.json(
            { models, gateway: hasGatewayConfigured() },
            { headers: { "Cache-Control": "private, max-age=300" } },
        );
    } catch (error) {
        return errorResponse(error);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-utils";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    try {
        const clientIp = await getClientIP(request);
        await enforceRateLimit(`health:${clientIp}`, "api");

        return NextResponse.json(
            {
                status: "healthy",
                timestamp: new Date().toISOString(),
                uptimeSeconds: Math.floor(process.uptime()),
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    } catch (error) {
        return errorResponse(error);
    }
}

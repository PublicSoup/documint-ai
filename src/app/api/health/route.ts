
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-utils";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

// Initialize a separate Redis client for the health check to avoid import cycles
// and to have a dedicated connection for diagnostics.
const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

interface HealthStatus {
    status: "healthy" | "unhealthy";
    timestamp: string;
    uptimeSeconds: number;
    services: {
        database: "healthy" | "unhealthy" | "disabled";
        redis: "healthy" | "unhealthy" | "disabled";
    };
}

export async function GET(request: NextRequest) {
    try {
        const clientIp = await getClientIP(request);
        // Apply rate limiting before proceeding
        await enforceRateLimit(`health:${clientIp}`, "api");

        let dbStatus: "healthy" | "unhealthy" | "disabled" = "healthy";
        let redisStatus: "healthy" | "unhealthy" | "disabled" = redis ? "healthy" : "disabled";

        const serviceChecks: Promise<void>[] = [];

        // 1. Check Database Connectivity
        const dbCheck = db.$queryRaw`SELECT 1`.then(() => {
            dbStatus = "healthy";
        }).catch((e: Error) => {
            console.error("Database health check failed:", e);
            dbStatus = "unhealthy";
        });
        serviceChecks.push(dbCheck);

        // 2. Check Redis Connectivity
        if (redis) {
            const redisCheck = redis.ping().then((pong) => {
                if (pong === "PONG") {
                    redisStatus = "healthy";
                } else {
                    redisStatus = "unhealthy";
                }
            }).catch((e: Error) => {
                console.error("Redis health check failed:", e);
                redisStatus = "unhealthy";
            });
            serviceChecks.push(redisCheck);
        }

        // Wait for all checks to complete
        await Promise.all(serviceChecks);

        const overallStatus = dbStatus === "healthy" && (redisStatus === "healthy" || redisStatus === "disabled")
            ? "healthy"
            : "unhealthy";

        const response: HealthStatus = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            services: {
                database: dbStatus,
                redis: redisStatus,
            },
        };

        return NextResponse.json(response, {
            status: overallStatus === "healthy" ? 200 : 503,
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        });

    } catch (error) {
        // This will catch errors from enforceRateLimit or other unexpected issues
        return errorResponse(error);
    }
}

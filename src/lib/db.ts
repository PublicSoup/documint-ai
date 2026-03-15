import { PrismaClient } from "@prisma/client";
import { currentRuntime } from "./runtime";

declare global {
    var prisma: PrismaClient | undefined;
}

import { withAccelerate } from "@prisma/extension-accelerate";

const getPrismaClient = () => {
    // Determine if we should use Accelerate (Edge) or Standard client
    const useAccelerate = currentRuntime.runtimeName === 'cloudflare-workers' || process.env.DATABASE_URL?.startsWith('prisma://');

    if (useAccelerate) {
        // Injection point for edge-compatible DB client (Prisma Accelerate)
        // Ensure DATABASE_URL is set to a prisma:// accelerating URL in CF environment
        return new PrismaClient({
            log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
        }).$extends(withAccelerate());
    }

    return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
};

export const db = globalThis.prisma || getPrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prisma = db as PrismaClient;

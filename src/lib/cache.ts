import { Redis } from "@upstash/redis";

// Initialize Redis client (uses environment variable UPSTASH_REDIS_REST_URL)
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

// Cache configuration
export const CACHE_CONFIG = {
  // Analytics data is heavy to compute, cache for 5 minutes
  ANALYTICS_DATA: {
    ttl: 5 * 60, // 5 minutes
    prefix: "analytics"
  },
  // Team info rarely changes, cache for 30 minutes
  TEAM_INFO: {
    ttl: 30 * 60, // 30 minutes
    prefix: "team"
  }
} as const;

export interface CacheResult<T> {
  data: T;
  cachedAt: number;
}

/**
 * Get cached data, computing and caching if missing
 */
export async function getCached<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttl: number
): Promise<CacheResult<T>> {
  const cacheKey = `documint:${key}`;
  
  try {
    // Try to get from cache
    const cached = await redis.get<CacheResult<T>>(cacheKey);
    
    if (cached && Date.now() - cached.cachedAt < ttl * 1000) {
      return cached;
    }
  } catch (error) {
    // If Redis fails, fall through to compute
    console.warn("Cache read failed, computing fresh:", error);
  }
  
  // Compute fresh data
  const data = await computeFn();
  const cacheResult: CacheResult<T> = {
    data,
    cachedAt: Date.now()
  };
  
  try {
    // Cache with expiry
    await redis.setex(cacheKey, ttl, cacheResult);
  } catch (error) {
    console.warn("Cache write failed, returning fresh data:", error);
  }
  
  return cacheResult;
}

/**
 * Invalidate cache by key pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(`documint:${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn("Cache invalidation failed:", error);
  }
}

/**
 * Clear user's analytics cache when new activity happens
 */
export async function invalidateUserAnalyticsCache(userId: string, teamId?: string): Promise<void> {
  if (teamId) {
    await invalidateCache(`${CACHE_CONFIG.ANALYTICS_DATA.prefix}:${userId}:${teamId}`);
  }
  await invalidateCache(`${CACHE_CONFIG.ANALYTICS_DATA.prefix}:${userId}`);
}
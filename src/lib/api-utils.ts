import { NextRequest, NextResponse } from "next/server";
import { z, ZodSchema } from "zod";
import { getServerSession, Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireFeature, FeatureType } from "@/lib/feature-gate";
import { enforceRateLimit, type RateLimitTier } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-logger";
import { validateAdmin } from "@/lib/admin-auth";

/**
 * Standard API Error Response Format
 */
export interface ApiError {
    error: string;
    message: string;
    code?: string;
    details?: unknown;
    statusCode: number;
}

/**
 * Custom error class for API errors
 */
export class ApiException extends Error {
    statusCode: number;
    code?: string;
    details?: unknown;

    constructor(message: string, statusCode: number = 500, code?: string, details?: unknown) {
        super(message);
        this.name = "ApiException";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

/**
 * Common API error responses
 */
export const ApiErrors = {
    unauthorized: (message = "Unauthorized") =>
        new ApiException(message, 401, "UNAUTHORIZED"),

    forbidden: (message = "Forbidden") =>
        new ApiException(message, 403, "FORBIDDEN"),

    notFound: (resource = "Resource") =>
        new ApiException(`${resource} not found`, 404, "NOT_FOUND"),

    badRequest: (message = "Bad request", details?: unknown) =>
        new ApiException(message, 400, "BAD_REQUEST", details),

    conflict: (message = "Resource already exists") =>
        new ApiException(message, 409, "CONFLICT"),

    validationError: (errors: z.ZodIssue[]) =>
        new ApiException(
            "Validation failed",
            400,
            "VALIDATION_ERROR",
            { errors: errors.map(e => ({ path: e.path.join('.'), message: e.message })) }
        ),

    internalError: (message = "Internal server error") =>
        new ApiException(message, 500, "INTERNAL_ERROR"),

    serviceUnavailable: (service = "Service") =>
        new ApiException(`${service} is currently unavailable`, 503, "SERVICE_UNAVAILABLE"),

    paymentRequired: (message = "Payment required") =>
        new ApiException(message, 402, "PAYMENT_REQUIRED"),

    tooManyRequests: (message = "Rate limit exceeded. Please try again later.") =>
        new ApiException(message, 429, "TOO_MANY_REQUESTS"),
};

/**
 * Format error response
 */
export function formatError(error: unknown): ApiError {
    if (error instanceof ApiException) {
        return {
            error: error.name,
            message: error.message,
            code: error.code,
            details: error.details,
            statusCode: error.statusCode,
        };
    }

    if (error instanceof z.ZodError) {
        return formatError(ApiErrors.validationError(error.issues));
    }

    if (error instanceof Error) {
        // In development, expose the actual error message for generic Errors
        // In production, keep it generic for security
        const message = process.env.NODE_ENV !== "production" ? error.message : "Internal server error";
        return {
            error: "Error",
            message,
            statusCode: 500,
        };
    }

    return {
        error: "Unknown Error",
        message: "An unexpected error occurred",
        statusCode: 500,
    };
}

/**
 * Create error response
 */
export function errorResponse(error: unknown): NextResponse {
    const formatted = formatError(error);
    const details = formatted.statusCode >= 500 ? undefined : formatted.details;

    return NextResponse.json(
        {
            error: formatted.error,
            message: formatted.message,
            code: formatted.code,
            details,
        },
        { status: formatted.statusCode }
    );
}

/**
 * Create success response
 */
export function successResponse<T>(data: T, status = 200): NextResponse {
    return NextResponse.json(data, { status });
}


/**
 * Validate request body against Zod schema
 */
export async function validateBody<T>(
    request: Request,
    schema: z.ZodSchema<T>
): Promise<T> {
    try {
        const body = await request.json();
        return schema.parse(body);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw ApiErrors.validationError(error.issues);
        }
        throw ApiErrors.badRequest("Invalid JSON body");
    }
}

/**
 * Validate query params against Zod schema
 */
export function validateQuery<T>(
    searchParams: URLSearchParams,
    schema: z.ZodSchema<T>
): T {
    try {
        const params = Object.fromEntries(searchParams);
        return schema.parse(params);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw ApiErrors.validationError(error.issues);
        }
        throw ApiErrors.badRequest("Invalid query parameters");
    }
}

/**
 * How a route authenticates the caller:
 * - "user"  (default): requires a signed-in session; 401 otherwise.
 * - "admin": requires an admin session (via {@link validateAdmin}); 401/403 otherwise.
 * - "none":  public route; `session` is whatever getServerSession returned (may be null).
 */
type AuthMode = "user" | "admin" | "none";

interface ApiHandlerContext<TBody, TQuery, TParams> {
    body: TBody;
    query: TQuery;
    /** Validated dynamic route params (`{}` when no `paramsSchema` is provided). */
    params: TParams;
    /**
     * The authenticated session. Non-null for `auth: "user"` and `auth: "admin"`.
     * For `auth: "none"` it may be null at runtime — public handlers should not rely on it.
     */
    session: Session;
    /** Convenience accessor for `session.user.id` (empty string for anonymous "none" routes). */
    userId: string;
    request: NextRequest;
}

interface AuditContext<TBody, TQuery, TParams, TResponse> {
    body: TBody;
    query: TQuery;
    params: TParams;
    response: TResponse;
    userId: string;
    session: Session;
}

interface AuditConfig<TBody, TQuery, TParams, TResponse> {
    action: string;
    entity: string;
    entityId: (ctx: AuditContext<TBody, TQuery, TParams, TResponse>) => string;
    details?: (ctx: AuditContext<TBody, TQuery, TParams, TResponse>) => Record<string, unknown>;
}

interface ApiHandlerOptions<TBody, TQuery, TParams, TResponse> {
    auth?: AuthMode;
    feature?: FeatureType;
    rateLimit?: RateLimitTier | "none";
    bodySchema?: ZodSchema<TBody>;
    querySchema?: ZodSchema<TQuery>;
    paramsSchema?: ZodSchema<TParams>;
    audit?: AuditConfig<TBody, TQuery, TParams, TResponse>;
    cacheControl?: string;
    handler: (context: ApiHandlerContext<TBody, TQuery, TParams>) => Promise<TResponse>;
}

/** Next.js passes dynamic segments as the second handler argument (a Promise in Next 15+). */
type RouteContext = { params?: Promise<Record<string, string | string[]>> };

/**
 * Validate raw dynamic route params against a schema, mapping failures to a 400.
 */
async function validateParams<T>(
    routeContext: RouteContext | undefined,
    schema: ZodSchema<T>
): Promise<T> {
    const raw = routeContext?.params ? await routeContext.params : {};
    try {
        return schema.parse(raw);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw ApiErrors.validationError(error.issues);
        }
        throw ApiErrors.badRequest("Invalid route parameters");
    }
}

/**
 * Wraps a route handler with the cross-cutting concerns every API route shares:
 * feature gating, authentication, rate limiting, request validation, audit logging,
 * consistent error formatting, and cache headers.
 *
 * The handler may return plain data (serialized via {@link successResponse}) or a
 * pre-built `NextResponse` (streaming, redirects, custom content types), which is
 * passed through untouched.
 */
export function createApiHandler<TBody = unknown, TQuery = unknown, TParams = Record<string, never>, TResponse = unknown>(
    options: ApiHandlerOptions<TBody, TQuery, TParams, TResponse>
) {
    const authMode: AuthMode = options.auth ?? "user";

    return async (request: NextRequest, routeContext?: RouteContext) => {
        try {
            // 1. Feature Gate
            if (options.feature) {
                const gateError = await requireFeature(options.feature);
                if (gateError) return gateError;
            }

            // 2. Authentication
            let session: Session | null;
            if (authMode === "admin") {
                const adminCheck = await validateAdmin();
                if (!adminCheck.authorized) return adminCheck.response!;
                session = adminCheck.session;
            } else {
                session = await getServerSession(authOptions);
                if (authMode === "user" && !session?.user?.id) {
                    throw ApiErrors.unauthorized();
                }
            }
            const userId = session?.user?.id ?? "";

            // 3. Rate Limiting
            if (userId && options.rateLimit && options.rateLimit !== "none") {
                await enforceRateLimit(userId, options.rateLimit);
            }

            // 4. Validation
            const params = options.paramsSchema
                ? await validateParams(routeContext, options.paramsSchema)
                : ({} as TParams);
            const body = options.bodySchema ? await validateBody(request, options.bodySchema) : ({} as TBody);
            const query = options.querySchema ? validateQuery(request.nextUrl.searchParams, options.querySchema) : ({} as TQuery);

            // 5. Execute Handler
            const responseData = await options.handler({
                body,
                query,
                params,
                session: session as Session,
                userId,
                request,
            });

            // 6. Auditing (on success, for mutations)
            if (options.audit && request.method !== "GET" && request.method !== "HEAD") {
                try {
                    const auditCtx = { body, query, params, response: responseData, userId, session: session as Session };
                    await logAudit({
                        userId,
                        action: options.audit.action,
                        entity: options.audit.entity,
                        entityId: options.audit.entityId(auditCtx),
                        details: options.audit.details ? options.audit.details(auditCtx) : {},
                    });
                } catch (auditError) {
                    console.error("Non-blocking audit log failure:", auditError);
                }
            }

            // 7. Response: pass through a pre-built response, otherwise serialize.
            if (responseData instanceof NextResponse || responseData instanceof Response) {
                return responseData;
            }

            const response = successResponse(responseData);
            if (options.cacheControl) {
                response.headers.set("Cache-Control", options.cacheControl);
            }
            return response;

        } catch (error) {
            return errorResponse(error);
        }
    };
}

import { NextRequest, NextResponse } from "next/server";
import { z, ZodSchema } from "zod";
import { getServerSession, Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireFeature, FeatureType } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-logger";

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

interface ApiHandlerContext<TBody, TQuery> {
    body: TBody;
    query: TQuery;
    session: Session;
    request: NextRequest;
}

interface AuditConfig<TBody, TQuery, TResponse> {
    action: string;
    entity: string;
    entityId: (body: TBody, query: TQuery, response: TResponse) => string;
    details?: (body: TBody, query: TQuery, response: TResponse) => Record<string, unknown>;
}

interface ApiHandlerOptions<TBody, TQuery, TResponse> {
    feature?: FeatureType;
    rateLimit?: "chat" | "pro" | "api" | "none";
    bodySchema?: ZodSchema<TBody>;
    querySchema?: ZodSchema<TQuery>;
    audit?: AuditConfig<TBody, TQuery, TResponse>;
    cacheControl?: string;
    handler: (context: ApiHandlerContext<TBody, TQuery>) => Promise<TResponse>;
}

export function createApiHandler<TBody = unknown, TQuery = unknown, TResponse = unknown>(
    options: ApiHandlerOptions<TBody, TQuery, TResponse>
) {
    return async (request: NextRequest) => {
        try {
            // 1. Feature Gate
            if (options.feature) {
                const gateError = await requireFeature(options.feature);
                if (gateError) return gateError;
            }

            // 2. Authentication
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                throw ApiErrors.unauthorized();
            }

            // 3. Rate Limiting
            if (options.rateLimit && options.rateLimit !== "none") {
                await enforceRateLimit(session.user.id, options.rateLimit);
            }

            // 4. Validation
            const body = options.bodySchema ? await validateBody(request, options.bodySchema) : ({} as TBody);
            const query = options.querySchema ? validateQuery(request.nextUrl.searchParams, options.querySchema) : ({} as TQuery);

            // 5. Execute Handler
            const responseData = await options.handler({ body, query, session, request });

            // 6. Auditing (on success)
            if (options.audit && request.method !== 'GET' && request.method !== 'HEAD') {
                try {
                    await logAudit({
                        userId: session.user.id,
                        action: options.audit.action,
                        entity: options.audit.entity,
                        entityId: options.audit.entityId(body, query, responseData),
                        details: options.audit.details ? options.audit.details(body, query, responseData) : {},
                    });
                } catch (auditError) {
                    console.error("Non-blocking audit log failure:", auditError);
                }
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

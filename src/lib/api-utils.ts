import { NextResponse } from "next/server";
import { z } from "zod";

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
        return {
            error: "Error",
            message: error.message,
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
    console.error(`[API Error ${formatted.statusCode}]:`, formatted.message, formatted.details);

    return NextResponse.json(
        {
            error: formatted.error,
            message: formatted.message,
            code: formatted.code,
            details: formatted.details,
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
 * API route handler wrapper with automatic error handling
 */
export function withErrorHandling<T>(
    handler: () => Promise<T>
): Promise<NextResponse> {
    return handler()
        .then(data => successResponse(data))
        .catch(error => errorResponse(error));
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

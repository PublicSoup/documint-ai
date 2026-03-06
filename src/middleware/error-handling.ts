/**
 * Standardized error handling middleware for Next.js API routes
 * Provides consistent error responses across all endpoints
 */

import { NextRequest, NextResponse } from "next/server";

interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED", 
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE"
} as const;

export class StandardApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: keyof typeof ERROR_CODES,
    statusCode: number,
    details?: unknown
  ) {
    super(message);
    this.name = "StandardApiError";
    this.code = ERROR_CODES[code];
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: Error | StandardApiError | unknown
): NextResponse<StandardErrorResponse> {
  const timestamp = new Date().toISOString();
  
  if (error instanceof StandardApiError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        },
        timestamp
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    // Generic error - log but don't expose details
    console.error("Unhandled API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "An unexpected error occurred"
        },
        timestamp
      },
      { status: 500 }
    );
  }

  // Unknown error type
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "An unknown error occurred"
      },
      timestamp
    },
    { status: 500 }
  );
}

/**
 * Error handler middleware wrapper
 */
interface RouteParams {
  params?: {
    [key: string]: string | string[];
  };
}

export function withErrorHandling(
  handler: (request: NextRequest, params?: RouteParams) => Promise<NextResponse>
) {
  return async (request: NextRequest, params?: RouteParams): Promise<NextResponse> => {
    try {
      return await handler(request, params);
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}

/**
 * Quick error generators (compatible with existing ApiErrors)
 */
export const ApiErrors = {
  badRequest: (message: string, details?: unknown) =>
    new StandardApiError(message, "BAD_REQUEST", 400, details),
  unauthorized: (message: string = "Authentication required") =>
    new StandardApiError(message, "UNAUTHORIZED", 401),
  forbidden: (message: string = "Access denied") =>
    new StandardApiError(message, "FORBIDDEN", 403),
  notFound: (message: string = "Resource not found") =>
    new StandardApiError(message, "NOT_FOUND", 404),
  conflict: (message: string = "Conflict detected") =>
    new StandardApiError(message, "CONFLICT", 409),
  validationFailed: (message: string = "Validation failed", details?: unknown) =>
    new StandardApiError(message, "VALIDATION_FAILED", 422, details),
  rateLimited: (message: string = "Rate limit exceeded") =>
    new StandardApiError(message, "RATE_LIMITED", 429),
  internalError: (message: string = "Internal server error") =>
    new StandardApiError(message, "INTERNAL_ERROR", 500),
  serviceUnavailable: (message: string = "Service temporarily unavailable") =>
    new StandardApiError(message, "SERVICE_UNAVAILABLE", 503)
};
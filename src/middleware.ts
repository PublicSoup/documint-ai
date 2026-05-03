import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Define paths that do not require authentication
const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/api/auth',
    '/api/v1/analyze', // API key protected instead of session
    '/api/webhooks',
    '/api/health',
    '/_next',
    '/favicon.ico',
    '/public',
    '/og-image.png'
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Skip middleware for static assets and public paths
    if (publicPaths.some(path => pathname.startsWith(path)) || pathname === '/') {
        return NextResponse.next();
    }

    // 2. Authentication Check for /dashboard and most /api routes
    const isDashboard = pathname.startsWith('/dashboard');
    const isCode = pathname.startsWith('/code');
    const isProtectedApi = pathname.startsWith('/api/') && !publicPaths.some(p => pathname.startsWith(p));

    if (isDashboard || isCode || isProtectedApi) {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        
        if (!token) {
            // For API requests, return JSON error
            if (isProtectedApi) {
                return NextResponse.json(
                    { success: false, error: 'Authentication required' },
                    { status: 401 }
                );
            }
            
            // For page requests, redirect to login
            const url = new URL('/auth/login', request.url);
            url.searchParams.set('callbackUrl', encodeURI(request.url));
            return NextResponse.redirect(url);
        }
    }

    // 3. Set Security Headers
    const response = NextResponse.next();
    
    // Basic security headers
    response.headers.set('X-DNS-Prefetch-Control', 'on');
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'origin-when-cross-origin');
    
    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};

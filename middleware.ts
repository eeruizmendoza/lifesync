/**
 * Next.js Middleware: Security Headers & Compliance
 * Applied to all routes to enforce security policies
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  /**
   * SECURITY HEADERS
   * https://owasp.org/www-project-secure-headers/
   */

  // Content Security Policy
  // Prevents XSS attacks by restricting resource loading
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Relaxed for Next.js, tighten in production
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; ')
  );

  // Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection (legacy browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // HTTP Strict Transport Security
  // Force HTTPS for 1 year (31536000 seconds)
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // Referrer Policy
  // Don't leak referrer to external sites
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Feature Policy / Permissions Policy
  // Restrict browser features
  response.headers.set(
    'Permissions-Policy',
    [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()'
    ].join(', ')
  );

  // Disable FLoC (Federated Learning of Cohorts)
  response.headers.set('Permissions-Policy', 'interest-cohort=()');

  /**
   * COMPLIANCE HEADERS
   */

  // Indicate this server supports Security.txt
  response.headers.set('X-Security-Policy', '/.well-known/security.txt');

  // Custom header for application version (for monitoring)
  response.headers.set('X-App-Version', process.env.APP_VERSION || '1.0.0');

  // Disable caching for sensitive pages
  if (request.nextUrl.pathname.includes('/api/') ||
      request.nextUrl.pathname.includes('/admin/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

// Apply middleware to specific routes
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};

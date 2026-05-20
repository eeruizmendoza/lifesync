/**
 * LifeSync Authentication Middleware
 * Protects authenticated routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-key');

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth/send-code', '/api/auth/verify-code'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get('lifesync_token')?.value;

  // Redirect to login if no token
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Verify token
  try {
    // For now, we'll just verify the token exists
    // Full JWT verification can be added with the jose library
    return NextResponse.next();
  } catch (error) {
    // Invalid token - redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
